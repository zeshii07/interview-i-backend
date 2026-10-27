/**
 * Jooble Publisher API.
 * Docs: https://jooble.org/api/about
 * Free tier: 1,000 requests / day per partner API key.
 */

const axios = require('axios');
const BASE = 'https://jooble.org/api';

const EXPERIENCE_KEYWORDS = {
  entry: ['junior', 'entry', 'graduate', 'intern', 'trainee'],
  mid: ['mid', 'intermediate'],
  senior: ['senior', 'sr.', 'sr '],
  lead: ['lead', 'staff', 'manager'],
  executive: ['director', 'vp', 'vice president', 'cto', 'cio', 'ceo', 'chief'],
};

function deriveExperienceLevel(title = '') {
  const t = title.toLowerCase();
  for (const [level, kws] of Object.entries(EXPERIENCE_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) return level;
  }
  return 'unspecified';
}

async function search(params) {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) return [];

  const {
    query = '', location = '', remoteOnly = false,
    datePosted = null, jobType = null,
    salaryMin = null, salaryMax = null,
    page = 1, resultsPerPage = 20,
  } = params;

  if (!query && !location) return [];

  const body = {
    keywords: query, location, page,
    resultsOnPage: Math.min(30, resultsPerPage),
  };

  if (datePosted === '24h') body.search_days = 1;
  else if (datePosted === '7d') body.search_days = 7;
  else if (datePosted === '30d') body.search_days = 30;

  if (remoteOnly) body.remote = true;
  if (jobType) body.workType = jobType;

  try {
    const resp = await axios.post(`${BASE}/${apiKey}`, body, {
      timeout: 12000,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
    const jobs = Array.isArray(resp?.data?.jobs) ? resp.data.jobs : [];
    return jobs.map((j) => {
      const title = j.title || 'Untitled role';
      const salaryText = j.salary || '';
      const salaryMatch = salaryText.match(/([\d,.]+)\s*[-–]\s*([\d,.]+)/);
      let salary = null;
      if (salaryMatch) {
        salary = {
          min: parseFloat(salaryMatch[1].replace(/[,.]/g, '')) || null,
          max: parseFloat(salaryMatch[2].replace(/[,.]/g, '')) || null,
          currency: 'USD', predicted: false,
        };
      }
      const description = j.snippet || j.description || '';
      const isRemote = Boolean(
        (j.type && /remote/i.test(j.type)) ||
        /remote|wfh|work from home/i.test(description) ||
        /remote/i.test(j.title || '')
      );
      return {
        id: `jooble:${j.id || encodeURIComponent(j.link || '')}`,
        provider: 'jooble', providerLabel: 'Jooble',
        title, company: j.company || 'Unknown company',
        location: j.location || location || 'Unspecified',
        isRemote, description,
        url: j.link || null,
        postedAt: j.updated ? new Date(j.updated).toISOString() : null,
        salary,
        experienceLevel: deriveExperienceLevel(title),
        contractType: j.type || null,
        raw: { source: 'jooble', id: j.id },
      };
    }).filter((job) => {
      if (salaryMin && (!job.salary || !job.salary.max || job.salary.max < salaryMin)) return false;
      if (salaryMax && (!job.salary || !job.salary.min || job.salary.min > salaryMax)) return false;
      return true;
    });
  } catch (err) {
    console.warn('[jooble] search failed:', err.response?.status, err.message);
    return [];
  }
}

module.exports = {
  id: 'jooble', label: 'Jooble',
  isConfigured: () => Boolean(process.env.JOOBLE_API_KEY),
  search,
};
