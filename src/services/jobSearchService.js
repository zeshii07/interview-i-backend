/**
 * Job search aggregator.
 *
 * 1. Calls every enabled provider in parallel.
 * 2. Normalizes the result shape (each provider module already does this).
 * 3. Dedupes by (title + company + location) — different providers can
 *    return the same posting, especially Jooble vs Adzuna for the same
 *    LinkedIn/Indeed backfill.
 * 4. Re-orders results by a relevance score that combines:
 *      - skills match (user-provided skills array)
 *      - remote-only preference
 *      - title similarity to the query
 *      - recency (newer = better)
 * 5. Caps total results at 100 to keep the response payload small.
 */

const { getEnabledProviders, PROVIDERS } = require('./jobProviders');

const MAX_RESULTS = 100;

/**
 * @param {object} params
 *   - query            : string
 *   - location         : string
 *   - remoteOnly       : boolean
 *   - datePosted       : '24h' | '7d' | '30d' | null
 *   - jobType          : 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | null
 *   - salaryMin        : number | null
 *   - salaryMax        : number | null
 *   - experienceLevels : string[] | null  (filter; if provided, jobs outside the set are dropped)
 *   - skills           : string[] | null  (boost/re-rank; "skills match")
 *   - providers        : string[] | null  (filter to specific provider ids)
 *   - page             : number
 *   - resultsPerPage   : number
 *
 * @returns {Promise<{ jobs: object[], providers: object[], total: number, errors: string[] }>}
 */
async function searchJobs(params = {}) {
  const {
    providers: requestedProviderIds = null,
  } = params;

  // Decide which providers to query
  let providersToCall = getEnabledProviders();
  if (Array.isArray(requestedProviderIds) && requestedProviderIds.length) {
    providersToCall = providersToCall.filter((p) => requestedProviderIds.includes(p.id));
  }

  // Surface a clear error if user explicitly requested providers but none
  // were configured / matched.
  const errors = [];
  const enabled = PROVIDERS.filter((p) => p.isConfigured());
  if (enabled.length === 0) {
    errors.push(
      'No job providers are configured on the server. Set ADZUNA_APP_ID/ADZUNA_APP_KEY, JOOBLE_API_KEY, REED_API_KEY, or USAJOBS_API_KEY + USAJOBS_USER_AGENT in your environment.'
    );
  } else if (
    Array.isArray(requestedProviderIds) &&
    requestedProviderIds.length &&
    providersToCall.length === 0
  ) {
    errors.push(
      `None of the requested providers (${requestedProviderIds.join(', ')}) are configured.`
    );
  }

  // Call all providers in parallel. Each provider swallows its own errors
  // and returns []. We collect per-provider status so the client can show
  // which sources were queried.
  const providerResults = await Promise.all(
    providersToCall.map(async (p) => {
      try {
        const jobs = await p.search(params);
        return { id: p.id, label: p.label, ok: true, count: jobs.length, jobs };
      } catch (err) {
        errors.push(`${p.label}: ${err.message || 'unknown error'}`);
        return { id: p.id, label: p.label, ok: false, count: 0, jobs: [] };
      }
    })
  );

  // Merge
  const allJobs = providerResults.flatMap((r) => r.jobs);

  // Dedupe — same title + company + first 20 chars of location
  const seen = new Set();
  const deduped = [];
  for (const job of allJobs) {
    const key = `${(job.title || '').toLowerCase().trim()}|${(job.company || '').toLowerCase().trim()}|${(job.location || '').toLowerCase().trim().slice(0, 20)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }

  // Filter by experience level (provider-derived heuristic)
  let filtered = deduped;
  if (Array.isArray(params.experienceLevels) && params.experienceLevels.length) {
    const wanted = new Set(params.experienceLevels.map((l) => l.toLowerCase()));
    filtered = filtered.filter((j) => j.experienceLevel === 'unspecified' || wanted.has(j.experienceLevel));
  }

  // Score & rank
  const scored = filtered.map((job) => ({
    ...job,
    matchScore: computeMatchScore(job, params),
  }));

  scored.sort((a, b) => b.matchScore - a.matchScore);

  const total = scored.length;
  const page = Math.max(1, params.page || 1);
  const perPage = Math.max(1, Math.min(50, params.resultsPerPage || 20));
  const start = (page - 1) * perPage;
  const jobs = scored.slice(start, start + perPage);

  return {
    jobs,
    total,
    page,
    resultsPerPage: perPage,
    providers: providerResults.map((r) => ({
      id: r.id,
      label: r.label,
      ok: r.ok,
      count: r.count,
    })),
    errors,
  };
}

function computeMatchScore(job, params) {
  let score = 50; // baseline

  // Skills match: +15 per matching skill in title or description
  if (Array.isArray(params.skills) && params.skills.length) {
    const haystack = `${job.title || ''} ${job.description || ''}`.toLowerCase();
    const lowerSkills = params.skills.map((s) => s.toLowerCase().trim()).filter(Boolean);
    let matched = 0;
    for (const s of lowerSkills) {
      if (haystack.includes(s)) matched += 1;
    }
    score += matched * 15;
    // Bonus if all skills matched
    if (matched > 0 && matched === lowerSkills.length) score += 20;
  }

  // Remote preference
  if (params.remoteOnly && job.isRemote) score += 10;

  // Title contains the query word
  if (params.query) {
    const q = params.query.toLowerCase().trim();
    const t = (job.title || '').toLowerCase();
    if (t.includes(q)) score += 25;
  }

  // Recency: postings within 7 days get +10, within 24h get +20
  if (job.postedAt) {
    const ageHours = (Date.now() - new Date(job.postedAt).getTime()) / (1000 * 60 * 60);
    if (ageHours <= 24) score += 20;
    else if (ageHours <= 24 * 7) score += 10;
  }

  // Salary transparency bonus (a posting with salary info is usually higher quality)
  if (job.salary && (job.salary.min || job.salary.max)) score += 5;

  return Math.round(score);
}

module.exports = {
  searchJobs,
  listProviders: () =>
    PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      configured: p.isConfigured(),
    })),
};
