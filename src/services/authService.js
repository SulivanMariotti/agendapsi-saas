import { app } from "../app/firebase";
import { patientApp } from "../app/firebasePatient";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  signInWithCustomToken,
} from "firebase/auth";

const provider = new GoogleAuthProvider();

export async function loginWithGoogle() {
  const auth = getAuth(app);
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

/**
 * ✅ Login do paciente via token gerado no backend
 * - valida se o email está em subscribers
 * - gera custom token
 * - faz signInWithCustomToken
 *
 * IMPORTANTE:
 * - Usa Auth do app secundário (patientApp) para não derrubar a sessão do profissional.
 */
export async function patientLoginByEmail(email) {
  // 🔒 Por padrão, o login por e-mail do paciente fica desativado.
  // Ele é inseguro sem verificação (OTP/Magic Link) e pode permitir sequestro de acesso.
  // Para habilitar conscientemente (apenas testes/legado), defina:
  //   - Server: ENABLE_INSECURE_PATIENT_EMAIL_LOGIN="true"
  //   - Client: NEXT_PUBLIC_ENABLE_INSECURE_PATIENT_EMAIL_LOGIN="true"
  // (compat) também aceita NEXT_PUBLIC_ENABLE_PATIENT_EMAIL_LOGIN="true" no client.
  const enabled =
    String(process.env.NEXT_PUBLIC_ENABLE_INSECURE_PATIENT_EMAIL_LOGIN || "").toLowerCase() === "true" ||
    String(process.env.NEXT_PUBLIC_ENABLE_PATIENT_EMAIL_LOGIN || "").toLowerCase() === "true";
  if (!enabled) {
    throw new Error(
      "Login por e-mail está desativado por segurança. Use telefone + código de vinculação fornecido pela clínica."
    );
  }

  const auth = getAuth(patientApp);

  const res = await fetch("/api/patient-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.ok || !data?.token) {
    throw new Error(data?.error || "Falha no login do paciente");
  }

  const cred = await signInWithCustomToken(auth, data.token);
  return cred.user;
}

/**
 * ✅ Login do paciente via Código de Acesso (6 dígitos)
 * - valida no backend em patientAccessCodes/{code}
 * - retorna custom token
 * - faz signInWithCustomToken
 *
 * IMPORTANTE:
 * - Usa Auth do app secundário (patientApp) para não derrubar a sessão do profissional.
 */
export async function patientLoginByPairCode(phone, code) {
  const auth = getAuth(patientApp);

  const res = await fetch("/api/paciente/access-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.ok || !data?.token) {
    throw new Error(data?.error || "Falha ao entrar.");
  }

  const cred = await signInWithCustomToken(auth, data.token);
  return cred.user;
}

/**
 * ✅ DEV: Login do paciente (demo) via token gerado no backend (AgendaPsi)
 * - Exige ENABLE_PATIENT_DEV_TOKEN=true no server
 * - O botão só aparece quando NEXT_PUBLIC_ENABLE_PATIENT_DEV_DEMO=true
 *
 * IMPORTANTE:
 * - Usa Auth do app secundário (patientApp) para não derrubar a sessão do profissional.
 */
export async function patientLoginDevDemo() {
  const auth = getAuth(patientApp);

  const res = await fetch("/api/paciente/dev-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.ok || !data?.token) {
    throw new Error(data?.error || "Falha no login demo do paciente");
  }

  const cred = await signInWithCustomToken(auth, data.token);
  return cred.user;
}

/**
 * Logout padrão (painel profissional / usos gerais) — app principal.
 */
export async function logoutUser() {
  const auth = getAuth(app);
  await signOut(auth);
}

/**
 * Logout do paciente — app secundário (patientApp).
 * (não derruba a sessão do profissional no mesmo navegador)
 */
export async function logoutPatientUser() {
  const auth = getAuth(patientApp);
  await signOut(auth);
}
