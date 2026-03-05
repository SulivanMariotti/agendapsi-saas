"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { app } from "@/app/firebase";

function norm(v) {
  return String(v ?? "").trim();
}

function safeMsg(e, fallback = "Falha.") {
  const msg = String(e?.message || "").trim();
  if (!msg) return fallback;

  const m = msg.toLowerCase();
  if (m.includes("tenant_suspended") || m.includes("tenant-suspended")) {
    return "Este tenant está suspenso no momento. Fale com o suporte para reativar o acesso.";
  }
  if (m.includes("email_mismatch") || m.includes("email mismatch") || m.includes("e-mail não corresponde")) {
    return "O e-mail da conta não corresponde ao convite. Use o e-mail convidado.";
  }
  if (m.includes("expired") || m.includes("expirado")) return "Convite expirado. Solicite um novo.";
  if (m.includes("revoked") || m.includes("revogado")) return "Convite revogado. Solicite um novo.";
  if (m.includes("invalid") || m.includes("inválido")) return "Convite inválido. Solicite um novo.";
  if (m.includes("auth/email-already-in-use")) return "Este e-mail já tem conta. Use a opção Entrar.";
  if (m.includes("auth/weak-password")) return "Senha fraca. Use pelo menos 6 caracteres.";
  if (m.includes("auth/wrong-password") || m.includes("auth/invalid-credential")) return "Senha incorreta.";
  if (m.includes("auth/user-not-found")) return "Conta não encontrada. Use a opção Criar conta.";
  return msg;
}

async function fetchInvite(token) {
  const qs = new URLSearchParams({ token });
  const r = await fetch(`/api/invite/info?${qs.toString()}`, { method: "GET", cache: "no-store" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok) {
    const err = new Error(data?.error || "Falha ao carregar convite.");
    err.code = data?.code || String(r.status);
    err.status = r.status;
    throw err;
  }
  return data?.invite;
}

async function acceptInvite({ token, user }) {
  const idToken = await user.getIdToken();
  const r = await fetch("/api/invite/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, idToken }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok) {
    const err = new Error(data?.error || "Falha ao aceitar convite.");
    err.code = data?.code || String(r.status);
    err.status = r.status;
    throw err;
  }
  return { idToken, tenantId: data?.tenantId, role: data?.role };
}

async function startSession(idToken) {
  const r = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok) {
    const err = new Error(data?.error || "Falha ao iniciar sessão.");
    err.code = data?.code || String(r.status);
    err.status = r.status;
    throw err;
  }
  return data;
}

