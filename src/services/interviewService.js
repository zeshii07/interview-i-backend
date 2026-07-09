const { groq, model } = require('../config/gemini');

const ROLES = [
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Mobile Developer',
  'DevOps Engineer',
  'Data Scientist',
  'UI/UX Designer',
  'Product Manager'
];

const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'expert'];

// Helper to clean JSON response
function cleanJSON(text) {
  return text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
}

// Generate interview question
async function generateQuestion(role, difficulty, questionType = 'behavioral') {
  const prompt = `
You are an expert interview coach. Generate ONE interview question for a ${role} position.

Difficulty level: ${difficulty}
Question type: ${questionType} (behavioral, technical, or situational)

Return ONLY valid JSON in this exact format:
{
  "question": "The interview question here",
  "category": "behavioral",
  "tips": ["Tip 1", "Tip 2", "Tip 3"],
  "what_interviewer_wants": "What the interviewer is looking for",
  "time_suggested": 120
}

Do not include any text outside the JSON.
`;

  try {
    const response = await groq.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });
    
    const text = response.choices[0].message.content;
    return JSON.parse(cleanJSON(text));
  } catch (error) {
    console.error('Error generating question:', error);
    throw new Error('Failed to generate question');
  }
}

// Evaluate user's answer
async function evaluateAnswer(role, difficulty, question, userAnswer) {
  const prompt = `
You are an expert interview evaluator for ${role} positions.

The interview question was: "${question}"
Difficulty level: ${difficulty}

The candidate's answer: "${userAnswer}"

Evaluate the answer and return ONLY valid JSON:
{
  "rating": 7.5,
  "rating_max": 10,
  "overall_feedback": "Brief overall assessment of the answer",
  "strengths": ["Strength 1 - be specific", "Strength 2 - be specific"],
  "improvements": ["Improvement 1 - be specific and actionable", "Improvement 2 - be specific and actionable"],
  "structure_score": 8,
  "content_score": 7,
  "communication_score": 7,
  "sample_answer": "A strong example answer that demonstrates the STAR method",
  "follow_up_question": "A natural follow-up question based on their answer"
}

Scoring guidelines:
- Structure: Did they use STAR method or logical flow? (1-10)
- Content: Did they address the question properly? (1-10)
- Communication: Was it clear and concise? (1-10)

Do not include any text outside the JSON.
`;

  try {
    const response = await groq.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });
    
    const text = response.choices[0].message.content;
    return JSON.parse(cleanJSON(text));
  } catch (error) {
    console.error('Error evaluating answer:', error);
    throw new Error('Failed to evaluate answer');
  }
}

// Analyze resume
async function analyzeResume(resumeText, jobDescription = '') {
  const jdContext = jobDescription 
    ? `\n\nJob Description to compare against:\n"${jobDescription}"` 
    : '';

  const prompt = `
You are an expert resume analyzer and career coach.

Resume content:
"""
 ${resumeText}
"""
 ${jdContext}

Analyze the resume and return ONLY valid JSON:
{
  "overall_score": 75,
  "summary": "Brief 2-3 sentence overall assessment",
  "strengths": [
    {"area": "Area name", "detail": "Specific strength explanation"}
  ],
  "weaknesses": [
    {"area": "Area name", "detail": "Specific weakness and how to fix it"}
  ],
  "suggestions": [
    {
      "type": "add",
      "section": "Which section to modify",
      "current": "Current content if applicable",
      "suggested": "Suggested change",
      "reason": "Why this change helps"
    }
  ],
  "ats_keywords": {
    "present": ["keyword1", "keyword2"],
    "missing": ["keyword1", "keyword2"]
  },
  "missing_sections": ["section1"],
  "ats_compatibility": 70,
  "job_match_score": 65
}

If no job description provided, set job_match_score to null.
Do not include any text outside the JSON.
`;

  try {
    const response = await groq.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      response_format: { type: "json_object" }
    });
    
    const text = response.choices[0].message.content;
    return JSON.parse(cleanJSON(text));
  } catch (error) {
    console.error('Error analyzing resume:', error);
    throw new Error('Failed to analyze resume');
  }
}

// Get question bank for a role
async function getQuestionBank(role, count = 10) {
  const prompt = `
Generate ${count} interview questions for a ${role} position.

Mix of question types:
- 40% behavioral (STAR method questions)
- 40% technical (role-specific technical questions)
- 20% situational (hypothetical scenarios)

Return ONLY valid JSON array:
[
  {
    "id": 1,
    "question": "Question text",
    "type": "behavioral",
    "difficulty": "beginner",
    "key_points": ["Point 1", "Point 2"],
    "common_mistakes": ["Mistake 1", "Mistake 2"]
  }
]

Do not include any text outside the JSON array.
`;

  try {
    const response = await groq.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });
    
    const text = response.choices[0].message.content;
    // Groq wraps arrays in an object sometimes, let's handle it
    const parsed = JSON.parse(cleanJSON(text));
    return Array.isArray(parsed) ? parsed : parsed.questions || parsed.data || [parsed];
  } catch (error) {
    console.error('Error generating question bank:', error);
    throw new Error('Failed to generate question bank');
  }
}

module.exports = {
  generateQuestion,
  evaluateAnswer,
  analyzeResume,
  getQuestionBank,
  ROLES,
  DIFFICULTY_LEVELS
};