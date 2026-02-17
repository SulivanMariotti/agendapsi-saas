// src/app/api/admin/ops/health/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";

function hasEnv(name) {
  return String(process.env[name] || "").trim().length > 0;
}

function safeErr(err) {
  return String(err?.message || err || "");
}

function okToOperate(checks) {
  // Apenas falhas críticas (level=error) derrubam o ok.
  return !(checks || []).some((c) => c && c.ok === false && String(c.level || "").toLowerCase() === "error");
}

export async function GET(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, { bucket: "admin:ops:health", uid: auth.uid, limit: 60, windowMs: 60_000 });
    if (!rl.ok) return rl.res;

    const checks = [];

    // 1) Credenciais Admin SDK
    const hasServiceAccount = hasEnv("FIREBASE_ADMIN_SERVICE_ACCOUNT_B64") || hasEnv("FIREBASE_ADMIN_SERVICE_ACCOUNT");
    checks.push({
      key: "service_account_env",
      level: "error",
      ok: hasServiceAccount,
      title: "Credenciais Firebase Admin",
      detail: hasServiceAccount
        ? "OK: credenciais encontradas no ambiente."
        : "Faltando FIREBASE_ADMIN_SERVICE_ACCOUNT_B64 ou FIREBASE_ADMIN_SERVICE_ACCOUNT.",
      fix: hasServiceAccount
        ? []
        : [
            "Vercel → Project → Settings → Environment Variables.",
            "Adicionar FIREBASE_ADMIN_SERVICE_ACCOUNT_B64 (recomendado) com o JSON do service account em base64.",
            "Re-deploy do projeto para aplicar as variáveis.",
          ],
    });

    // 2) Admin SDK inicializa (Firestore/Messaging disponíveis)
    let adminInitOk = false;
    let adminInitErr = "";
    try {
      // Se env estiver ausente, isso deve lançar — capturamos para instrução objetiva.
      admin.firestore();
      admin.messaging();
      adminInitOk = true;
    } catch (e) {
      adminInitOk = false;
      adminInitErr = safeErr(e);
    }

    checks.push({
      key: "admin_sdk",
      level: "error",
      ok: adminInitOk,
      title: "Firebase Admin SDK",
      detail: adminInitOk ? "OK: Admin SDK pronto (Firestore/Messaging)." : `Falha ao inicializar Admin SDK: ${adminInitErr}`,
      fix: adminInitOk
        ? []
        : [
            "Confirme as credenciais do service account e se o JSON está válido (sem quebras/aspas a mais).",
            "Na Vercel, verifique se a variável está em todos os ambientes usados (Production/Preview).",
            "Re-deploy após ajustar.",
          ],
    });

    // 3) VAPID (cliente) — necessário para registrar push no browser do paciente
    const hasVapid = hasEnv("NEXT_PUBLIC_VAPID_KEY");
    checks.push({
      key: "vapid",
      level: "warn",
      ok: hasVapid,
      title: "VAPID (Web Push)",
      detail: hasVapid
        ? "OK: NEXT_PUBLIC_VAPID_KEY configurado."
        : "VAPID não configurado. Pacientes podem não conseguir ativar notificações no navegador.",
      fix: hasVapid
        ? []
        : [
            "Vercel → Project → Settings → Environment Variables.",
            "Adicionar NEXT_PUBLIC_VAPID_KEY (chave pública VAPID do Firebase Cloud Messaging).",
          ],
    });

    // 4) Admin login (se usar)
    const hasAdminPwd = hasEnv("ADMIN_PASSWORD");
    const hasAdminUid = hasEnv("ADMIN_UID");
    const adminLoginOk = hasAdminPwd && hasAdminUid;
    checks.push({
      key: "admin_login_env",
      level: "warn",
      ok: adminLoginOk,
      title: "Admin Login (env)",
      detail: adminLoginOk
        ? "OK: ADMIN_PASSWORD e ADMIN_UID configurados."
        : "ADMIN_PASSWORD e/ou ADMIN_UID ausentes. Login admin pode falhar em novos dispositivos.",
      fix: adminLoginOk
        ? []
        : [
            "Vercel → Project → Settings → Environment Variables.",
            "Adicionar ADMIN_PASSWORD e ADMIN_UID (UID do usuário admin no Firebase Auth).",
          ],
    });

    // 5) Cron (opcional) — não é necessário no modo manual
    const hasCronSecret = hasEnv("CRON_SECRET");
    checks.push({
      key: "cron_secret",
      level: "info",
      ok: true,
      title: "Cron (opcional)",
      detail: hasCronSecret
        ? "CRON_SECRET presente (apenas se for configurar cron jobs)."
        : "CRON_SECRET ausente (ok no modo manual).",
      fix: [],
    });

    const ok = okToOperate(checks);

    return NextResponse.json({
      ok,
      checkedAtISO: new Date().toISOString(),
      checks,
      meta: {
        nodeEnv: String(process.env.NODE_ENV || ""),
        adminApps: Array.isArray(admin.apps) ? admin.apps.length : 0,
      },
    });
  } catch (err) {
    // Não expõe detalhes sensíveis.
    return NextResponse.json(
      {
        ok: false,
        checkedAtISO: new Date().toISOString(),
        checks: [
          {
            key: "health_route",
            level: "error",
            ok: false,
            title: "Saúde do sistema",
            detail: "Falha ao executar checagem de saúde (rota).",
            fix: ["Recarregue o painel Admin e tente novamente."],
          },
        ],
      },
      { status: 500 }
    );
  }
}
