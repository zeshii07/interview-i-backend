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
const CATEGORIES = ['technical', 'behavioral', 'situational'];

const PROFILES = {
  beginner: {
    weights: { technical: 70, situational: 20, behavioral: 10 },
    description: 'Entry-level: fundamentals, terminology, simple debugging, basic tools, and common daily tasks. Assume little professional experience.',
    technical: 'Ask one focused foundational concept or small practical task. Avoid architecture, advanced algorithms, obscure edge cases, and senior ownership.',
    situational: 'Use a simple junior-level situation with a clear response. Avoid outages, politics, leadership dilemmas, and organization-wide decisions.',
    behavioral: 'Allow examples from study, projects, internships, volunteering, or teamwork. Do not assume full-time industry experience.',
    time: 90,
    temperature: 0.45,
  },
  intermediate: {
    weights: { technical: 60, situational: 25, behavioral: 15 },
    description: 'Working-level: practical implementation, debugging, testing, common trade-offs, collaboration, and feature ownership.',
    technical: 'Ask an applied technical question about common professional work. Include at most one or two trade-offs; avoid staff-level architecture.',
    situational: 'Use a realistic project situation involving debugging, priorities, delivery, or communication, with moderate ambiguity.',
    behavioral: 'Focus on ownership, collaboration, feedback, learning, and ordinary project challenges.',
    time: 120,
    temperature: 0.55,
  },
  expert: {
    weights: { technical: 40, situational: 35, behavioral: 25 },
    description: 'Senior-level: architecture, scale, reliability, security, leadership, risk, and complex trade-offs.',
    technical: 'Ask an advanced architecture, scalability, security, reliability, or deep technical trade-off question.',
    situational: 'Use a complex scenario involving ambiguity, incidents, scale, or cross-team decisions.',
    behavioral: 'Focus on leadership, influence, mentoring, conflict, difficult decisions, or learning from failure.',
    time: 150,
    temperature: 0.65,
  },
};

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

function safeLanguage(language) {
  const requested = clean(language).toLowerCase();
  return SUPPORTED_LANGUAGES.find((item) => item.toLowerCase() === requested) || 'English';
}

function cleanJSON(text) {
  return String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
}

function parseObject(text, label) {
  const cleaned = cleanJSON(text);
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch {}
    }
    const error = new Error(`Invalid JSON for ${label}.`);
    error.publicMessage = 'The AI returned an invalid response. Please try again.';
    throw error;
  }
}

function strings(value, max = 8) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, max)
    : [];
}

