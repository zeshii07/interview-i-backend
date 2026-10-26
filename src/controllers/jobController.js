/**
 * Job search controller.
 *
 * Exposes:
 *   POST /api/jobs/search         — aggregated search across providers
 *   GET  /api/jobs/providers      — list of configured/unconfigured providers
 *   GET  /api/jobs/health         — quick "is the search service up" check
 *
 * Validation rules:
 *   - query           : string, 1..200 chars, optional (one of query/skills required)
 *   - skills          : string[] max 20 items, each 1..60 chars
 *   - location        : string, 1..200 chars, optional
 *   - remoteOnly      : boolean, default false
 *   - datePosted      : enum ['24h', '7d', '30d'], optional
 *   - jobType         : enum ['full_time', 'part_time', 'contract', 'internship', 'temporary'], optional
 *   - salaryMin       : number 0..10_000_000, optional
 *   - salaryMax       : number 0..10_000_000, optional (must be >= salaryMin)
 *   - experienceLevels: string[] of allowed levels, optional
 *   - providers       : string[] of provider ids, optional
 *   - page            : number 1..100, default 1
 *   - resultsPerPage  : number 1..50, default 20
 */

const { searchJobs, listProviders } = require('../services/jobSearchService');

const ALLOWED_JOB_TYPES = new Set(['full_time', 'part_time', 'contract', 'internship', 'temporary']);
const ALLOWED_DATE_POSTED = new Set(['24h', '7d', '30d']);
const ALLOWED_EXPERIENCE = new Set(['entry', 'mid', 'senior', 'lead', 'executive', 'unspecified']);

function validateSearchRequest(body) {
  const errors = [];

  // At least one of query / skills must be present
  const hasQuery = typeof body.query === 'string' && body.query.trim().length > 0;
  const hasSkills = Array.isArray(body.skills) && body.skills.length > 0;
  if (!hasQuery && !hasSkills) {
    errors.push('Either `query` (job title or keyword) or `skills` (array) is required.');
  }

  if (typeof body.query === 'string' && body.query.length > 200) {
    errors.push('`query` must be 200 characters or fewer.');
  }
  if (typeof body.location === 'string' && body.location.length > 200) {
    errors.push('`location` must be 200 characters or fewer.');
  }

  if (typeof body.remoteOnly !== 'undefined' && typeof body.remoteOnly !== 'boolean') {
    errors.push('`remoteOnly` must be a boolean.');
  }

  if (body.datePosted && !ALLOWED_DATE_POSTED.has(body.datePosted)) {
    errors.push(`\`datePosted\` must be one of: ${[...ALLOWED_DATE_POSTED].join(', ')}.`);
  }

  if (body.jobType && !ALLOWED_JOB_TYPES.has(body.jobType)) {
    errors.push(`\`jobType\` must be one of: ${[...ALLOWED_JOB_TYPES].join(', ')}.`);
  }

  if (body.salaryMin !== undefined && body.salaryMin !== null) {
    const n = Number(body.salaryMin);
    if (Number.isNaN(n) || n < 0 || n > 10_000_000) {
      errors.push('`salaryMin` must be a number between 0 and 10,000,000.');
    }
  }
  if (body.salaryMax !== undefined && body.salaryMax !== null) {
    const n = Number(body.salaryMax);
    if (Number.isNaN(n) || n < 0 || n > 10_000_000) {
      errors.push('`salaryMax` must be a number between 0 and 10,000,000.');
    }
  }
  if (
    body.salaryMin !== undefined && body.salaryMin !== null &&
    body.salaryMax !== undefined && body.salaryMax !== null &&
    Number(body.salaryMax) < Number(body.salaryMin)
  ) {
    errors.push('`salaryMax` must be greater than or equal to `salaryMin`.');
  }

  if (Array.isArray(body.experienceLevels)) {
    for (const lvl of body.experienceLevels) {
      if (!ALLOWED_EXPERIENCE.has(lvl)) {
        errors.push(`\`experienceLevels\` contains an invalid value: ${lvl}`);
      }
    }
  }

  if (Array.isArray(body.skills)) {
    if (body.skills.length > 20) {
      errors.push('`skills` must contain at most 20 items.');
    }
    for (const s of body.skills) {
      if (typeof s !== 'string' || s.length < 1 || s.length > 60) {
        errors.push('Each skill must be a string of 1..60 characters.');
      }
    }
  }

  if (Array.isArray(body.providers)) {
    for (const p of body.providers) {
      if (typeof p !== 'string') {
        errors.push('`providers` must be an array of strings.');
      }
    }
  }

  if (body.page !== undefined) {
    const p = Number(body.page);
    if (Number.isNaN(p) || p < 1 || p > 100) {
      errors.push('`page` must be between 1 and 100.');
    }
  }

  if (body.resultsPerPage !== undefined) {
    const r = Number(body.resultsPerPage);
    if (Number.isNaN(r) || r < 1 || r > 50) {
      errors.push('`resultsPerPage` must be between 1 and 50.');
    }
  }

  return errors;
}

exports.search = async (req, res) => {
  const errors = validateSearchRequest(req.body || {});
  if (errors.length) {
    return res.status(400).json({
      success: false,
      message: 'Invalid job search request.',
      errors,
    });
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
    return res.status(500).json({
      success: false,
      message: 'Job search failed. Please try again.',
    });
  }
};

exports.getProviders = (_req, res) => {
  return res.status(200).json({
    success: true,
    providers: listProviders(),
  });
};

exports.health = (_req, res) => {
  const providers = listProviders();
  const configured = providers.filter((p) => p.configured).length;
  return res.status(200).json({
    success: true,
    service: 'jobs',
    providersTotal: providers.length,
    providersConfigured: configured,
    configuredIds: providers.filter((p) => p.configured).map((p) => p.id),
  });
};
