import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";
import { adminError } from "@/lib/server/adminError";
import { writeHistory } from "@/lib/server/historyLog";
export const runtime = "nodejs";
function getServiceAccount() {
  const b64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = Buffer.from(b64, "base64").toString("utf-8");
    return JSON.parse(json);
  }
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT(_B64) env var");
  return JSON.parse(raw);
}

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccount = getServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

// ✅ Agora pega a mensagem correta do seu parseCSV (messageBody)
function pickMessage(item) {
  return (
    item?.messageBody ||              // <-- seu parseCSV
    item?.message ||
    item?.msg ||
    item?.text ||
    item?.body ||
    item?.notificationBody ||
    ""
  ).toString().trim();
}


const BRAND_DEFAULT_PREFIX = "💜 Permittá • Lembrete Psi";

function normalizeReminderSlot(reminderType) {
  const rt = String(reminderType || "").toLowerCase().trim();
  if (!rt) return "";
  if (rt === "slot1" || rt.includes("slot1") || rt === "1" || rt.includes("48")) return "slot1";
  if (rt === "slot2" || rt.includes("slot2") || rt === "2" || rt.includes("24")) return "slot2";
  if (rt === "slot3" || rt.includes("slot3") || rt === "3" || rt.includes("12")) return "slot3";
  return "";
}

function joinTitle(prefix, suffix) {
  const p = String(prefix || "").trim();
  const s = String(suffix || "").trim();
  if (!p) return s;
  if (!s) return p;
  if (/[—\-:•]$/.test(p)) return p + " " + s;
  return p + " — " + s;
}

function resolveReminderTitle(cfg, reminderType) {
  const slot = normalizeReminderSlot(reminderType);
  const defaultsFull = {
    slot1: "💜 Permittá • Lembrete Psi — Seu espaço em 48h",
    slot2: "💜 Permittá • Lembrete Psi — Amanhã: seu horário",
    slot3: "💜 Permittá • Lembrete Psi — Hoje: sessão no seu horário",
    fallback: "💜 Permittá • Lembrete Psi — Seu espaço de cuidado",
  };
  const suffixDefaults = {
    slot1: "Seu espaço em 48h",
    slot2: "Amanhã: seu horário",
    slot3: "Hoje: sessão no seu horário",
    fallback: "Seu espaço de cuidado",
  };
  const keyMap = { slot1: "reminderTitle1", slot2: "reminderTitle2", slot3: "reminderTitle3", fallback: "reminderTitleDefault" };
  const k = keyMap[slot] || keyMap.fallback;
  const raw = cfg && cfg[k] != null ? String(cfg[k]).trim() : "";
  const prefix = cfg && cfg.reminderTitlePrefix != null ? String(cfg.reminderTitlePrefix).trim() : "";
  if (raw) {
    if (prefix && !raw.includes("Permittá") && !raw.includes("Lembrete Psi")) return joinTitle(prefix, raw);
    return raw;
  }
  if (prefix) return joinTitle(prefix, suffixDefaults[slot] || suffixDefaults.fallback);
  return defaultsFull[slot] || defaultsFull.fallback;
}

export async function POST(req) {
  let auth = null;
  try {
    initAdmin();

    // Protege endpoint legado (/api/send) — envio de push é ação sensível.
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, { bucket: "admin:send:legacy", uid: auth.uid, limit: 8, windowMs: 5 * 60_000 });
    if (!rl.ok) return rl.res;


    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!items.length) {
      return NextResponse.json({ ok: false, error: "Nenhum item para envio." }, { status: 400 });
    }

    const db = admin.firestore();
    const messaging = admin.messaging();

    const cfgSnap = await db.collection("config").doc("global").get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};

    let sent = 0;
    let skippedNoPhone = 0;
    let skippedNoMessage = 0;
    let skippedNoToken = 0;
    let errors = [];

    for (const item of items) {
      try {
        const phone = onlyDigits(item.cleanPhone || item.phone || "");
        if (!phone) {
          skippedNoPhone++;
          continue;
        }

        const messageText = pickMessage(item);
        if (!messageText) {
          skippedNoMessage++;
          continue;
        }

        // ✅ prioridade: token que já veio do parseCSV (subscribers.pushToken)
        let token = (item.pushToken || "").toString().trim();

        // ✅ fallback: buscar no Firestore pelo doc subscribers/{phone}
        if (!token) {
          const subSnap = await db.collection("subscribers").doc(phone).get();
          token = subSnap.exists ? (subSnap.data()?.pushToken || "").toString().trim() : "";
        }

        if (!token) {
          skippedNoToken++;
          continue;
        }

        const payload = {
          token,
          notification: {
            title: resolveReminderTitle(cfg, item.reminderType),
            body: messageText,
          },
          data: {
            type: "appointment_reminder",
            reminderType: String(item.reminderType || ""),
            phone,
            nome: String(item.nome || ""),
            date: String(item.data || item.date || ""),
            time: String(item.hora || item.time || ""),
            profissional: String(item.profissional || ""),
          },
        };

        await messaging.send(payload);
        sent++;
      } catch (e) {
        errors.push(String(e?.message || e));
      }
    }

    const types = [...new Set(items.map((i) => i.reminderType).filter(Boolean))].map(String);

    await writeHistory(db, {
      type: "legacy_send_push_summary",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      count: sent,
      skipped: {
        noPhone: skippedNoPhone,
        noMessage: skippedNoMessage,
        noToken: skippedNoToken,
      },
      types,
      summary: `Envio push: ${sent} enviados | sem tel: ${skippedNoPhone} | sem msg: ${skippedNoMessage} | sem token: ${skippedNoToken}`,
      errors: errors.slice(0, 10),
    });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "legacy_send_push",
      meta: { sent, skippedNoPhone, skippedNoMessage, skippedNoToken, types },
    });

    if (sent === 0) {
      // ✅ mensagem mais verdadeira do motivo
      const reason =
        skippedNoToken > 0
          ? "Nenhum token fornecido."
          : skippedNoMessage > 0
          ? "Nenhuma mensagem gerada para envio."
          : "Nada para enviar.";

      return NextResponse.json(
        { ok: false, error: reason, sent, skippedNoPhone, skippedNoMessage, skippedNoToken },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent,
      skippedNoPhone,
      skippedNoMessage,
      skippedNoToken,
    });
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "legacy_send", err: e });
  }
}