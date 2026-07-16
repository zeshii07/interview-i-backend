const { groq, model } = require('../config/gemini');

const ROLES = [
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Mobile Developer',
  'DevOps Engineer',
  'Data Scientist',
  'UI/UX Designer',
  'Product Manager',
];

const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'expert'];
const SUPPORTED_LANGUAGES = ['English', 'Urdu', 'Hindi', 'Arabic', 'Spanish', 'French', 'German'];
const QUESTION_CATEGORIES = ['technical', 'behavioral', 'situational'];

const DIFFICULTY_PROFILES = {
  beginner: {
    categoryWeights: { technical: 70, situational: 20, behavioral: 10 },
    description:
      'Entry-level. Test fundamental concepts, terminology, simple debugging, basic tools, and common day-to-day tasks. Assume limited professional experience.',
    technicalRules: [
      'Ask one focused foundational concept or small practical task.',
      'Avoid system design, advanced architecture, obscure edge cases, and advanced algorithms.',
      'Do not require leadership, production incident ownership, or years of experience.',
    ],
    situationalRules: [
      'Use a simple junior-level workplace situation with a clear, approachable response.',
      'Avoid high-stakes outages, organizational politics, and leadership dilemmas.',
    ],
    behavioralRules: [
      'Allow examples from study, projects, internships, volunteering, or teamwork.',
      'Do not assume full-time industry experience.',
    ],
    timeSuggested: 90,
  },
  intermediate: {
    categoryWeights: { technical: 60, situational: 25, behavioral: 15 },
    description:
      'Working-level. Test practical implementation, debugging, common trade-offs, collaboration, and realistic feature ownership.',
    technicalRules: [
      'Ask an applied technical question based on common professional work.',
      'Prefer debugging, testing, performance, implementation, or maintainability.',
      'Include ordinary trade-offs, but avoid staff-level architecture.',
    ],
    situationalRules: [
      'Use a realistic project scenario with moderate ambiguity.',
      'Focus on prioritization, communication, debugging, or delivery decisions.',
    ],
    behavioralRules: [
      'Focus on ownership, collaboration, learning, feedback, and normal project challenges.',
    ],
    timeSuggested: 120,
  },
  expert: {
    categoryWeights: { technical: 40, situational: 35, behavioral: 25 },
    description:
      'Senior or expert. Test architecture, deep trade-offs, scale, reliability, leadership, risk management, and complex decisions.',
    technicalRules: [
      'Ask an advanced architecture, scalability, security, reliability, or deep technical question.',
      'Require trade-off analysis and stated assumptions.',
    ],
    situationalRules: [
      'Use a complex realistic scenario involving ambiguity, scale, incidents, or cross-team decisions.',
      'Require prioritization, risk analysis, and communication.',
    ],
    behavioralRules: [
      'Focus on leadership, influence, difficult decisions, mentoring, conflict, or learning from failure.',
    ],
    timeSuggested: 150,
  },
};

function safeLanguage(language) {
  const requested = String(language || '').trim().toLowerCase();
  return SUPPORTED_LANGUAGES.find((item) => item.toLowerCase() === requested) || 'English';
}

function cleanJSON(text) {
  return String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
}

