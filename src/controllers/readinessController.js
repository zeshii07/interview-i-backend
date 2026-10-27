/**
 * Interview readiness controller.
 *
 * POST /api/interview/readiness
 *
 * Body:
 *   { userId: string }  OR  { sessions: [...] }
 *
 * If `sessions` is provided, we compute directly (mobile clients pass this
 * to skip the RTDB lookup round-trip).
 *
 * If only `userId` is provided, we fetch the user's interview history from
 * Firebase RTDB at users/{userId}/interviewHistory and compute from that.
 */

const { computeReadiness } = require('../services/readinessService');
const { get, ref } = require('firebase/database');
const { database } = require('../config/firebase');

exports.getReadiness = async (req, res) => {
  try {
    const { userId, sessions } = req.body || {};

    let sessionsToScore = sessions;

    // If sessions aren't provided, fetch from RTDB
    if (!Array.isArray(sessionsToScore) && userId) {
      const snapshot = await get(ref(database, `users/${userId}/interviewHistory`));
      const history = snapshot.val();
      sessionsToScore = history && typeof history === 'object'
        ? Object.values(history)
        : [];
    }

    if (!Array.isArray(sessionsToScore)) {
      sessionsToScore = [];
    }

    const result = computeReadiness(sessionsToScore);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('[readinessController.getReadiness] failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Could not compute readiness score.',
    });
  }
};
