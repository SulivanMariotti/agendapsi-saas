"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/DesignSystem";
import { AlertTriangle, Bell, CheckCircle, Info, Loader2, Settings2 } from "lucide-react";
import { PT } from "../lib/uiTokens";

/**
 * NotificationStatusCard (Paciente)
 * - Mobile-first: compacto, escaneável e com orientação clínica (sem moralismo).
 * - Ativar push (FCM) via /api/patient/push/register
 * - Status: ativo / bloqueado / não suportado / ativar
 *
 * Obs. Importante (clínico):
 * Lembretes não “cobram” o paciente — eles protegem o horário e sustentam a continuidade do processo.
 */
export default function NotificationStatusCard({
  app,
  user,
  notifHasToken,
  setNotifHasToken,
  showToast,
}) {
  const [notifSupported, setNotifSupported] = useState(false);
  const [notifPermission, setNotifPermission] = useState("default");
  const [notifBusy, setNotifBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // status básico do navegador (sem depender de Firestore)
  useEffect(() => {
    if (typeof window === "undefined") return;

    setNotifPermission(Notification?.permission || "default");
    setNotifSupported("Notification" in window && "serviceWorker" in navigator);

    const onChange = () => setNotifPermission(Notification?.permission || "default");
    document?.addEventListener?.("visibilitychange", onChange);
    return () => document?.removeEventListener?.("visibilitychange", onChange);
  }, []);

  async function enableNotificationsAndSaveToken() {
    try {
      if (typeof window === "undefined") return;
      if (!("Notification" in window)) return;

      setNotifBusy(true);

      // pede permissão se necessário
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        setNotifPermission(perm || "default");
        if (perm !== "granted") {
          showToast?.("Permissão de notificação não concedida.", "error");
          return;
        }
      }

      if (Notification.permission !== "granted") {
        showToast?.("Notificações bloqueadas no navegador.", "error");
        return;
      }

      // firebase messaging
      const { isSupported, getMessaging, getToken } = await import("firebase/messaging");
      const supported = await isSupported();
      setNotifSupported(Boolean(supported));

      if (!supported) {
        showToast?.("Seu navegador não suporta notificações.", "error");
        return;
      }

      // garante o SW
      const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

      const messaging = getMessaging(app);
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY;

      if (!vapidKey) {
        showToast?.("VAPID não configurado. Fale com o administrador.", "error");
        return;
      }

      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
      if (!token) {
        showToast?.("Não foi possível gerar token de notificação.", "error");
        return;
      }

      if (!user) {
        showToast?.("Sessão expirada. Recarregue a página.", "error");
        return;
      }

      const idToken = await user.getIdToken();
      const res = await fetch("/api/patient/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: "Bearer " + idToken },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        showToast?.(data?.error || "Falha ao ativar notificações.", "error");
        return;
      }

      setNotifHasToken?.(true);
      showToast?.("Notificações ativadas ✅", "success");
    } catch (e) {
      console.error(e);
      showToast?.("Falha ao ativar notificações.", "error");
    } finally {
      setNotifBusy(false);
    }
  }

  const ui = useMemo(() => {
    const status = (() => {
      if (typeof window === "undefined") return { key: "loading", label: "Carregando", tone: "slate" };
      if (!notifSupported) return { key: "unsupported", label: "Indisponível", tone: "slate" };
      if (notifHasToken) return { key: "active", label: "Ativo", tone: "emerald" };
      if (notifPermission === "denied") return { key: "blocked", label: "Bloqueado", tone: "amber" };
      return { key: "off", label: "Desativado", tone: "violet" };
    })();

    const Help = () => (
      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 shadow-sm">
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 text-slate-500" />
          <div>
            <b>Por que ativar?</b>
            <div className="mt-1 text-slate-600">
              Os lembretes ajudam a proteger seu horário — um espaço reservado para o seu cuidado.
              Eles não substituem a sessão e não são cobrança: são um apoio para manter a continuidade do processo.
            </div>
          </div>
        </div>

        {status.key === "blocked" && (
          <div className="mt-3 text-slate-600 text-sm">
            <b>Como liberar:</b>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>Abra as configurações do navegador do seu celular.</li>
              <li>Permissões → Notificações → permita para este site.</li>
              <li>Volte aqui e toque em <b>Ativar</b>.</li>
            </ul>
          </div>
        )}

        {status.key === "unsupported" && (
          <div className="mt-3 text-slate-600 text-sm">
            <b>Dica:</b> se possível, use Chrome (Android) ou Safari (iPhone) para receber lembretes.
          </div>
        )}
      </div>
    );

    // Conteúdo principal (compacto)
    if (typeof window === "undefined") {
      return (
        <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 flex gap-2 shadow-sm">
          <Loader2 size={16} className="mt-0.5 animate-spin text-slate-400" />
          <div>Carregando status de notificações…</div>
        </div>
      );
    }

    if (!notifSupported) {
      return (
        <div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 flex gap-2 shadow-sm">
            <AlertTriangle size={16} className="mt-0.5 text-slate-500" />
            <div>
              Este navegador pode não suportar notificações.
              <div className="text-xs text-slate-500 mt-1">Se possível, use Chrome/Safari para receber lembretes.</div>
            </div>
          </div>
          <div className="mt-2">
            <button
              type="button"
              className="text-xs font-semibold text-slate-600 underline underline-offset-4"
              onClick={() => setShowHelp((v) => !v)}
            >
              {showHelp ? "Ocultar" : "Por que isso importa?"}
            </button>
          </div>
          {showHelp && <Help />}
        </div>
      );
    }

    if (notifHasToken) {
      return (
        <div>
          <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 flex gap-2 shadow-sm">
            <CheckCircle size={16} className="mt-0.5" />
            <div>
              <b>Notificações ativas neste aparelho</b>
              <div className="text-xs text-emerald-800/70 mt-1">Você receberá lembretes neste dispositivo.</div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              className="text-xs font-semibold text-emerald-900 underline underline-offset-4"
              onClick={() => setShowHelp((v) => !v)}
            >
              {showHelp ? "Ocultar" : "Por que isso importa?"}
            </button>
            <span className="text-xs text-emerald-900/70 flex items-center gap-1">
              <Settings2 size={14} /> gerencie no aparelho
            </span>
          </div>
          {showHelp && <Help />}
        </div>
      );
    }

    if (notifPermission === "denied") {
      return (
        <div>
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 flex gap-2 shadow-sm">
            <AlertTriangle size={16} className="mt-0.5" />
            <div>
              <b>Notificações bloqueadas</b>
              <div className="text-xs text-slate-600 mt-1">Libere as permissões do navegador para ativar.</div>
            </div>
          </div>

          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <Button
              onClick={() => setShowHelp(true)}
              disabled={notifBusy}
              variant="secondary"
              icon={Info}
              className="w-full sm:w-auto"
            >
              Como liberar
            </Button>
          </div>

          {showHelp && <Help />}
        </div>
      );
    }

    // default: desativado e suportado
    return (
      <div>
        <div className={`rounded-xl ${PT.accentSoft} p-3 text-sm ${PT.accentText} flex items-start justify-between gap-3 shadow-sm`}>
          <div className="flex gap-2">
            <Bell size={16} className={`mt-0.5 ${PT.accentIcon}`} />
            <div>
              <b>Ative os lembretes</b>
              <div className="text-xs text-slate-600 mt-1">Para receber notificações neste aparelho.</div>
            </div>
          </div>
          <div className="shrink-0">
            <Button
              onClick={enableNotificationsAndSaveToken}
              disabled={notifBusy}
              variant="secondary"
              icon={notifBusy ? Loader2 : Bell}
              className="min-h-[44px]"
            >
              {notifBusy ? "Ativando..." : "Ativar"}
            </Button>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            className={`text-xs font-semibold ${PT.accentText} underline underline-offset-4`}
            onClick={() => setShowHelp((v) => !v)}
          >
            {showHelp ? "Ocultar" : "Por que isso importa?"}
          </button>
          <span className="text-xs text-slate-500">leva 10 segundos</span>
        </div>

        {showHelp && <Help />}
      </div>
    );
  }, [notifSupported, notifHasToken, notifPermission, notifBusy, showHelp]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-slate-700" />
          <div className="text-sm font-semibold text-slate-900">Lembretes</div>
        </div>
        {/* Pill */}
        <div>
          {typeof window === "undefined" ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-50 text-slate-700 shadow-sm">
              Carregando
            </span>
          ) : (
            (() => {
              const key = !notifSupported
                ? "unsupported"
                : notifHasToken
                ? "active"
                : notifPermission === "denied"
                ? "blocked"
                : "off";
              if (key === "active")
                return (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm ${PT.ok}`}>
                    Ativo
                  </span>
                );
              if (key === "blocked")
                return (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm ${PT.warn}`}>
                    Bloqueado
                  </span>
                );
              if (key === "off")
                return (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm ${PT.accentSoft} ${PT.accentText}`}>
                    Desativado
                  </span>
                );
              return (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-50 text-slate-700 shadow-sm">
                  Indisponível
                </span>
              );
            })()
          )}
        </div>
      </div>

      {ui}
    </div>
  );
}