function weightedCategory(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = Math.random() * total;
  for (const [category, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return category;
  }
  return entries[0][0];
}

function chooseCategory(difficulty, requestedType) {
  if (requestedType !== 'mixed' && CATEGORIES.includes(requestedType)) return requestedType;
  return weightedCategory(PROFILES[difficulty].weights);
}

async function jsonCompletion(messages, temperature, maxCompletionTokens) {
  const request = {
    model,
    messages,
    temperature,
    max_completion_tokens: maxCompletionTokens,
    response_format: { type: 'json_object' },
  };

  try {
    return await groq.chat.completions.create(request);
  } catch (error) {
    const unsupported = error?.status === 400 && /max_completion_tokens/i.test(error?.message || error?.error?.message || '');
    if (!unsupported) throw error;
    delete request.max_completion_tokens;
    request.max_tokens = maxCompletionTokens;
    return groq.chat.completions.create(request);
  }
}

async function generateQuestion(role, difficulty, questionType = 'mixed', language = 'English', previousQuestions = []) {
  const responseLanguage = safeLanguage(language);
  const profile = PROFILES[difficulty];
  const category = chooseCategory(difficulty, questionType);
  const recentBlock = previousQuestions.length
    ? `Do not repeat or closely paraphrase these recent questions:\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : '';

  const prompt = `
Generate exactly ONE realistic interview question for a ${role} position.

Difficulty: ${difficulty}
Category: ${category}
Difficulty definition: ${profile.description}
Category rule: ${profile[category]}

Rules:
- Test one main competency only.
- Match the daily responsibilities expected at this seniority.
- Use clear wording; avoid trick questions and trivia.
- Do not ask generic questions such as strengths, weaknesses, five-year plans, or "tell me about yourself".
- For beginner questions, never require senior experience or advanced architecture.
- For technical questions, focus on role-relevant knowledge rather than storytelling.
- For behavioral questions, examples may come from education or personal projects.
${recentBlock}

Write all human-readable values in ${responseLanguage}. Keep JSON keys and category in English.
Return only:
{
  "question": "One question",
  "category": "${category}",
  "tips": ["Tip 1", "Tip 2", "Tip 3"],
  "what_interviewer_wants": "Concise explanation",
  "time_suggested": ${profile.time}
}`;

  try {
    const response = await jsonCompletion([
      {
        role: 'system',
        content: `You create fair interview questions at the exact requested seniority. Never make beginner questions senior-level. Respond in ${responseLanguage} and return JSON only.`,
      },
      { role: 'user', content: prompt },
    ], profile.temperature, 700);

    const parsed = parseObject(response.choices?.[0]?.message?.content, 'question');
    if (!clean(parsed.question)) throw new Error('Empty question');

    return {
      question: clean(parsed.question),
      category,
      difficulty,
      tips: strings(parsed.tips, 3),
      what_interviewer_wants: clean(parsed.what_interviewer_wants),
      time_suggested: Math.round(clamp(parsed.time_suggested, 45, 240, profile.time)),
      language: responseLanguage,
    };
  } catch (error) {
    console.error('Error generating question:', error);
    if (error.publicMessage) throw error;
    const wrapped = new Error('Failed to generate question');
    wrapped.publicMessage = 'Failed to generate an interview question. Please try again.';
    throw wrapped;
  }
}

function inferCategory(question, provided) {
  const explicit = clean(provided).toLowerCase();
  if (CATEGORIES.includes(explicit)) return explicit;
  const value = clean(question).toLowerCase();
  if (['tell me about a time', 'describe a time', 'give an example', 'conflict', 'feedback'].some((s) => value.includes(s))) return 'behavioral';
  if (['what would you do', 'how would you handle', 'imagine', 'suppose', 'scenario'].some((s) => value.includes(s))) return 'situational';
  return 'technical';
}

async function evaluateAnswer(role, difficulty, question, userAnswer, language = 'English', questionCategory) {
  const responseLanguage = safeLanguage(language);
  const category = inferCategory(question, questionCategory);

  const rubric = category === 'technical'
    ? 'Do not require STAR. Reward correctness, reasoning, relevant examples, and clear explanation.'
    : category === 'situational'
      ? 'Reward a sensible step-by-step approach, priorities, assumptions, and communication.'
      : 'Reward a concrete example and logical STAR-style flow, but do not require the candidate to name STAR.';

  const level = {
    beginner: 'Judge against entry-level expectations. Reward correct fundamentals and partial understanding. Do not demand senior depth.',
    intermediate: 'Judge against working-level expectations. Expect practical reasoning and common trade-offs.',
    expert: 'Judge against senior expectations. Expect depth, risks, assumptions, trade-offs, and strong decisions.',
  }[difficulty];

  const prompt = `
Evaluate this ${role} interview answer.
Difficulty: ${difficulty}
Category: ${category}
Question: """${question}"""
Answer: """${userAnswer}"""

Rules:
- ${level}
- ${rubric}
- Score only what is relevant to the question.
- Do not punish a concise answer merely for being concise.
- Cite specific strengths from the answer and give actionable improvements.
- Do not invent claims.
- Keep the sample answer at the same difficulty.
- 5-6 means acceptable but incomplete; 7-8 means strong for this level; 9-10 is exceptional.

Write all human-readable values in ${responseLanguage}. Return only:
{
  "rating": 7.0,
  "rating_max": 10,
  "overall_feedback": "Assessment",
  "strengths": ["Specific strength"],
  "improvements": ["Actionable improvement"],
  "structure_score": 7,
  "content_score": 7,
  "communication_score": 7,
  "sample_answer": "Improved answer",
  "follow_up_question": "One follow-up"
}`;

  try {
    const response = await jsonCompletion([
      { role: 'system', content: `You are a fair interview evaluator. Apply ${difficulty} expectations and the correct rubric for ${category}. Respond in ${responseLanguage}.` },
      { role: 'user', content: prompt },
    ], 0.25, 1600);

    const parsed = parseObject(response.choices?.[0]?.message?.content, 'evaluation');
    const rating = clamp(parsed.rating, 0, 10, 5);

    return {
      rating: Math.round(rating * 10) / 10,
      rating_max: 10,
      overall_feedback: clean(parsed.overall_feedback),
      strengths: strings(parsed.strengths, 4),
      improvements: strings(parsed.improvements, 4),
      structure_score: Math.round(clamp(parsed.structure_score, 0, 10, rating)),
      content_score: Math.round(clamp(parsed.content_score, 0, 10, rating)),
      communication_score: Math.round(clamp(parsed.communication_score, 0, 10, rating)),
      sample_answer: clean(parsed.sample_answer),
      follow_up_question: clean(parsed.follow_up_question),
      language: responseLanguage,
    };
  } catch (error) {
    console.error('Error evaluating answer:', error);
    if (error.publicMessage) throw error;
    const wrapped = new Error('Failed to evaluate answer');
    wrapped.publicMessage = 'Failed to evaluate the answer. Please try again.';
    throw wrapped;
  }
}

async function analyzeResume(resumeText, jobDescription = '') {
  const hasJobDescription = Boolean(clean(jobDescription));
  const prompt = `
Analyze this resume conservatively and evidence-first.
Resume:\n"""${resumeText}"""
${hasJobDescription ? `Job description:\n"""${jobDescription}"""` : 'No job description was provided.'}

Rules:
- Base every observation on visible content; never invent skills, achievements, or experience.
- ATS compatibility reflects section clarity, chronology, text readability, and relevant keywords, not a guaranteed result from any employer ATS.
- Missing keywords must come only from the supplied job description.
- If suggesting metrics, use placeholders such as [X%], never fake numbers.
- If no job description exists, missing keywords must be [] and job_match_score must be null.
- Scores must match the written findings.
- Prioritize high-impact fixes.

Return only:
{
  "overall_score": 75,
  "summary": "Two or three sentences",
  "strengths": [{"area": "Area", "detail": "Evidence-based detail"}],
  "weaknesses": [{"area": "Area", "detail": "Evidence-based weakness and fix"}],
  "suggestions": [{"type": "add|rewrite|remove|reorder", "section": "Section", "current": "Short current text or empty", "suggested": "Concrete change", "reason": "Why it helps"}],
  "ats_keywords": {"present": ["keyword"], "missing": ["keyword from JD only"]},
  "missing_sections": ["section"],
  "ats_compatibility": 70,
  "job_match_score": ${hasJobDescription ? '65' : 'null'}
}`;

  try {
    const response = await jsonCompletion([
      { role: 'system', content: 'You are a conservative, evidence-based resume reviewer. Return JSON only and never invent information.' },
      { role: 'user', content: prompt },
    ], 0.2, 2600);

    const parsed = parseObject(response.choices?.[0]?.message?.content, 'resume analysis');
    const mapArea = (value, max) => Array.isArray(value)
      ? value.map((item) => ({ area: clean(item?.area), detail: clean(item?.detail) })).filter((item) => item.area && item.detail).slice(0, max)
      : [];

    return {
      overall_score: Math.round(clamp(parsed.overall_score, 0, 100, 50)),
      summary: clean(parsed.summary),
      strengths: mapArea(parsed.strengths, 6),
      weaknesses: mapArea(parsed.weaknesses, 6),
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.map((item) => ({
            type: ['add', 'rewrite', 'remove', 'reorder'].includes(clean(item?.type).toLowerCase()) ? clean(item.type).toLowerCase() : 'rewrite',
            section: clean(item?.section),
            current: clean(item?.current),
            suggested: clean(item?.suggested),
            reason: clean(item?.reason),
          })).filter((item) => item.section && item.suggested && item.reason).slice(0, 10)
        : [],
      ats_keywords: {
        present: strings(parsed.ats_keywords?.present, 30),
        missing: hasJobDescription ? strings(parsed.ats_keywords?.missing, 30) : [],
      },
      missing_sections: strings(parsed.missing_sections, 10),
      ats_compatibility: Math.round(clamp(parsed.ats_compatibility, 0, 100, 50)),
      job_match_score: hasJobDescription ? Math.round(clamp(parsed.job_match_score, 0, 100, 50)) : null,
    };
  } catch (error) {
    console.error('Error analyzing resume:', error);
    if (error.publicMessage) throw error;
    const wrapped = new Error('Failed to analyze resume');
    wrapped.publicMessage = 'Failed to analyze the resume. Please try again.';
    throw wrapped;
  }
}

function mixedDifficultyPlan(count, requested) {
  if (requested !== 'mixed') return Array.from({ length: count }, () => requested);
  return Array.from({ length: count }, (_, index) => {
    const position = index % 10;
    return position < 4 ? 'beginner' : position < 8 ? 'intermediate' : 'expert';
  });
}

async function getQuestionBank(role, count = 10, difficulty = 'mixed', language = 'English') {
  const responseLanguage = safeLanguage(language);
  const plan = mixedDifficultyPlan(count, difficulty);
  const counts = plan.reduce((acc, item) => ({ ...acc, [item]: (acc[item] || 0) + 1 }), {});

  const prompt = `
Generate exactly ${count} distinct interview questions for a ${role} position.
Difficulty counts: beginner ${counts.beginner || 0}, intermediate ${counts.intermediate || 0}, expert ${counts.expert || 0}.

Rules:
- Overall: about 60% technical, 25% situational, 15% behavioral.
- Beginner questions must be at least 70% foundational technical and must not assume senior experience.
- Intermediate questions should focus on implementation, debugging, testing, and common trade-offs.
- Expert questions may cover architecture, scale, reliability, leadership, and complex trade-offs.
- Do not make every question a scenario.
- Avoid generic personal questions and duplicate concepts.
- Each question tests one main competency.
- Write human-readable content in ${responseLanguage}; keep type and difficulty values in English.

Return one object:
{"questions":[{"id":1,"question":"Question","type":"technical|behavioral|situational","difficulty":"beginner|intermediate|expert","key_points":["Point"],"common_mistakes":["Mistake"]}]}`;

  try {
    const response = await jsonCompletion([
      { role: 'system', content: `You create balanced, real-world question banks and strictly respect seniority. Respond in ${responseLanguage}.` },
      { role: 'user', content: prompt },
    ], 0.45, Math.min(5000, 500 + count * 260));

    const parsed = parseObject(response.choices?.[0]?.message?.content, 'question bank');
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

    return questions.map((item, index) => {
      const type = clean(item?.type).toLowerCase();
      const level = clean(item?.difficulty).toLowerCase();
      return {
        id: index + 1,
        question: clean(item?.question),
        type: CATEGORIES.includes(type) ? type : 'technical',
        difficulty: DIFFICULTY_LEVELS.includes(level) ? level : (plan[index] || 'intermediate'),
        key_points: strings(item?.key_points, 5),
        common_mistakes: strings(item?.common_mistakes, 5),
      };
    }).filter((item) => item.question).slice(0, count);
  } catch (error) {
    console.error('Error generating question bank:', error);
    if (error.publicMessage) throw error;
    const wrapped = new Error('Failed to generate question bank');
    wrapped.publicMessage = 'Failed to generate the question bank. Please try again.';
    throw wrapped;
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
