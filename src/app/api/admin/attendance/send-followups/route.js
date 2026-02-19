import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";
import { adminError } from "@/lib/server/adminError";

export const runtime = "nodejs";

/**
 * POST /api/admin/attendance/send-followups
 *
 * Envia mensagens de reforço (presença) e psicoeducação (falta) com base em logs importados.
 *
 * Diretriz clínica do produto:
 * - Sem CTA/botão de cancelar/remarcar.
 * - Texto reforça constância, vínculo e responsabilização.
 *
 * Segurança adicional (Step 9):
 * - Bloqueia follow-up quando o paciente NÃO está vinculado (users) → evita enviar para pessoa errada.
 * - Bloqueia quando há telefone ambíguo (o mesmo telefone para múltiplos perfis) e NÃO há vínculo.
 * - Bloqueia quando há conflito entre telefone do log e telefone do perfil.
 */

function normalizeDigits(s) {
  return String(s || "").replace(/\D+/g, "");
}

function canonicalPhone(raw) {
  const d = normalizeDigits(raw);
  if (d.length >= 12 && d.startsWith("55")) return d.slice(2);
  return d;
}

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
  if (admin.apps?.length) return;
  const serviceAccount = getServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function formatDateBR(iso) {
  const s = String(iso || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Suporta placeholders em dois formatos (compatibilidade):
 * - {{ nome }}  (formato antigo)
 * - {nome}      (formato novo)
 */
function interpolate(template, vars) {
  const t = String(template || "");
  // {{var}}
  const a = t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : ""
  );
  // {var}
  return a.replace(/\{\s*(\w+)\s*\}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : ""
  );
}

function isInactiveUserDoc(u) {
  if (!u) return false; // ausência de doc é tratada como "unlinked_patient" em outra camada
  const status = String(u.status || "").toLowerCase();
  if (["inactive", "disabled", "archived", "deleted"].includes(status)) return true;
  if (u.isActive === false) return true;
  if (u.disabled === true) return true;
  if (u.disabledAt) return true;
  if (u.deletedAt) return true;
  if (u.mergedTo) return true;
  return false;
}

async function loadTemplates(db) {
  const snap = await db.collection("config").doc("global").get();
  const cfg = snap.exists ? snap.data() : {};

  // defaults
  const tpl = {
    presentTitle: "💜 Permittá • Lembrete Psi — Parabéns pela presença",
    presentBody:
      "Olá {nome}. Sua presença em {data} às {hora} é um passo de cuidado. A continuidade fortalece o processo.",
    absentTitle: "💜 Permittá • Lembrete Psi — Senti sua falta hoje",
    absentBody:
      "Olá {nome}. Registramos sua ausência em {data} às {hora}. A terapia acontece na continuidade — quando você retorna, o processo segue.",
  };

  if (cfg.attendanceFollowupPresentTitle)
    tpl.presentTitle = String(cfg.attendanceFollowupPresentTitle);
  if (cfg.attendanceFollowupPresentBody)
    tpl.presentBody = String(cfg.attendanceFollowupPresentBody);
  if (cfg.attendanceFollowupAbsentTitle)
    tpl.absentTitle = String(cfg.attendanceFollowupAbsentTitle);
  if (cfg.attendanceFollowupAbsentBody)
    tpl.absentBody = String(cfg.attendanceFollowupAbsentBody);

  return tpl;
}

function parseBodyRange(body) {
  const days = Number(body?.days || 30);
  const fromIsoDate = body?.fromIsoDate ? String(body.fromIsoDate) : null;
  const toIsoDate = body?.toIsoDate ? String(body.toIsoDate) : null;

  if (fromIsoDate && toIsoDate) return { fromIsoDate, toIsoDate, days: null };

  // default: [today-days+1, today] em UTC
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days) + 1);

  const iso = (d) => d.toISOString().slice(0, 10);
  return { fromIsoDate: iso(start), toIsoDate: iso(end), days };
}

