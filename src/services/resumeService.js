const aiConfig = require('../config/gemini');

function resolveGroqClient(config) {
  if (config?.chat?.completions?.create) {
    return config;
  }

  if (config?.groq?.chat?.completions?.create) {
    return config.groq;
  }

  if (config?.client?.chat?.completions?.create) {
    return config.client;
  }

  throw new Error(
    'Groq client was not found in src/config/gemini.js. Export the client directly, or as { groq } or { client }.'
  );
}

function resolveModel(config) {
  return (
    process.env.GROQ_MODEL ||
    config?.model ||
    config?.MODEL ||
    'llama-3.1-8b-instant'
  );
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

const SUPPORTED_TEMPLATE_IDS = new Set(['ats-classic', 'corporate-professional', 'european-standard', 'technical-compact']);

function normalizeTemplateId(value) {
  const templateId = cleanText(value);
  return SUPPORTED_TEMPLATE_IDS.has(templateId) ? templateId : 'ats-classic';
}

function sanitizeResumeInput(data) {
  return {
    templateId: normalizeTemplateId(data.templateId),
    firstName: cleanText(data.firstName),
    lastName: cleanText(data.lastName),
    email: cleanText(data.email),
    phone: cleanText(data.phone),
    location: cleanText(data.location),
    linkedin: cleanText(data.linkedin),
    github: cleanText(data.github),
    portfolio: cleanText(data.portfolio),
    targetRole: cleanText(data.targetRole),
    jobDescription: cleanText(data.jobDescription),
    summary: cleanText(data.summary),

    experience: safeArray(data.experience)
      .slice(0, 10)
      .map((item) => ({
        role: cleanText(item?.role),
        company: cleanText(item?.company),
        location: cleanText(item?.location),
        duration: cleanText(item?.duration),
        points: safeArray(item?.points)
          .slice(0, 10)
          .map(cleanText)
          .filter(Boolean),
      }))
      .filter(
        (item) =>
          item.role ||
          item.company ||
          item.location ||
          item.duration ||
          item.points.length
      ),

    education: safeArray(data.education)
      .slice(0, 10)
      .map((item) => ({
        degree: cleanText(item?.degree),
        institution: cleanText(item?.institution),
        location: cleanText(item?.location),
        year: cleanText(item?.year),
        gpa: cleanText(item?.gpa),
      }))
      .filter(
        (item) =>
          item.degree ||
          item.institution ||
          item.location ||
          item.year ||
          item.gpa
      ),

    skills: safeArray(data.skills)
      .slice(0, 100)
      .map((skill) =>
        typeof skill === 'string'
          ? skill.trim()
          : cleanText(skill?.name)
      )
      .filter(Boolean),

    projects: safeArray(data.projects)
      .slice(0, 10)
      .map((item) => ({
        name: cleanText(item?.name),
        technologies: cleanText(item?.technologies),
        description: cleanText(item?.description),
        points: safeArray(item?.points)
          .slice(0, 10)
          .map(cleanText)
          .filter(Boolean),
      }))
      .filter(
        (item) =>
          item.name ||
          item.technologies ||
          item.description ||
          item.points.length
      ),

    certifications: safeArray(data.certifications)
      .slice(0, 20)
      .map((item) => {
        if (typeof item === 'string') {
          return {
            name: item.trim(),
            issuer: '',
            year: '',
          };
        }

        return {
          name: cleanText(item?.name),
          issuer: cleanText(item?.issuer),
          year: cleanText(item?.year),
        };
      })
      .filter((item) => item.name || item.issuer || item.year),

    customSections: safeArray(data.customSections)
      .slice(0, 10)
      .map((item) => ({
        title: cleanText(item?.title),
        content: cleanText(item?.content),
      }))
      .filter((item) => item.title && item.content),
  };
}

function createTextBudget(limit) {
  let remaining = limit;

  return (value, fieldLimit = 500) => {
    if (remaining <= 0) return '';

    const text = cleanText(value);
    const allowed = Math.min(fieldLimit, remaining);
    const result =
      text.length > allowed
        ? `${text.slice(0, Math.max(0, allowed - 1)).trimEnd()}…`
        : text;

    remaining -= result.length;
    return result;
  };
}

// Contact details are copied from the original request after optimization.
// Excluding them here and bounding editable text prevents oversized Groq calls.
function prepareResumeForAi(resume) {
  const take = createTextBudget(9000);

  return {
    targetRole: take(resume.targetRole, 180),
    jobDescription: take(resume.jobDescription, 2200),
    summary: take(resume.summary, 900),
    experience: resume.experience.slice(0, 8).map((item) => ({
      role: take(item.role, 160),
      company: take(item.company, 160),
      location: take(item.location, 120),
      duration: take(item.duration, 100),
      points: item.points.slice(0, 6).map((point) => take(point, 360)).filter(Boolean),
    })),
    education: resume.education.slice(0, 8).map((item) => ({
      degree: take(item.degree, 180),
      institution: take(item.institution, 180),
      location: take(item.location, 120),
      year: take(item.year, 80),
      gpa: take(item.gpa, 60),
    })),
    skills: resume.skills.slice(0, 60).map((skill) => take(skill, 80)).filter(Boolean),
    projects: resume.projects.slice(0, 8).map((item) => ({
      name: take(item.name, 160),
      technologies: take(item.technologies, 300),
      description: take(item.description, 500),
      points: item.points.slice(0, 5).map((point) => take(point, 320)).filter(Boolean),
    })),
    certifications: resume.certifications.slice(0, 15).map((item) => ({
      name: take(item.name, 180),
      issuer: take(item.issuer, 160),
      year: take(item.year, 80),
    })),
    customSections: resume.customSections.slice(0, 8).map((item) => ({
      title: take(item.title, 120),
      content: take(item.content, 600),
    })),
  };
}

function normalizeCustomSections(value) {
  return safeArray(value)
    .slice(0, 10)
    .map((item) => ({
      title: cleanText(item?.title),
      content: cleanText(item?.content),
    }))
    .filter((item) => item.title && item.content);
}

function extractJson(content) {
  if (typeof content !== 'string' || !content.trim()) {
    const error = new Error('AI returned an empty response.');
    error.code = 'INVALID_AI_RESPONSE';
    error.publicMessage =
      'The AI returned an empty response. Please try again.';
    throw error;
  }

  const cleaned = content
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      const error = new Error('AI response did not contain JSON.');
      error.code = 'INVALID_AI_RESPONSE';
      error.publicMessage =
        'The AI returned an invalid resume format. Please try again.';
      throw error;
    }

    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      const error = new Error('AI response contained invalid JSON.');
      error.code = 'INVALID_AI_RESPONSE';
      error.publicMessage =
        'The AI returned an invalid resume format. Please try again.';
      throw error;
    }
  }
}

