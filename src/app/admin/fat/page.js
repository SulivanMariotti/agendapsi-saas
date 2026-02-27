"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { getAuth, onAuthStateChanged, signInWithCustomToken, getIdTokenResult } from "firebase/auth";

import { app } from "../../firebase";

import { useData } from "../../../hooks/useData";
import AdminPanel from "../../../components/Admin/AdminPanel";
import { Button, Card, Toast } from "../../../components/DesignSystem";

import { logoutUser } from "../../../services/authService";

export default function AdminFatPage() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "success" });

  const showToast = (msg, type = "success") => setToast({ msg, type });

  // ✅ Hook de dados: só carrega coleções sensíveis quando isAdmin === true
  const { subscribers, historyLogs, appointments: dbAppointments, globalConfig } = useData(isAdmin);

  const needsLogoutToProceed = useMemo(() => Boolean(user) && !isAdmin, [user, isAdmin]);

  useEffect(() => {
    const auth = getAuth(app);

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);

      if (!u) {
        setIsAdmin(false);
        setChecking(false);
        return;
      }

      try {
        const token = await getIdTokenResult(u, true);
        const role = token?.claims?.role;
        setIsAdmin(role === "admin");
      } catch (_) {
        setIsAdmin(false);
      } finally {
        setChecking(false);
      }
    });

    return () => unsub();
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (_) {
      // ok
    } finally {
      setUser(null);
      setIsAdmin(false);
    }
  };

  const handleAdminLogin = async (e) => {
    e?.preventDefault?.();

    const pass = String(password || "").trim();
    if (!pass) {
      showToast("Digite a senha de administrador.", "error");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pass }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.ok || !data?.token) {
        showToast(data?.error || "Senha incorreta", "error");
        return;
      }

      const auth = getAuth(app);
      await signInWithCustomToken(auth, data.token);

      // força refresh de claims
      const current = auth.currentUser;
      if (current) {
        const token = await getIdTokenResult(current, true);
        const role = token?.claims?.role;
        if (role === "admin") {
          setIsAdmin(true);
          showToast("Bem-vindo, Admin!", "success");
          setPassword("");
          return;
        }
      }

      showToast("Login efetuado, mas sem permissão de admin.", "error");
      setIsAdmin(false);
    } catch (e2) {
      console.error(e2);
      showToast("Erro de servidor", "error");
      setIsAdmin(false);
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Carregando...
      </div>
    );
  }

  // ✅ Admin autenticado
  if (isAdmin) {
    return (
      <>
        {toast?.msg && (
          <Toast
            message={toast.msg}
            type={toast.type}
            onClose={() => setToast({ msg: "", type: "success" })}
          />
        )}

        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
          <AdminPanel
            initialTab="fat"
            onLogout={handleLogout}
            subscribers={subscribers}
            historyLogs={historyLogs}
            dbAppointments={dbAppointments}
            globalConfig={globalConfig}
            showToast={showToast}
          />
        </div>
      </>
    );
  }

  // ✅ Gate de login
  return (
    <>
      {toast?.msg && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast({ msg: "", type: "success" })}
        />
      )}

      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-3">
          {/* Cabeçalho compacto (padrão do Paciente) */}
          <div className="text-center px-2">
            <div className="flex items-center justify-center gap-2">
              <div className="w-11 h-11 rounded-2xl bg-white ring-1 ring-slate-200 flex items-center justify-center shadow-lg shadow-slate-200 shrink-0">
                <Image
                  src="/brand/permitta-mark-256.png"
                  alt="Permittá"
                  width={40}
                  height={40}
                  className="object-contain"
                  priority
                />
              </div>

              <div className="text-left min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[22px] sm:text-[26px] font-extrabold text-slate-900 leading-none truncate">
                    Lembrete Psi
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                    Admin
                  </span>
                </div>
                <div className="text-xs sm:text-sm text-slate-500 mt-0.5">Constância terapêutica</div>
              </div>
            </div>

            <div className="mt-2 text-sm text-slate-500">
              Área administrativa para gestão do cuidado ativo e da constância.
            </div>
          </div>

          <Card title="Acesso Admin">
            {needsLogoutToProceed ? (
              <div className="space-y-3">
                <div className="text-sm text-slate-600">
                  Você já está logado, mas <b>sem permissão de admin</b>.
                  <div className="text-xs text-slate-400 mt-1">
                    Para entrar como Admin, saia e informe a senha de administrador.
                  </div>
                </div>

                <Button variant="secondary" className="w-full" onClick={handleLogout}>
                  Sair
                </Button>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={handleAdminLogin}>
                <div className="text-sm text-slate-600">
                  Área restrita. Use a senha para acessar o painel administrativo.
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Senha</label>
                  <input
                    className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-200 text-slate-700"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                  />
                </div>

                <Button className="w-full" disabled={busy} onClick={handleAdminLogin}>
                  {busy ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            )}

            <div className="mt-4 text-[11px] text-slate-400 leading-snug">
              * Dica: acesse diretamente <b>/admin</b>. O painel do paciente (/) fica dedicado à constância terapêutica.
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
