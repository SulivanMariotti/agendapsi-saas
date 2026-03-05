"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword } from "firebase/auth";
import { app } from "@/app/firebase";

function safeErrMsg(e) {
  const msg = String(e?.message || "");
  if (!msg) return "Falha ao entrar.";
  const norm = msg.toLowerCase();
  // Tenant suspenso (bloqueio SaaS)
  if (norm.includes("tenant-suspended") || norm.includes("tenant_suspended")) {
    return "Este tenant está suspenso no momento. Fale com o suporte para reativar o acesso.";
  }
  // Avoid leaking internal error details.
  if (/permission|denied|unauthorized|forbidden/i.test(msg)) return "Acesso não autorizado.";
  return msg;
}

export default function ProfessionalLoginClient({ nextPath = "/profissional" }) {
  const router = useRouter();
  const provider = useMemo(() => new GoogleAuthProvider(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function startSessionFromUser(user) {
    const idToken = await user.getIdToken();

    const r = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.ok) {
      if (data?.code === "TENANT_SUSPENDED") {
        throw new Error("tenant-suspended");
      }
      throw new Error(data?.error || "Acesso não autorizado.");
    }

    router.replace(nextPath);
    router.refresh();
  }

  async function doLoginGoogle() {
    setError("");
    setLoading(true);
    try {
      const auth = getAuth(app);
      const res = await signInWithPopup(auth, provider);
      await startSessionFromUser(res.user);
    } catch (e) {
      setError(safeErrMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function doLoginEmail() {
    setError("");
    setLoading(true);
    try {
      const auth = getAuth(app);
      const cred = await signInWithEmailAndPassword(auth, String(email).trim(), String(password));
      await startSessionFromUser(cred.user);
    } catch (e) {
      setError(safeErrMsg(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-600">E-mail</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          placeholder="seuemail@..."
          autoComplete="email"
        />
        <label className="block text-xs font-semibold text-slate-600 mt-2">Senha</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          placeholder="••••••••"
          type="password"
          autoComplete="current-password"
        />

        <button
          type="button"
          onClick={doLoginEmail}
          disabled={loading || !email || !password}
          className="w-full rounded-xl bg-violet-700 text-white py-2.5 text-sm font-medium hover:bg-violet-600 active:bg-violet-700 disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar com e-mail"}
        </button>
      </div>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <div className="text-xs text-slate-400">ou</div>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        type="button"
        onClick={doLoginGoogle}
        disabled={loading}
        className="w-full rounded-xl bg-slate-900 text-white py-2.5 text-sm font-medium hover:bg-slate-800 active:bg-slate-900 disabled:opacity-60"
      >
        {loading ? "Entrando…" : "Entrar com Google"}
      </button>

      {error ? (
        <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </div>
      ) : null}
    </div>
  );
}