function normalizeExperience(value) {
  return safeArray(value)
    .map((item) => ({
      role: cleanText(item?.role),
      company: cleanText(item?.company),
      location: cleanText(item?.location),
      duration: cleanText(item?.duration),
      points: safeArray(item?.points).map(cleanText).filter(Boolean),
    }))
    .filter(
      (item) =>
        item.role ||
        item.company ||
        item.location ||
        item.duration ||
        item.points.length
    );
}

function normalizeEducation(value) {
  return safeArray(value)
    .map((item) => ({
      degree: cleanText(item?.degree),
      institution: cleanText(item?.institution),
      location: cleanText(item?.location),
      year: cleanText(item?.year),
      gpa: cleanText(item?.gpa),
    }))
    .filter(
      (item) =>
        item.degree ||
        item.institution ||
        item.location ||
        item.year ||
        item.gpa
    );
}

function normalizeProjects(value) {
  return safeArray(value)
    .map((item) => ({
      name: cleanText(item?.name),
      technologies: Array.isArray(item?.technologies)
        ? item.technologies.map(cleanText).filter(Boolean).join(', ')
        : cleanText(item?.technologies),
      description: cleanText(item?.description),
      points: safeArray(item?.points).map(cleanText).filter(Boolean),
    }))
    .filter(
      (item) =>
        item.name ||
        item.technologies ||
        item.description ||
        item.points.length
    );
}

function normalizeCertifications(value) {
  return safeArray(value)
    .map((item) => {
      if (typeof item === 'string') {
        return {
          name: item.trim(),
          issuer: '',
          year: '',
        };
      }

      return {
        name: cleanText(item?.name),
        issuer: cleanText(item?.issuer),
        year: cleanText(item?.year),
      };
    })
    .filter((item) => item.name || item.issuer || item.year);
}