export default function InviteAcceptClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = useMemo(() => norm(sp?.get("token")), [sp]);

  const provider = useMemo(() => new GoogleAuthProvider(), []);

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("signin"); // signin | signup
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [working, setWorking] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoadingInvite(true);
      setError("");
      try {
        if (!token) throw new Error("Token ausente.");
        const inv = await fetchInvite(token);
        if (!alive) return;
        setInvite(inv);
      } catch (e) {
        if (!alive) return;
        setInvite(null);
        setError(safeMsg(e, "Falha ao carregar convite."));
      } finally {
        if (alive) setLoadingInvite(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [token]);

  async function handleWithUser(user) {
    setWorking(true);
    setError("");
    try {
      const res = await acceptInvite({ token, user });
      await startSession(res.idToken);
      setSuccess(true);
      router.replace("/profissional");
      router.refresh();
    } catch (e) {
      setError(safeMsg(e, "Falha ao ativar acesso."));
    } finally {
      setWorking(false);
    }
  }

  async function doSigninEmail() {
    setWorking(true);
    setError("");
    try {
      const auth = getAuth(app);
      const email = String(invite?.email || "").trim();
      const cred = await signInWithEmailAndPassword(auth, email, String(password));
      await handleWithUser(cred.user);
    } catch (e) {
      setError(safeMsg(e, "Falha ao entrar."));
      setWorking(false);
    }
  }

  async function doSignupEmail() {
    setWorking(true);
    setError("");
    try {
      if (String(password).length < 6) throw new Error("Senha fraca.");
      if (password !== password2) throw new Error("As senhas não conferem.");
      const auth = getAuth(app);
      const email = String(invite?.email || "").trim();
      const cred = await createUserWithEmailAndPassword(auth, email, String(password));
      await handleWithUser(cred.user);
    } catch (e) {
      setError(safeMsg(e, "Falha ao criar conta."));
      setWorking(false);
    }
  }

  async function doGoogle() {
    setWorking(true);
    setError("");
    try {
      const auth = getAuth(app);
      const res = await signInWithPopup(auth, provider);
      await handleWithUser(res.user);
    } catch (e) {
      setError(safeMsg(e, "Falha ao entrar com Google."));
      setWorking(false);
    }
  }

  const email = String(invite?.email || "").trim();
  const tenantLabel = invite?.tenantName ? invite.tenantName : invite?.tenantId || "";

  if (loadingInvite) {
    return <div className="text-sm text-slate-600">Carregando convite…</div>;
  }

  if (!token) {
    return <div className="text-sm text-rose-600 font-semibold">Token ausente.</div>;
  }

  if (!invite) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-rose-600 font-semibold">{error || "Convite inválido."}</div>
        <div className="text-xs text-slate-500">
          Verifique se você abriu o link completo. Se o convite expirou, solicite um novo.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs text-slate-500">Tenant</div>
        <div className="text-sm font-semibold text-slate-900">{tenantLabel || "—"}</div>
        <div className="mt-2 text-xs text-slate-500">E-mail convidado</div>
        <div className="text-sm font-mono text-slate-800">{email || invite?.emailMasked || "—"}</div>
        {invite?.expiresAtIso ? (
          <div className="mt-2 text-[11px] text-slate-500">
            Expira em: {new Date(invite.expiresAtIso).toLocaleString()}
          </div>
        ) : null}
      </div>

      {error ? <div className="text-sm text-rose-600 font-semibold">{error}</div> : null}
      {success ? <div className="text-sm text-emerald-700 font-semibold">Acesso ativado. Redirecionando…</div> : null}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`rounded-xl px-3 py-2 text-sm font-medium border ${
            mode === "signin" ? "bg-white border-slate-300 text-slate-900" : "bg-slate-50 border-slate-200 text-slate-600"
          }`}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`rounded-xl px-3 py-2 text-sm font-medium border ${
            mode === "signup" ? "bg-white border-slate-300 text-slate-900" : "bg-slate-50 border-slate-200 text-slate-600"
          }`}
        >
          Criar conta
        </button>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-600">Senha</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          placeholder="••••••••"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />

        {mode === "signup" ? (
          <>
            <label className="block text-xs font-semibold text-slate-600 mt-2">Confirmar senha</label>
            <input
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="••••••••"
              type="password"
              autoComplete="new-password"
            />
          </>
        ) : null}

        <button
          type="button"
          onClick={mode === "signup" ? doSignupEmail : doSigninEmail}
          disabled={working || !email || !password || (mode === "signup" && !password2)}
          className="w-full rounded-xl bg-violet-700 text-white py-2.5 text-sm font-medium hover:bg-violet-600 active:bg-violet-700 disabled:opacity-60"
        >
          {working ? "Processando…" : mode === "signup" ? "Criar conta e ativar acesso" : "Entrar e ativar acesso"}
        </button>
      </div>

      <div className="my-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <div className="text-xs text-slate-400">ou</div>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        type="button"
        onClick={doGoogle}
        disabled={working}
        className="w-full rounded-xl bg-slate-900 text-white py-2.5 text-sm font-medium hover:bg-slate-800 active:bg-slate-900 disabled:opacity-60"
      >
        Entrar com Google e ativar acesso
      </button>

      <div className="text-[11px] text-slate-500">
        O e-mail da conta precisa ser exatamente o do convite.
      </div>
    </div>
  );
}
