const { searchJobs, listProviders } = require('../services/jobSearchService');

const ALLOWED_JOB_TYPES = new Set(['full_time', 'part_time', 'contract', 'internship', 'temporary']);
const ALLOWED_DATE_POSTED = new Set(['24h', '7d', '30d']);
const ALLOWED_EXPERIENCE = new Set(['entry', 'mid', 'senior', 'lead', 'executive', 'unspecified']);

function validateSearchRequest(body) {
  const errors = [];
  const hasQuery = typeof body.query === 'string' && body.query.trim().length > 0;
  const hasSkills = Array.isArray(body.skills) && body.skills.length > 0;
  if (!hasQuery && !hasSkills) {
    errors.push('Either `query` or `skills` is required.');
  }
  if (typeof body.query === 'string' && body.query.length > 200) errors.push('`query` must be 200 chars or fewer.');
  if (body.datePosted && !ALLOWED_DATE_POSTED.has(body.datePosted)) errors.push(`\`datePosted\` invalid: ${[...ALLOWED_DATE_POSTED].join(', ')}`);
  if (body.jobType && !ALLOWED_JOB_TYPES.has(body.jobType)) errors.push(`\`jobType\` invalid: ${[...ALLOWED_JOB_TYPES].join(', ')}`);
  if (Array.isArray(body.experienceLevels)) {
    for (const lvl of body.experienceLevels) {
      if (!ALLOWED_EXPERIENCE.has(lvl)) errors.push(`\`experienceLevels\` invalid: ${lvl}`);
    }
  }
  return errors;
}

exports.search = async (req, res) => {
  const errors = validateSearchRequest(req.body || {});
  if (errors.length) {
    return res.status(400).json({ success: false, message: 'Invalid request.', errors });
  }
  const params = {
    query: typeof req.body.query === 'string' ? req.body.query.trim() : '',
    location: typeof req.body.location === 'string' ? req.body.location.trim() : '',
    remoteOnly: Boolean(req.body.remoteOnly),
    datePosted: req.body.datePosted || null,
    jobType: req.body.jobType || null,
    salaryMin: req.body.salaryMin != null ? Number(req.body.salaryMin) : null,
    salaryMax: req.body.salaryMax != null ? Number(req.body.salaryMax) : null,
    experienceLevels: Array.isArray(req.body.experienceLevels) ? req.body.experienceLevels : null,
    skills: Array.isArray(req.body.skills) ? req.body.skills : null,
    providers: Array.isArray(req.body.providers) ? req.body.providers : null,
    page: req.body.page ? Number(req.body.page) : 1,
    resultsPerPage: req.body.resultsPerPage ? Number(req.body.resultsPerPage) : 20,
  };
  try {
    const result = await searchJobs(params);
    return res.status(200).json({
      success: true,
      jobs: result.jobs,
      total: result.total,
      page: result.page,
      resultsPerPage: result.resultsPerPage,
      providers: result.providers,
      errors: result.errors,
    });
  } catch (err) {
    console.error('[jobController.search] failed:', err);
    return res.status(500).json({ success: false, message: 'Job search failed.' });
  }
};

exports.getProviders = (_req, res) => {
  return res.status(200).json({ success: true, providers: listProviders() });
};

exports.health = (_req, res) => {
  const providers = listProviders();
  return res.status(200).json({
    success: true, service: 'jobs',
    providersTotal: providers.length,
    providersConfigured: providers.filter((p) => p.configured).length,
  });
};
