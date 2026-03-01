/**
 * Firebase Admin wrapper (Turbopack-safe)
 *
 * Why:
 * - Next.js (Turbopack) can panic when bundling the legacy default import:
 *     import admin from "firebase-admin";
 * - Using the modular Admin SDK entry points avoids that class of crash.
 *
 * This file intentionally mimics the old "admin" shape used across the project:
 * - admin.apps.length
 * - admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
 * - admin.auth().verifyIdToken(...)
 * - admin.firestore().collection(...)
 * - admin.firestore.FieldValue.serverTimestamp()
 * - admin.messaging().send(...)
 *
 * AgendaPsi note:
 * - Supports SERVICE_ACCOUNT_JSON_PATH (local dev) in addition to the env JSON/B64.
 */
import fs from "node:fs";
import path from "node:path";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function readJsonFile(p) {
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  const raw = fs.readFileSync(abs, "utf-8");
  return JSON.parse(raw);
}

function getServiceAccount() {
  const b64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = Buffer.from(b64, "base64").toString("utf-8");
    return JSON.parse(json);
  }

  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (raw) return JSON.parse(raw);

  const p = process.env.SERVICE_ACCOUNT_JSON_PATH;
  if (p && fs.existsSync(path.isAbsolute(p) ? p : path.resolve(process.cwd(), p))) {
    return readJsonFile(p);
  }

  throw new Error(
    "Missing service account. Set FIREBASE_ADMIN_SERVICE_ACCOUNT_B64 or FIREBASE_ADMIN_SERVICE_ACCOUNT or SERVICE_ACCOUNT_JSON_PATH"
  );
}

function ensureAdmin() {
  if (getApps().length) return;
  const serviceAccount = getServiceAccount();
  initializeApp({ credential: cert(serviceAccount) });
}

// Functions that behave like the classic namespaced SDK.
function auth() {
  ensureAdmin();
  return getAuth();
}

function firestore() {
  ensureAdmin();
  return getFirestore();
}
firestore.FieldValue = FieldValue;
firestore.Timestamp = Timestamp;

function messaging() {
  ensureAdmin();
  return getMessaging();
}

const admin = {
  get apps() {
    return getApps();
  },
  initializeApp,
  credential: { cert },
  auth,
  firestore,
  messaging,
};

export default admin;
export { FieldValue, Timestamp };
