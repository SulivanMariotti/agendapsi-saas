import { app } from "../app/firebase";
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
 */
export async function patientLoginByEmail(email) {
  // 🔒 Por padrão, o login por e-mail do paciente fica desativado.
  // Ele é inseguro sem verificação (OTP/Magic Link) e pode permitir sequestro de acesso.
  // Para habilitar conscientemente (apenas testes/legado), defina:
  //   NEXT_PUBLIC_ENABLE_PATIENT_EMAIL_LOGIN="true"
  const enabled = String(process.env.NEXT_PUBLIC_ENABLE_PATIENT_EMAIL_LOGIN || "").toLowerCase() === "true";
  if (!enabled) {
    throw new Error(
      "Login por e-mail está desativado por segurança. Use telefone + código de vinculação fornecido pela clínica."
    );
  }

  const auth = getAuth(app);

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
 * ✅ Login do paciente via Código de Vinculação (telefone + código)
 * - valida no backend pelo users/{uid}.pairCodeHash
 * - retorna custom token
 * - faz signInWithCustomToken
 */
export async function patientLoginByPairCode(phone, code) {
  const auth = getAuth(app);

  const res = await fetch("/api/patient/pair", {
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

export async function logoutUser() {
  const auth = getAuth(app);
  await signOut(auth);
}
