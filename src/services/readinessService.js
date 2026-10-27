/**
 * Interview readiness service.
 *
 * Computes a weighted "readiness score" from a user's past interview
 * sessions. The formula is intentionally simple and explainable:
 *
 *   readiness = (avgScore / 10) * 100 * completionFactor * recencyFactor
 *
 * Where:
 *   - avgScore        : mean of session.averageScore (0..10), 0 if no sessions
 *   - completionFactor : 0.4 if 0 sessions, 0.7 if 1-2, 0.9 if 3-5, 1.0 if 6+
 *   - recencyFactor    : 1.0 if last session <7d, 0.8 if <30d, 0.6 if <90d, 0.4 otherwise
 *
 * The final score is on a 0-10 scale (rounded to 1 decimal place).
 *
 * The client can pass either a Firebase userId (we look up RTDB history
 * server-side) OR a direct array of sessions (mobile clients pass this
 * to avoid an extra round-trip).
 */

const { get, ref } = require('firebase/database');

function computeReadiness(sessions = []) {
  const valid = (Array.isArray(sessions) ? sessions : []).filter(
    (s) => s && (s.averageScore || s.feedback?.rating)
  );

  if (valid.length === 0) {
    return {
      score: null,
      maxScore: 10,
      interviewCount: 0,
      completionRate: 0,
      lastSessionAt: null,
      trend: 'no-data',
    };
  }

  const scores = valid.map((s) => Number(s.averageScore ?? s.feedback?.rating ?? 0));
  const avgScore = scores.reduce((sum, n) => sum + n, 0) / scores.length;

  // Completion factor — based on session count
  let completionFactor;
  if (valid.length === 0) completionFactor = 0.4;
  else if (valid.length <= 2) completionFactor = 0.7;
  else if (valid.length <= 5) completionFactor = 0.9;
  else completionFactor = 1.0;

  // Recency factor — based on most recent session timestamp
  const sortedByDate = [...valid].sort(
    (a, b) => new Date(b.updatedAt || b.timestamp || 0) - new Date(a.updatedAt || a.timestamp || 0)
  );
  const lastSession = sortedByDate[0];
  const lastSessionAt = lastSession?.updatedAt || lastSession?.timestamp || null;
  const lastDate = lastSessionAt ? new Date(lastSessionAt) : null;
  const daysSinceLast = lastDate
    ? (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  let recencyFactor;
  if (daysSinceLast < 7) recencyFactor = 1.0;
  else if (daysSinceLast < 30) recencyFactor = 0.8;
  else if (daysSinceLast < 90) recencyFactor = 0.6;
  else recencyFactor = 0.4;

  const score = Math.round((avgScore * completionFactor * recencyFactor) * 10) / 10;
  const clampedScore = Math.max(0, Math.min(10, score));

  // Trend — last 3 sessions compared to previous 3
  let trend = 'stable';
  if (valid.length >= 6) {
    const recent3 = scores.slice(0, 3);
    const prev3 = scores.slice(3, 6);
    const recentAvg = recent3.reduce((a, b) => a + b, 0) / 3;
    const prevAvg = prev3.reduce((a, b) => a + b, 0) / 3;
    if (recentAvg > prevAvg + 0.5) trend = 'improving';
    else if (recentAvg < prevAvg - 0.5) trend = 'declining';
  } else if (valid.length > 0) {
    trend = 'insufficient-data';
  }

  return {
    score: clampedScore,
    maxScore: 10,
    interviewCount: valid.length,
    completionRate: Math.min(1, valid.length / 10),
    lastSessionAt,
    avgScore: Math.round(avgScore * 10) / 10,
    trend,
  };
}

module.exports = {
  computeReadiness,
};
