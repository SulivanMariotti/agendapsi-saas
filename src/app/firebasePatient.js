import { initializeApp, getApps } from "firebase/app";

/**
 * AgendaPsi — Firebase App secundário para o Portal do Paciente.
 *
 * Motivo:
 * - Evitar conflito de sessão do Firebase Auth no mesmo navegador
 *   quando o profissional está logado no painel /profissional
 *   e o paciente acessa /paciente.
 *
 * Observação:
 * - Usa a mesma config (mesmo Firebase Project do AgendaPsi),
 *   mas com "app name" diferente para manter auth state separado.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const APP_NAME = "patientPortal";

const existing = getApps().find((a) => a?.name === APP_NAME);
const patientApp = existing || initializeApp(firebaseConfig, APP_NAME);

export { patientApp };