function parseJSONObject(text, label) {
  const cleaned = cleanJSON(text);

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} was not a JSON object.`);
    }
    return parsed;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {}
    }

    const error = new Error(`Invalid JSON returned for ${label}.`);
    error.publicMessage = 'The AI returned an invalid response. Please try again.';
    throw error;
  }
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function safeStringArray(value, maxItems = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function getGroqErrorMessage(error) {
  return String(
    error?.error?.error?.message ||
      error?.error?.message ||
      error?.message ||
      ''
  );
}

function ensureJsonInstruction(messages) {
  const safeMessages = Array.isArray(messages)
    ? messages.map((message) => ({
        role: message.role,
        content: String(message.content || ''),
      }))
    : [];

  const containsJson = safeMessages.some((message) => /\bjson\b/i.test(message.content));

  if (!containsJson) {
    safeMessages.unshift({
      role: 'system',
      content:
        'Return exactly one valid JSON object. Output JSON only. Do not include markdown, code fences, comments, or text outside the JSON object.',
    });
  }

  return safeMessages;
}

async function jsonCompletion({ messages, temperature, maxCompletionTokens }) {
  const request = {
    model,
    messages: ensureJsonInstruction(messages),
    temperature,
    max_completion_tokens: maxCompletionTokens,
    response_format: { type: 'json_object' },
  };

  try {
    return await groq.chat.completions.create(request);
  } catch (error) {
    const errorMessage = getGroqErrorMessage(error);

    if (error?.status === 400 && /max_completion_tokens/i.test(errorMessage)) {
      delete request.max_completion_tokens;
      request.max_tokens = maxCompletionTokens;
      return groq.chat.completions.create(request);
    }

    if (error?.status === 400 && /must contain the word ['"]?json/i.test(errorMessage)) {
      request.messages = [
        {
          role: 'system',
          content: 'You must return exactly one valid JSON object. Output JSON only.',
        },
        ...request.messages,
      ];
      return groq.chat.completions.create(request);
    }

    throw error;
  }
}

function weightedCategory(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let selection = Math.random() * total;

  for (const [category, weight] of entries) {
    selection -= weight;
    if (selection <= 0) return category;
  }

  return entries[0][0];
}

function selectQuestionCategory(difficulty, questionType) {
  if (questionType !== 'mixed' && QUESTION_CATEGORIES.includes(questionType)) {
    return questionType;
  }
  return weightedCategory(DIFFICULTY_PROFILES[difficulty].categoryWeights);
}

function categoryRules(profile, category) {
  if (category === 'technical') return profile.technicalRules;
  if (category === 'situational') return profile.situationalRules;
  return profile.behavioralRules;
}

function normalizeQuestionPayload(payload, category, difficulty, language, defaultTime) {
  const question = String(payload.question || '').trim();

  if (!question) {
    const error = new Error('Generated question was empty.');
    error.publicMessage = 'The AI could not generate a question. Please try again.';
    throw error;
  }

  return {
    question,
    category,
    difficulty,
    tips: safeStringArray(payload.tips, 3),
    what_interviewer_wants: String(payload.what_interviewer_wants || '').trim(),
    time_suggested: Math.round(
      clampNumber(payload.time_suggested, 45, 240, defaultTime)
    ),
    language,
  };
}

async function generateQuestion(
  role,
  difficulty,
  questionType = 'mixed',
  language = 'English',
  previousQuestions = []
) {
  const responseLanguage = safeLanguage(language);
  const profile = DIFFICULTY_PROFILES[difficulty];
  const category = selectQuestionCategory(difficulty, questionType);
  const rules = categoryRules(profile, category).map((rule) => `- ${rule}`).join('\n');
  const avoidBlock = previousQuestions.length
    ? `\nDo not repeat or closely paraphrase these recent questions:\n${previousQuestions
        .map((item, index) => `${index + 1}. ${item}`)
        .join('\n')}\n`
    : '';

  const prompt = `
Generate exactly ONE realistic interview question for a ${role} position.

Selected difficulty: ${difficulty}
Selected category: ${category}

Difficulty definition:
${profile.description}

Category-specific rules:
${rules}

Real-world interview rules:
- Test one main competency at a time.
- Match the daily responsibilities normally expected at this difficulty.
- Use clear wording and avoid unnecessary complexity.
- Do not combine unrelated questions.
- Do not use trick questions or trivia.
- Do not ask generic personal questions.
- For beginner candidates, never require senior experience.
- For technical questions, focus on role-relevant knowledge rather than behavioral storytelling.
${avoidBlock}

Language requirement:
Write all human-readable content entirely in ${responseLanguage}.
Keep JSON property names and category values in English.

