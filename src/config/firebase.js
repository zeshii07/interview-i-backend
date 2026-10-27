/**
 * Firebase Admin SDK initialization.
 *
 * Initializes a Firebase app using service account credentials from env
 * (FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL,
 * FIREBASE_ADMIN_PRIVATE_KEY) and exports the auth + database instances.
 *
 * If env vars are missing, we fall back to application-default credentials
 * (works on Render/Cloud Run where the runtime injects them automatically).
 */

const admin = require('firebase-admin');

let app;
try {
  if (admin.apps.length === 0) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      app = admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        databaseURL: process.env.FIREBASE_DATABASE_URL ||
          'https://hirely-8f434-default-rtdb.firebaseio.com',
      });
    } else {
      // Fallback to application-default credentials (Render, GCP)
      app = admin.initializeApp({
        databaseURL: process.env.FIREBASE_DATABASE_URL ||
          'https://hirely-8f434-default-rtdb.firebaseio.com',
      });
    }
  } else {
    app = admin.apps[0];
  }
} catch (err) {
  console.warn('[firebase config] init failed (will retry on first call):', err.message);
}

const database = app ? app.database() : null;

module.exports = { admin, database, app };