function normalizeAiResult(original, parsed) {
  if (!parsed?.resume || typeof parsed.resume !== 'object') {
    const error = new Error('AI response did not contain a resume object.');
    error.code = 'INVALID_AI_RESPONSE';
    error.publicMessage =
      'The AI returned an incomplete resume. Please try again.';
    throw error;
  }

  const aiResume = parsed.resume;

  return {
    resume: {
      // Personal/contact data is copied from user input, not trusted from AI.
      firstName: original.firstName,
      lastName: original.lastName,
      email: original.email,
      phone: original.phone,
      location: original.location,
      linkedin: original.linkedin,
      github: original.github,
      portfolio: original.portfolio,
      targetRole: original.targetRole,
      templateId: original.templateId,

      summary: cleanText(aiResume.summary),
      experience: normalizeExperience(aiResume.experience),
      education: normalizeEducation(aiResume.education),
      skills: safeArray(aiResume.skills)
        .map((skill) =>
          typeof skill === 'string'
            ? skill.trim()
            : cleanText(skill?.name)
        )
        .filter(Boolean),
      projects: normalizeProjects(aiResume.projects),
      certifications: normalizeCertifications(
        aiResume.certifications
      ),
      customSections: normalizeCustomSections(aiResume.customSections),
    },

    suggestions: safeArray(parsed.suggestions)
      .slice(0, 8)
      .map(cleanText)
      .filter(Boolean),
  };
}

async function generateOptimizedResume(resumeData) {
  const groq = resolveGroqClient(aiConfig);
  const model = resolveModel(aiConfig);
  const sanitized = sanitizeResumeInput(resumeData);
  const candidate = prepareResumeForAi(sanitized);

  const prompt = `Optimize this resume for ATS and its target role.
Preserve every fact. Never invent names, dates, tools, skills, metrics, employers, education, or achievements. Improve grammar and professional wording, use concise action-led bullets, and use job keywords only when supported. Do not use markdown or first-person language.
Return JSON only as {"resume":{"summary":"","experience":[{"role":"","company":"","location":"","duration":"","points":[""]}],"education":[{"degree":"","institution":"","location":"","year":"","gpa":""}],"skills":[""],"projects":[{"name":"","technologies":"","description":"","points":[""]}],"certifications":[{"name":"","issuer":"","year":""}],"customSections":[{"title":"","content":""}]},"suggestions":[""]}.
Keep the same supplied sections and items. Candidate data: ${JSON.stringify(candidate)}`;

  const request = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You optimize resumes without fabricating information and return valid JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.2,
    // Groq TPM includes input plus the requested completion allowance.
    max_completion_tokens: 2200,
  };

  // Groq supports JSON mode for compatible models. If your selected model
  // rejects this option, remove response_format and the JSON parser will still
  // handle fenced JSON responses.
  request.response_format = {
    type: 'json_object',
  };

  let completion;

  try {
    completion = await groq.chat.completions.create(request);
  } catch (error) {
    const errorMessage =
      error?.message || error?.error?.message || '';
    const responseFormatRejected =
      error?.status === 400 &&
      /response_format|json_object/i.test(
        errorMessage
      );

    if (responseFormatRejected) {
      delete request.response_format;
      completion = await groq.chat.completions.create(request);
    } else if (
      error?.status === 400 &&
      /max_completion_tokens/i.test(errorMessage)
    ) {
      request.max_tokens = request.max_completion_tokens;
      delete request.max_completion_tokens;
      completion = await groq.chat.completions.create(request);
    } else {
      if (
        error?.status === 413 ||
        /request too large|tokens per minute|TPM/i.test(errorMessage)
      ) {
        error.code = 'GROQ_TOKEN_LIMIT';
        error.publicMessage =
          'The resume contains too much text to optimize in one request. Shorten unusually long descriptions and try again.';
      }
      throw error;
    }
  }

  const content = completion?.choices?.[0]?.message?.content;
  const parsed = extractJson(content);

  return normalizeAiResult(sanitized, parsed);
}

module.exports = {
  generateOptimizedResume,
};