Return exactly one valid JSON object:
{
  "question": "One question",
  "category": "${category}",
  "tips": ["Tip 1", "Tip 2", "Tip 3"],
  "what_interviewer_wants": "A concise explanation",
  "time_suggested": ${profile.timeSuggested}
}
`;

  try {
    const response = await jsonCompletion({
      messages: [
        {
          role: 'system',
          content:
            `You create fair, realistic interview questions at the exact requested seniority. ` +
            `You never make beginner questions senior-level. Respond in ${responseLanguage}. ` +
            `Return exactly one valid JSON object only.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature:
        difficulty === 'beginner' ? 0.45 : difficulty === 'intermediate' ? 0.55 : 0.65,
      maxCompletionTokens: 700,
    });

    const parsed = parseJSONObject(
      response.choices?.[0]?.message?.content,
      'interview question'
    );

    return normalizeQuestionPayload(
      parsed,
      category,
      difficulty,
      responseLanguage,
      profile.timeSuggested
    );
  } catch (error) {
    console.error('Error generating question:', error);
    if (error.publicMessage) throw error;
    const publicError = new Error('Failed to generate question.');
    publicError.publicMessage = 'Failed to generate an interview question. Please try again.';
    throw publicError;
  }
}

function inferQuestionCategory(question, providedCategory) {
  const normalized = String(providedCategory || '').trim().toLowerCase();
  if (QUESTION_CATEGORIES.includes(normalized)) return normalized;

  const value = String(question || '').toLowerCase();
  const behavioral = ['tell me about a time', 'describe a time', 'give an example', 'conflict', 'feedback'];
  const situational = ['what would you do', 'how would you handle', 'imagine', 'suppose', 'scenario'];

  if (behavioral.some((signal) => value.includes(signal))) return 'behavioral';
  if (situational.some((signal) => value.includes(signal))) return 'situational';
  return 'technical';
}

function normalizeEvaluation(payload, language) {
  const rating = clampNumber(payload.rating, 0, 10, 5);

  return {
    rating: Math.round(rating * 10) / 10,
    rating_max: 10,
    overall_feedback: String(payload.overall_feedback || '').trim(),
    strengths: safeStringArray(payload.strengths, 4),
    improvements: safeStringArray(payload.improvements, 4),
    structure_score: Math.round(clampNumber(payload.structure_score, 0, 10, rating)),
    content_score: Math.round(clampNumber(payload.content_score, 0, 10, rating)),
    communication_score: Math.round(
      clampNumber(payload.communication_score, 0, 10, rating)
    ),
    sample_answer: String(payload.sample_answer || '').trim(),
    follow_up_question: String(payload.follow_up_question || '').trim(),
    language,
  };
}

