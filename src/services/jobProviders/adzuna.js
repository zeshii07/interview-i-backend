/**
 * Adzuna Publisher API.
 * Docs: https://developer.adzuna.com/docs/search
 * Free tier: 1,000 requests / month per app id.
 *
 * Required env:
 *   ADZUNA_APP_ID
 *   ADZUNA_APP_KEY
 * Optional:
 *   ADZUNA_COUNTRY (default "us")
 */

const axios = require('axios');

const COUNTRY = (process.env.ADZUNA_COUNTRY || 'us').toLowerCase();
const BASE = `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search`;

const EXPERIENCE_KEYWORDS = {
  entry: ['junior', 'entry', 'graduate', 'intern', 'trainee', 'associate i', 'associate 1'],
  mid: ['mid', 'intermediate', 'associate ii', 'associate 2'],
  senior: ['senior', 'sr.', 'sr ', 'lead', 'staff', 'principal'],
  lead: ['lead', 'staff', 'manager', 'head of', 'principal'],
  executive: ['director', 'vp', 'vice president', 'cto', 'cio', 'ceo', 'chief', 'executive'],
};

function deriveExperienceLevel(title = '') {
  const t = title.toLowerCase();
  for (const [level, kws] of Object.entries(EXPERIENCE_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) return level;
  }
  return 'unspecified';
}

function derivePostedDate(created) {
  if (!created) return null;
  const d = new Date(created);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function search(params) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];

  const {
    query = '', location = '', remoteOnly = false,
    datePosted = null, jobType = null,
    salaryMin = null, salaryMax = null,
    page = 1, resultsPerPage = 20,
  } = params;

  const url = `${BASE}/${page}`;
  const searchParams = new URLSearchParams({
    app_id: appId, app_key: appKey,
    results_per_page: String(Math.min(50, resultsPerPage)),
    content_type: 'text',
  });

  if (query) searchParams.set('what', query);
  if (location) searchParams.set('where', location);
  if (remoteOnly || datePosted === '24h' || datePosted === '7d' || datePosted === '30d') {
    const days = datePosted === '24h' ? '1' : datePosted === '7d' ? '7' : datePosted === '30d' ? '30' : '7';
    searchParams.set('max_days_old', days);
  }

  if (jobType === 'full_time') searchParams.set('full_time', '1');
  else if (jobType === 'part_time') searchParams.set('part_time', '1');
  else if (jobType === 'contract') searchParams.set('contract', '1');
  else if (jobType === 'internship') searchParams.set('graduate', '1');

  if (salaryMin) searchParams.set('salary_min', String(salaryMin));
  if (salaryMax) searchParams.set('salary_max', String(salaryMax));

  try {
    const resp = await axios.get(`${url}?${searchParams.toString()}`, {
      timeout: 12000, headers: { Accept: 'application/json' },
    });
    const results = Array.isArray(resp?.data?.results) ? resp.data.results : [];
    return results.map((r) => ({
      id: `adzuna:${r.id || encodeURIComponent(r.url || '')}`,
      provider: 'adzuna', providerLabel: 'Adzuna',
      title: r.title || 'Untitled role',
      company: (r.company && (r.company.displayname || r.company.label)) || 'Unknown company',
      location: r.location && (r.location.displayname || r.location.area?.join(', ')) || location || 'Unspecified',
      isRemote: Boolean(r.description && /remote|wfh|work from home/i.test(r.description)),
      description: r.description || '',
      url: r.redirect_url || r.url || null,
      postedAt: derivePostedDate(r.created),
      salary: {
        min: r.salary_min || null, max: r.salary_max || null,
        currency: 'USD', predicted: Boolean(r.salary_is_predicted),
      },
      experienceLevel: deriveExperienceLevel(r.title),
      contractType: r.contract_time || null,
      raw: { source: 'adzuna', id: r.id },
    }));
  } catch (err) {
    console.warn('[adzuna] search failed:', err.response?.status, err.message);
    return [];
  }
}

module.exports = {
  id: 'adzuna', label: 'Adzuna',
  isConfigured: () => Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  search,
};