function safeErrMessage(err) {
  const msg = String(err?.message || err || "").trim();
  if (!msg) return "unknown_error";
  return msg.length > 500 ? `${msg.slice(0, 500)}…` : msg;
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

function compareByRecent(a, b) {
  const da = String(a?.isoDate || "");
  const db = String(b?.isoDate || "");
  if (da !== db) return db.localeCompare(da);

  const ta = String(a?.time || "");
  const tb = String(b?.time || "");
  if (ta !== tb) return tb.localeCompare(ta);

  const ua = toMillis(a?.updatedAt);
  const ub = toMillis(b?.updatedAt);
  return ub - ua;
}

export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:attendance:send-followups",
      uid: auth.uid,
      limit: 8,
      windowMs: 5 * 60_000,
    });
    if (!rl.ok) return rl.res;

    initAdmin();
    const db = admin.firestore();

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dryRun;

    const { fromIsoDate, toIsoDate, days } = parseBodyRange(body);
    const limit = Math.min(1000, Math.max(1, Number(body?.limit || 200)));

    const tpl = await loadTemplates(db);

    // Carrega logs do período
    const logsSnap = await db
      .collection("attendance_logs")
      .where("isoDate", ">=", fromIsoDate)
      .where("isoDate", "<=", toIsoDate)
      .get();

    const totalLogs = logsSnap.size;

    // Dedup por chave (patientId + isoDate + time + profissional)
    const logs = [];
    logsSnap.forEach((d) => logs.push({ id: d.id, ...d.data() }));

    const keyOf = (x) =>
      `${String(x.patientId || "")}__${String(x.isoDate || "")}__${String(x.time || "")}__${String(
        x.profissional || x.professional || ""
      )}`;

    const pickNewest = (a, b) => {
      const ta = toMillis(a?.updatedAt);
      const tb = toMillis(b?.updatedAt);
      return tb >= ta ? b : a;
    };

    const byKey = new Map();
    for (const l of logs) {
      const k = keyOf(l);
      if (!k) continue;
      byKey.set(k, byKey.has(k) ? pickNewest(byKey.get(k), l) : l);
    }

    const candidatesAll = Array.from(byKey.values()).sort(compareByRecent);
    const candidatesTotal = candidatesAll.length;
    const candidatesList = candidatesAll.slice(0, limit);
    const candidates = candidatesList.length;

    const out = {
      ok: true,
      dryRun,
      fromIsoDate,
      toIsoDate,
      days: days ?? null,
      limit,
      totalLogs,
      candidatesTotal,
      candidates,
      sent: 0,
      blocked: 0,
      blockedAlreadySent: 0,
      blockedNoToken: 0,
      blockedNoPhone: 0,
      blockedInactive: 0,
      blockedInactivePatient: 0,
      blockedInactiveSubscriber: 0,
      blockedUnlinkedPatient: 0,
      blockedAmbiguousPhone: 0,
      blockedPhoneMismatch: 0,
      blockedErrors: 0,
      byStatus: { present: 0, absent: 0 },
      sample: [],
    };

    // Cache users/subscribers para reduzir reads
    const userByPhoneCache = new Map();
    const userByPidCache = new Map();
    const userByUidCache = new Map();
    const subCache = new Map();

    async function getUsersByPhone(phone) {
      if (userByPhoneCache.has(phone)) return userByPhoneCache.get(phone);
      const snap = await db
        .collection("users")
        .where("role", "==", "patient")
        .where("phoneCanonical", "==", phone)
        .limit(3)
        .get();
      const docs = snap.empty
        ? []
        : snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      userByPhoneCache.set(phone, docs);
      return docs;
    }

    async function getUserByUid(uid) {
      const key = String(uid || "").trim();
      if (!key) return null;
      if (userByUidCache.has(key)) return userByUidCache.get(key);
      const snap = await db.collection("users").doc(key).get();
      const doc = snap.exists ? { id: snap.id, ...snap.data() } : null;
      userByUidCache.set(key, doc);
      return doc;
    }

    async function getUserByPatientId(patientId) {
      const key = String(patientId || "").trim();
      if (!key) return null;
      if (userByPidCache.has(key)) return userByPidCache.get(key);

      // Primeiro tenta patientExternalId (padrão recomendado), depois patientId (legado)
      let snap = await db
        .collection("users")
        .where("role", "==", "patient")
        .where("patientExternalId", "==", key)
        .limit(1)
        .get();

      if (snap.empty) {
        snap = await db
          .collection("users")
          .where("role", "==", "patient")
          .where("patientId", "==", key)
          .limit(1)
          .get();
      }

      const doc = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
      userByPidCache.set(key, doc);
      return doc;
    }

    async function getSubscriber(phone) {
      if (subCache.has(phone)) return subCache.get(phone);
      const doc = await db.collection("subscribers").doc(phone).get();
      const data = doc.exists ? doc.data() : null;
      subCache.set(phone, data);
      return data;
    }

    const maxSample = 8;

    for (const current of candidatesList) {
      const status = String(current.status || "").toLowerCase() === "present" ? "present" : "absent";
      out.byStatus[status] += 1;

      const pid =
        String(current.patientId || current.patientExternalId || current.id || "").trim() || null;

      const phoneFromLog = canonicalPhone(current.phoneCanonical || current.phone || "");

      // Tenta obter userDoc primeiro por linkedUserId (mais confiável), depois por patientId
      let userDoc = null;
      if (current?.linkedUserId) {
        const u = await getUserByUid(current.linkedUserId);
        if (u && String(u.role || "") === "patient") userDoc = u;
      }
      if (!userDoc && pid) {
        userDoc = await getUserByPatientId(pid);
      }

      const phoneFromProfile = canonicalPhone(userDoc?.phoneCanonical || userDoc?.phone || "");
      const phone = phoneFromProfile || phoneFromLog;

      const vars = {
        nome: current.name || userDoc?.name || "",
        data: formatDateBR(current.isoDate || ""),
        dataIso: current.isoDate || "",
        hora: current.time || "",
        profissional: current.profissional || current.professional || "",
        servico: current.service || "",
        local: current.location || "",
        id: pid || current.patientId || userDoc?.patientExternalId || "",
      };

      const title = status === "present" ? tpl.presentTitle : tpl.absentTitle;
      const bodyText = status === "present" ? tpl.presentBody : tpl.absentBody;

      const finalTitle = interpolate(title, vars);
      const finalBody = interpolate(bodyText, vars);

      let blockedReason = null;

      // Idempotência
      if (current?.followup?.sentAt) blockedReason = "already_sent";

      // Conflito explícito: log tem phone e perfil tem outro
      if (!blockedReason && phoneFromLog && phoneFromProfile && phoneFromLog !== phoneFromProfile) {
        blockedReason = "phone_mismatch";
      }

      // Sem telefone
      if (!blockedReason && !phone) blockedReason = "no_phone";

      // Vínculo: se não achou userDoc, bloqueia.
      // Se não tem vínculo, diferencia "ambiguous_phone" quando o mesmo phone bate em +1 perfil.
      if (!blockedReason && !userDoc) {
        if (phone) {
          const matches = await getUsersByPhone(phone);
          if (matches.length > 1) blockedReason = "ambiguous_phone";
          else blockedReason = "unlinked_patient";
        } else {
          blockedReason = "unlinked_patient";
        }
      }

      // Se userDoc existe mas o telefone do log aponta para outro perfil
      if (!blockedReason && phone && userDoc?.phoneCanonical) {
        const matches = await getUsersByPhone(phone);
        if (matches.length === 1 && matches[0].id !== userDoc.id) {
          blockedReason = "phone_mismatch";
        }
        if (matches.length > 1) {
          // Com vínculo, não é necessariamente problema (responsável pode ser o mesmo).
          // Mantemos como não bloqueante.
        }
      }

      // Paciente inativo
      if (!blockedReason && isInactiveUserDoc(userDoc)) {
        blockedReason = "inactive_patient";
      }

      // Subscriber: token/ativo (só se tiver phone)
      const sub = phone ? await getSubscriber(phone) : null;
      const token = sub?.pushToken || sub?.token || null;

      if (!blockedReason && sub?.isActive === false) blockedReason = "inactive_subscriber";
      if (!blockedReason && !token) blockedReason = "no_token";

      // Sample preview
      if (dryRun && out.sample.length < maxSample) {
        out.sample.push({
          status,
          phoneCanonical: phone,
          name: vars.nome,
          title: finalTitle,
          body: finalBody,
          canSend: blockedReason == null,
          blockedReason,
        });
      }

      // Contadores/bloqueios
      if (blockedReason) {
        out.blocked += 1;
        if (blockedReason === "already_sent") out.blockedAlreadySent += 1;
        else if (blockedReason === "no_phone") out.blockedNoPhone += 1;
        else if (blockedReason === "no_token") out.blockedNoToken += 1;
        else if (blockedReason === "inactive_patient") {
          out.blockedInactive += 1;
          out.blockedInactivePatient += 1;
        } else if (blockedReason === "inactive_subscriber") {
          out.blockedInactive += 1;
          out.blockedInactiveSubscriber += 1;
        } else if (blockedReason === "unlinked_patient") out.blockedUnlinkedPatient += 1;
        else if (blockedReason === "ambiguous_phone") out.blockedAmbiguousPhone += 1;
        else if (blockedReason === "phone_mismatch") out.blockedPhoneMismatch += 1;
        continue;
      }

      if (dryRun) continue;

      const logId = current?.id ? String(current.id) : null;
      const logRef = logId ? db.collection("attendance_logs").doc(logId) : null;

      // Marca tentativa
      if (logRef) {
        await logRef.set(
          {
            followup: {
              lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
              status,
              lastResult: "sending",
              lastError: null,
            },
          },
          { merge: true }
        );
      }

      const message = {
        token,
        notification: {
          title: finalTitle,
          body: finalBody,
        },
        data: {
          kind: "attendance_followup",
          status,
          phoneCanonical: phone,
          isoDate: String(current.isoDate || ""),
          logId: logId || "",
        },
      };

      try {
        await admin.messaging().send(message);
        out.sent += 1;

        if (logRef) {
          await logRef.set(
            {
              followup: {
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                status,
                lastResult: "sent",
                lastError: null,
              },
            },
            { merge: true }
          );
        }
      } catch (e) {
        out.blocked += 1;
        out.blockedErrors += 1;

        if (logRef) {
          await logRef.set(
            {
              followup: {
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
                status,
                lastResult: "error",
                lastError: safeErrMessage(e),
              },
            },
            { merge: true }
          );
        }
      }
    }

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "attendance_send_followups",
      meta: {
        dryRun,
        fromIsoDate,
        toIsoDate,
        days: days ?? null,
        limit,
        totalLogs,
        candidatesTotal,
        candidates,
        sent: out.sent,
        blocked: out.blocked,
        blockedAlreadySent: out.blockedAlreadySent,
        blockedNoToken: out.blockedNoToken,
        blockedNoPhone: out.blockedNoPhone,
        blockedInactive: out.blockedInactive,
        blockedUnlinkedPatient: out.blockedUnlinkedPatient,
        blockedAmbiguousPhone: out.blockedAmbiguousPhone,
        blockedPhoneMismatch: out.blockedPhoneMismatch,
        blockedErrors: out.blockedErrors,
        byStatus: out.byStatus,
      },
    });

    return NextResponse.json(out);
  } catch (e) {
    return adminError({
      req,
      auth: auth?.ok ? auth : null,
      action: "attendance_send_followups",
      err: e,
    });
  }
}
