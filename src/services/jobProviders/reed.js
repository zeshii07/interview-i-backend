/**
 * Reed.co.uk Jobs API.
 * Docs: https://www.reed.co.uk/developers/jobseeker
 * Free tier: no formal quota, rate-limited per IP.
 * Note: UK only.
 */

const axios = require('axios');
const BASE = 'https://www.reed.co.uk/api/1.0/search';

function deriveExperienceLevel(title = '') {
  const t = title.toLowerCase();
  if (['junior', 'entry', 'graduate', 'trainee'].some((k) => t.includes(k))) return 'entry';
  if (['senior', 'sr.', 'sr '].some((k) => t.includes(k))) return 'senior';
  if (['lead', 'staff', 'manager', 'head'].some((k) => t.includes(k))) return 'lead';
  if (['director', 'vp', 'chief', 'cto', 'ceo'].some((k) => t.includes(k))) return 'executive';
  return 'unspecified';
}

async function search(params) {
  const apiKey = process.env.REED_API_KEY;
  if (!apiKey) return [];

  const {
    query = '', location = '', remoteOnly = false,
    datePosted = null, jobType = null,
    salaryMin = null, salaryMax = null,
    resultsPerPage = 20,
  } = params;

  if (!query) return [];

  const searchParams = new URLSearchParams();
  searchParams.set('keywords', query);
  if (location) searchParams.set('locationName', location);
  searchParams.set('resultsToTake', String(Math.min(100, resultsPerPage)));

  if (remoteOnly) searchParams.set('workingFromHome', 'true');
  if (jobType === 'full_time') searchParams.set('fullTime', 'true');
  else if (jobType === 'part_time') searchParams.set('partTime', 'true');
  else if (jobType === 'contract') searchParams.set('contract', 'true');
  else if (jobType === 'temporary') searchParams.set('temporary', 'true');

  if (salaryMin) searchParams.set('minimumSalary', String(salaryMin));
  if (salaryMax) searchParams.set('maximumSalary', String(salaryMax));

  try {
    const resp = await axios.get(`${BASE}?${searchParams.toString()}`, {
      timeout: 12000,
      headers: { Accept: 'application/json' },
      auth: { username: apiKey, password: '' },
    });
    const results = Array.isArray(resp?.data?.results) ? resp.data.results : [];
    return results.map((r) => {
      const title = r.jobTitle || 'Untitled role';
      return {
        id: `reed:${r.jobId}`,
        provider: 'reed', providerLabel: 'Reed.co.uk',
        title, company: r.employerName || 'Unknown company',
        location: r.locationName || location || 'UK',
        isRemote: Boolean(r.workFromHome),
        description: r.jobDescription || '',
        url: r.jobUrl || null,
        postedAt: r.datePosted ? new Date(r.datePosted).toISOString() : null,
        salary: {
          min: r.minimumSalary ? Number(r.minimumSalary) : null,
          max: r.maximumSalary ? Number(r.maximumSalary) : null,
          currency: 'GBP', predicted: false,
        },
        experienceLevel: deriveExperienceLevel(title),
        contractType: r.jobType || null,
        raw: { source: 'reed', id: r.jobId },
      };
    });
  } catch (err) {
    console.warn('[reed] search failed:', err.response?.status, err.message);
    return [];
  }
}

module.exports = {
  id: 'reed', label: 'Reed.co.uk',
  isConfigured: () => Boolean(process.env.REED_API_KEY),
  search,
};