async function evaluateAnswer(
  role,
  difficulty,
  question,
  userAnswer,
  language = 'English',
  questionCategory
) {
  const responseLanguage = safeLanguage(language);
  const category = inferQuestionCategory(question, questionCategory);

  const methodGuidance =
    category === 'behavioral'
      ? 'Reward a clear example and logical STAR-style flow, but do not require the candidate to name STAR.'
      : category === 'situational'
        ? 'Reward a sensible step-by-step approach, prioritization, assumptions, and communication.'
        : 'Do not require STAR. Reward technical correctness, reasoning, examples, and clear explanation.';

  const difficultyGuidance = {
    beginner:
      'Judge against entry-level expectations. Reward correct fundamentals and partial understanding. Do not require senior depth.',
    intermediate:
      'Judge against working-level expectations. Expect practical reasoning, common trade-offs, and implementation awareness.',
    expert:
      'Judge against senior-level expectations. Expect depth, trade-offs, risks, assumptions, and strong decision-making.',
  }[difficulty];

  const prompt = `
Evaluate one interview answer for a ${role} position.

Difficulty: ${difficulty}
Question category: ${category}

Question:
"""
${question}
"""

Candidate answer:
"""
${userAnswer}
"""

Evaluation rules:
- ${difficultyGuidance}
- ${methodGuidance}
- Score only what is relevant to the question.
- Do not punish a concise answer merely for being concise.
- Identify specific strengths from the actual answer.
- Make improvements actionable and tied to missing or unclear content.
- Do not invent statements the candidate did not make.
- The sample answer must match the same difficulty.
- Keep feedback supportive, direct, and realistic.

Score meanings:
0-2: mostly incorrect, irrelevant, or missing
3-4: limited understanding with major gaps
5-6: acceptable foundation but incomplete
7-8: strong and job-ready for this difficulty
9-10: excellent, precise, and comprehensive

Language requirement:
Write every human-readable value in ${responseLanguage}.
Keep JSON property names unchanged and numeric scores as numbers.

Return exactly one valid JSON object:
{
  "rating": 7.0,
  "rating_max": 10,
  "overall_feedback": "Brief assessment",
  "strengths": ["Specific strength"],
  "improvements": ["Specific actionable improvement"],
  "structure_score": 7,
  "content_score": 7,
  "communication_score": 7,
  "sample_answer": "A realistic improved answer",
  "follow_up_question": "One natural follow-up"
}
`;

  try {
    const response = await jsonCompletion({
      messages: [
        {
          role: 'system',
          content:
            `You are a fair interview evaluator. Apply the requested difficulty exactly. ` +
            `Use the correct rubric for ${category} questions. Respond in ${responseLanguage}. ` +
            `Return exactly one valid JSON object only.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.25,
      maxCompletionTokens: 1600,
    });

    const parsed = parseJSONObject(
      response.choices?.[0]?.message?.content,
      'answer evaluation'
    );

    return normalizeEvaluation(parsed, responseLanguage);
  } catch (error) {
    console.error('Error evaluating answer:', error);
    if (error.publicMessage) throw error;
    const publicError = new Error('Failed to evaluate answer.');
    publicError.publicMessage = 'Failed to evaluate the answer. Please try again.';
    throw publicError;
  }
}

function normalizeAnalysis(payload, hasJobDescription) {
  const normalizeAreas = (value) =>
    Array.isArray(value)
      ? value
          .map((item) => ({
            area: String(item?.area || '').trim(),
            detail: String(item?.detail || '').trim(),
          }))
          .filter((item) => item.area && item.detail)
          .slice(0, 6)
      : [];

  const suggestions = Array.isArray(payload.suggestions)
    ? payload.suggestions
        .map((item) => ({
          type: ['add', 'rewrite', 'remove', 'reorder'].includes(
            String(item?.type || '').toLowerCase()
          )
            ? String(item.type).toLowerCase()
            : 'rewrite',
          section: String(item?.section || '').trim(),
          current: String(item?.current || '').trim(),
          suggested: String(item?.suggested || '').trim(),
          reason: String(item?.reason || '').trim(),
        }))
        .filter((item) => item.section && item.suggested && item.reason)
        .slice(0, 10)
    : [];

  return {
    overall_score: Math.round(clampNumber(payload.overall_score, 0, 100, 50)),
    summary: String(payload.summary || '').trim(),
    strengths: normalizeAreas(payload.strengths),
    weaknesses: normalizeAreas(payload.weaknesses),
    suggestions,
    ats_keywords: {
      present: safeStringArray(payload.ats_keywords?.present, 30),
      missing: hasJobDescription
        ? safeStringArray(payload.ats_keywords?.missing, 30)
        : [],
    },
    missing_sections: safeStringArray(payload.missing_sections, 10),
    ats_compatibility: Math.round(
      clampNumber(payload.ats_compatibility, 0, 100, 50)
    ),
    job_match_score: hasJobDescription
      ? Math.round(clampNumber(payload.job_match_score, 0, 100, 50))
      : null,
  };
}

async function analyzeResume(resumeText, jobDescription = '') {
  const hasJobDescription = Boolean(String(jobDescription || '').trim());

  const prompt = `
Analyze this resume as an ATS and career reviewer.

Resume:
"""
${resumeText}
"""

${
  hasJobDescription
    ? `Job description:\n"""\n${jobDescription}\n"""`
    : 'No job description was provided.'
}

Rules:
- Base every observation on visible resume content.
- Never invent achievements, skills, experience, or metrics.
- Use placeholders such as "[X%]" rather than fake numbers.
- Missing keywords must come from the supplied job description.
- If no job description is supplied, return an empty missing-keywords array and null job_match_score.
- Keep scores consistent with the written findings.
- Prioritize high-impact fixes.

Return exactly one valid JSON object:
{
  "overall_score": 75,
  "summary": "Two or three sentences",
  "strengths": [{ "area": "Area", "detail": "Evidence-based strength" }],
  "weaknesses": [{ "area": "Area", "detail": "Evidence-based weakness and fix" }],
  "suggestions": [
    {
      "type": "add|rewrite|remove|reorder",
      "section": "Section name",
      "current": "Short current text or empty string",
      "suggested": "Concrete improved wording or action",
      "reason": "Why it helps"
    }
  ],
  "ats_keywords": { "present": ["keyword"], "missing": ["keyword"] },
  "missing_sections": ["section"],
  "ats_compatibility": 70,
  "job_match_score": ${hasJobDescription ? '65' : 'null'}
}
`;

  try {
    const response = await jsonCompletion({
      messages: [
        {
          role: 'system',
          content:
            'You are a conservative, evidence-based resume reviewer. Return exactly one valid JSON object only. Never invent candidate information.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      maxCompletionTokens: 2600,
    });

    const parsed = parseJSONObject(
      response.choices?.[0]?.message?.content,
      'resume analysis'
    );

    return normalizeAnalysis(parsed, hasJobDescription);
  } catch (error) {
    console.error('Error analyzing resume:', error);
    if (error.publicMessage) throw error;
    const publicError = new Error('Failed to analyze resume.');
    publicError.publicMessage = 'Failed to analyze the resume. Please try again.';
    throw publicError;
  }
}

function buildDifficultyDistribution(count, requestedDifficulty) {
  if (requestedDifficulty !== 'mixed') {
    return Array.from({ length: count }, () => requestedDifficulty);
  }

  const result = [];
  for (let index = 0; index < count; index += 1) {
    const position = index % 10;
    result.push(position < 4 ? 'beginner' : position < 8 ? 'intermediate' : 'expert');
  }
  return result;
}

async function getQuestionBank(
  role,
  count = 10,
  difficulty = 'mixed',
  language = 'English'
) {
  const responseLanguage = safeLanguage(language);
  const distribution = buildDifficultyDistribution(count, difficulty);
  const counts = distribution.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {});

  const prompt = `
Generate exactly ${count} distinct interview questions for a ${role} position.

Difficulty counts:
- Beginner: ${counts.beginner || 0}
- Intermediate: ${counts.intermediate || 0}
- Expert: ${counts.expert || 0}

Rules:
- Approximately 60% technical, 25% situational, and 15% behavioral.
- Beginner questions must be mostly foundational technical questions.
- Do not make every question a scenario.
- Avoid generic personal questions and duplicate concepts.
- Match each question to its listed difficulty.

Language requirement:
Write human-readable content in ${responseLanguage}.
Keep JSON keys, type values, and difficulty values in English.

Return exactly one valid JSON object containing a questions array:
{
  "questions": [
    {
      "id": 1,
      "question": "Question text",
      "type": "technical|behavioral|situational",
      "difficulty": "beginner|intermediate|expert",
      "key_points": ["Point 1", "Point 2"],
      "common_mistakes": ["Mistake 1", "Mistake 2"]
    }
  ]
}
`;

  try {
    const response = await jsonCompletion({
      messages: [
        {
          role: 'system',
          content:
            `You create balanced, realistic interview question banks and respect seniority. ` +
            `Respond in ${responseLanguage}. Return exactly one valid JSON object containing a questions array.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.45,
      maxCompletionTokens: Math.min(5000, 500 + count * 260),
    });

    const parsed = parseJSONObject(
      response.choices?.[0]?.message?.content,
      'question bank'
    );

    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

    return questions
      .map((item, index) => ({
        id: index + 1,
        question: String(item?.question || '').trim(),
        type: QUESTION_CATEGORIES.includes(String(item?.type || '').toLowerCase())
          ? String(item.type).toLowerCase()
          : 'technical',
        difficulty: DIFFICULTY_LEVELS.includes(
          String(item?.difficulty || '').toLowerCase()
        )
          ? String(item.difficulty).toLowerCase()
          : distribution[index] || 'intermediate',
        key_points: safeStringArray(item?.key_points, 5),
        common_mistakes: safeStringArray(item?.common_mistakes, 5),
      }))
      .filter((item) => item.question)
      .slice(0, count);
  } catch (error) {
    console.error('Error generating question bank:', error);
    if (error.publicMessage) throw error;
    const publicError = new Error('Failed to generate question bank.');
    publicError.publicMessage = 'Failed to generate the question bank. Please try again.';
    throw publicError;
  }
}

module.exports = {
  generateQuestion,
  evaluateAnswer,
  analyzeResume,
  getQuestionBank,
  ROLES,
  DIFFICULTY_LEVELS,
};
