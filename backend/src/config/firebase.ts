/**
 * firebase.ts — Firebase Admin SDK initialisation
 *
 * The service account JSON is stored as a base64-encoded env var
 * (FIREBASE_SERVICE_ACCOUNT_B64) so it never has to be a file on disk.
 *
 * How to set it:
 *   node -e "process.stdout.write(require('fs').readFileSync('service-account.json').toString('base64'))"
 * Then set the output as FIREBASE_SERVICE_ACCOUNT_B64 in your .env / Railway secrets.
 */
import * as admin from 'firebase-admin';
import { env } from './env';

if (!admin.apps.length) {
  if (env.firebase.serviceAccountB64) {
    const serviceAccount = JSON.parse(
      Buffer.from(env.firebase.serviceAccountB64, 'base64').toString('utf-8')
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
  } else if (env.isDev) {
    // Dev fallback: uses Application Default Credentials (gcloud auth) or emulator
    console.warn('[firebase] FIREBASE_SERVICE_ACCOUNT_B64 not set — using Application Default Credentials (dev only)');
    admin.initializeApp();
  } else {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 must be set in production');
  }
}

export const firebaseAdmin = admin;
