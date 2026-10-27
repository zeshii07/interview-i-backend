/**
 * Job search aggregator — calls all enabled providers in parallel,
 * dedupes, scores by match, ranks, paginates.
 */

const { getEnabledProviders, PROVIDERS } = require('./jobProviders');
const MAX_RESULTS = 100;

async function searchJobs(params = {}) {
  const { providers: requestedProviderIds = null } = params;
  let providersToCall = getEnabledProviders();
  if (Array.isArray(requestedProviderIds) && requestedProviderIds.length) {
    providersToCall = providersToCall.filter((p) => requestedProviderIds.includes(p.id));
  }

  const errors = [];
  const enabled = PROVIDERS.filter((p) => p.isConfigured());
  if (enabled.length === 0) {
    errors.push('No job providers are configured on the server.');
  } else if (
    Array.isArray(requestedProviderIds) &&
    requestedProviderIds.length &&
    providersToCall.length === 0
  ) {
    errors.push(`None of the requested providers (${requestedProviderIds.join(', ')}) are configured.`);
  }

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

  const allJobs = providerResults.flatMap((r) => r.jobs);

  const seen = new Set();
  const deduped = [];
  for (const job of allJobs) {
    const key = `${(job.title || '').toLowerCase().trim()}|${(job.company || '').toLowerCase().trim()}|${(job.location || '').toLowerCase().trim().slice(0, 20)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }

  let filtered = deduped;
  if (Array.isArray(params.experienceLevels) && params.experienceLevels.length) {
    const wanted = new Set(params.experienceLevels.map((l) => l.toLowerCase()));
    filtered = filtered.filter((j) => j.experienceLevel === 'unspecified' || wanted.has(j.experienceLevel));
  }

  const scored = filtered.map((job) => ({ ...job, matchScore: computeMatchScore(job, params) }));
  scored.sort((a, b) => b.matchScore - a.matchScore);

  const total = scored.length;
  const page = Math.max(1, params.page || 1);
  const perPage = Math.max(1, Math.min(50, params.resultsPerPage || 20));
  const start = (page - 1) * perPage;
  const jobs = scored.slice(start, start + perPage);

  return {
    jobs, total, page, resultsPerPage: perPage,
    providers: providerResults.map((r) => ({ id: r.id, label: r.label, ok: r.ok, count: r.count })),
    errors,
  };
}

function computeMatchScore(job, params) {
  let score = 50;
  if (Array.isArray(params.skills) && params.skills.length) {
    const haystack = `${job.title || ''} ${job.description || ''}`.toLowerCase();
    const lowerSkills = params.skills.map((s) => s.toLowerCase().trim()).filter(Boolean);
    let matched = 0;
    for (const s of lowerSkills) if (haystack.includes(s)) matched += 1;
    score += matched * 15;
    if (matched > 0 && matched === lowerSkills.length) score += 20;
  }
  if (params.remoteOnly && job.isRemote) score += 10;
  if (params.query) {
    const q = params.query.toLowerCase().trim();
    const t = (job.title || '').toLowerCase();
    if (t.includes(q)) score += 25;
  }
  if (job.postedAt) {
    const ageHours = (Date.now() - new Date(job.postedAt).getTime()) / (1000 * 60 * 60);
    if (ageHours <= 24) score += 20;
    else if (ageHours <= 24 * 7) score += 10;
  }
  if (job.salary && (job.salary.min || job.salary.max)) score += 5;
  return Math.round(score);
}

module.exports = {
  searchJobs,
  listProviders: () => PROVIDERS.map((p) => ({ id: p.id, label: p.label, configured: p.isConfigured() })),
};
