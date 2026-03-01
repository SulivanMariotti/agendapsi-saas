import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getMessaging, isSupported } from "firebase/messaging";

// AgendaPsi: sempre via ENV (não hardcode) para evitar misturar projetos.
// Defina no .env.local:
//   NEXT_PUBLIC_FIREBASE_API_KEY
//   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
//   NEXT_PUBLIC_FIREBASE_PROJECT_ID
//   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
//   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
//   NEXT_PUBLIC_FIREBASE_APP_ID
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const missing = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  // eslint-disable-next-line no-console
  console.warn(
    `[AgendaPsi] Firebase config incompleto. Variáveis ausentes: ${missing.join(", ")}. ` +
      `Defina no .env.local para login/notificações funcionarem.`
  );
}

// Inicializa o App Firebase
const app = initializeApp(firebaseConfig);

// Inicializa o Banco de Dados
const db = getFirestore(app);

// Inicializa o Sistema de Mensagens (apenas no navegador)
let messaging;

if (typeof window !== "undefined") {
  isSupported().then((isSupported) => {
    if (isSupported) {
      messaging = getMessaging(app);
    }
  }).catch((err) => {
    console.log('Firebase Messaging não suportado neste navegador', err);
  });
}

// CORREÇÃO: Exportar 'app' também, pois é usado pelo authService e page.js
export { app, db, messaging };