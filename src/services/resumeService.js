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
    config?.model ||
    config?.MODEL ||
    process.env.GROQ_MODEL ||
    'llama-3.3-70b-versatile'
  );
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeResumeInput(data) {
  return {
    firstName: cleanText(data.firstName),
    lastName: cleanText(data.lastName),
    email: cleanText(data.email),
    phone: cleanText(data.phone),
    location: cleanText(data.location),
    linkedin: cleanText(data.linkedin),
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
  };
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
      portfolio: original.portfolio,
      targetRole: original.targetRole,

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

  const prompt = `
You are an expert ATS resume writer.

Optimize the candidate's resume for the target role.

STRICT RULES:
1. Never invent employers, roles, projects, education, qualifications, skills, certifications, dates, metrics, achievements, or personal details.
2. Preserve the meaning of all factual information supplied by the candidate.
3. Improve grammar, clarity, professionalism, and ATS readability.
4. Rewrite experience bullets with strong action verbs.
5. Use job-description keywords only when supported by the candidate's existing information.
6. Do not add fake numbers or measurable outcomes.
7. Avoid first-person pronouns.
8. Avoid markdown, tables, columns, icons, emojis, and decorative symbols.
9. Keep each experience bullet concise.
10. Return one valid JSON object only, with no surrounding explanation.

Return exactly this structure:

{
  "resume": {
    "firstName": "",
    "lastName": "",
    "email": "",
    "phone": "",
    "location": "",
    "linkedin": "",
    "portfolio": "",
    "targetRole": "",
    "summary": "",
    "experience": [
      {
        "role": "",
        "company": "",
        "location": "",
        "duration": "",
        "points": [""]
      }
    ],
    "education": [
      {
        "degree": "",
        "institution": "",
        "location": "",
        "year": "",
        "gpa": ""
      }
    ],
    "skills": [""],
    "projects": [
      {
        "name": "",
        "technologies": "",
        "description": "",
        "points": [""]
      }
    ],
    "certifications": [
      {
        "name": "",
        "issuer": "",
        "year": ""
      }
    ]
  },
  "suggestions": [""]
}

Candidate information:

${JSON.stringify(sanitized, null, 2)}
`;

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
    max_tokens: 5000,
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
    const responseFormatRejected =
      error?.status === 400 &&
      /response_format|json_object/i.test(
        error?.message || error?.error?.message || ''
      );

    if (!responseFormatRejected) {
      throw error;
    }

    delete request.response_format;
    completion = await groq.chat.completions.create(request);
  }

  const content = completion?.choices?.[0]?.message?.content;
  const parsed = extractJson(content);

  return normalizeAiResult(sanitized, parsed);
}

module.exports = {
  generateOptimizedResume,
};
