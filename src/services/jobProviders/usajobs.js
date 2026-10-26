/**
 * USAJobs.gov API (US federal government jobs).
 *
 * Docs: https://developer.usajobs.gov/APIRequest/Index
 * Free tier: no hard quota, but each request should include a User-Agent
 *            header identifying your application.
 *
 * Required env:
 *   USAJOBS_API_KEY
 *   USAJOBS_USER_AGENT  (e.g. "Hirely/1.0 (contact@hirely.app)")
 *
 * Note: Only returns US federal government jobs. Useful for users
 * searching for "government" or "public sector" roles, and as a
 * fallback when other providers are rate-limited (USAJobs has no quota).
 */

const axios = require('axios');

const BASE = 'https://data.usajobs.gov/api/Search';

function deriveExperienceLevel(title = '') {
  const t = title.toLowerCase();
  if (['entry', 'junior', 'trainee'].some((k) => t.includes(k))) return 'entry';
  if (['senior', 'lead', 'supervisory'].some((k) => t.includes(k))) return 'senior';
  if (['manager', 'supervisory', 'branch chief'].some((k) => t.includes(k))) return 'lead';
  if (['director', 'executive', 'chief', 'ses'].some((k) => t.includes(k))) return 'executive';
  return 'unspecified';
}

async function search(params) {
  const apiKey = process.env.USAJOBS_API_KEY;
  const userAgent = process.env.USAJOBS_USER_AGENT;

  if (!apiKey || !userAgent) return [];

  const {
    query = '',
    location = '',
    remoteOnly = false,
    datePosted = null,
    jobType = null,
    salaryMin = null,
    salaryMax = null,
    resultsPerPage = 20,
  } = params;

  const searchParams = new URLSearchParams();
  if (query) searchParams.set('Keyword', query);
  if (location) searchParams.set('LocationName', location);
  searchParams.set('ResultsPerPage', String(Math.min(500, resultsPerPage)));

  if (remoteOnly) searchParams.set('RemoteIndicator', 'true');
  if (jobType === 'full_time') searchParams.set('PositionScheduleTypeCode', '1');
  else if (jobType === 'part_time') searchParams.set('PositionScheduleTypeCode', '2');
  else if (jobType === 'internship') searchParams.set('PositionScheduleTypeCode', '3');

  if (datePosted === '24h') searchParams.set('DatePosted', '1');
  else if (datePosted === '7d') searchParams.set('DatePosted', '7');
  else if (datePosted === '30d') searchParams.set('DatePosted', '30');

  try {
    const resp = await axios.get(`${BASE}?${searchParams.toString()}`, {
      timeout: 12000,
      headers: {
        'Authorization-Key': apiKey,
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
    });

    const results = Array.isArray(resp?.data?.SearchResult?.SearchResultItems)
      ? resp.data.SearchResult.SearchResultItems
      : [];

    return results.map((item) => {
      const j = item.MatchedObjectDescriptor || {};
      const title = j.PositionTitle || 'Untitled role';
      const loc = j.PositionLocationDisplay || location || 'United States';
      const remuneration = j.PositionRemuneration?.[0] || {};
      const min = remuneration.MinimumRange ? Number(remuneration.MinimumRange) : null;
      const max = remuneration.MaximumRange ? Number(remuneration.MaximumRange) : null;

      // Apply salary filter (USAJobs has no server-side salary filter)
      if (salaryMin && (!max || max < salaryMin)) return null;
      if (salaryMax && (!min || min > salaryMax)) return null;

      return {
        id: `usajobs:${item.MatchedObjectId}`,
        provider: 'usajobs',
        providerLabel: 'USAJobs.gov',
        title,
        company: j.OrganizationName || 'U.S. Government',
        location: loc,
        isRemote: Boolean(j.PositionLocation?.some?.((l) => /remote/i.test(l.Description || ''))),
        description: j.QualificationSummary || j.UserArea?.Details?.JobSummary || '',
        url: j.PositionURI || null,
        postedAt: j.PublicationStartDate ? new Date(j.PublicationStartDate).toISOString() : null,
        salary: {
          min,
          max,
          currency: remuneration.CurrencyCode || 'USD',
          predicted: false,
        },
        experienceLevel: deriveExperienceLevel(title),
        contractType: j.PositionSchedule?.[0]?.Name || null,
        raw: { source: 'usajobs', id: item.MatchedObjectId },
      };
    }).filter(Boolean);
  } catch (err) {
    console.warn('[usajobs] search failed:', err.response?.status, err.message);
    return [];
  }
}

module.exports = {
  id: 'usajobs',
  label: 'USAJobs.gov',
  isConfigured: () => Boolean(process.env.USAJOBS_API_KEY && process.env.USAJOBS_USER_AGENT),
  search,
};
