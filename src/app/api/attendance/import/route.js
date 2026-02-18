import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";
import { adminError } from "@/lib/server/adminError";
import { writeHistory } from "@/lib/server/historyLog";
export const runtime = "nodejs";
/**
 * POST /api/admin/attendance/import
 *
 * Importa CSV de presença/faltas para a coleção attendance_logs.
 * - Server-side (Admin SDK) para evitar rules no client.
 * - NÃO cria reagendar/cancelar.
 * - Gera resumo e registra em history.
 *
 * Payload JSON:
 * {
 *   (segurança: Authorization Bearer idToken + role admin),
 *   csvText: string,            // conteúdo CSV (com header)
 *   source?: string,           // nome da fonte/planilha
 *   defaultStatus?: "present" | "absent" (opcional)
 * }
 *
 * CSV esperado (flexível):
 * - phone | telefone | celular
 * - date | data
 * - status | presença | presenca | falta
 * - name | nome (opcional)
 * - appointmentId (opcional)
 *
 * phoneCanonical padrão do projeto: DDD+número (10/11), sem 55
 */

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

function normalizePhoneCanonical(input) {
  let d = onlyDigits(input).replace(/^0+/, "");
  if (!d) return "";
  // remove 55 se vier
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

function normalizeToISODate(dateStr) {
  const s = String(dateStr || "").trim();
  if (!s) return "";
  const isoLike = s.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
  if (isoLike) return `${isoLike[1]}-${isoLike[2]}-${isoLike[3]}`;
  const brLike = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (brLike) return `${brLike[3]}-${brLike[2]}-${brLike[1]}`;
  return "";
}

function parseCSVLine(line) {
  // CSV simples com vírgula ou ponto e vírgula; sem aspas complexas (suficiente pro seu caso de planilha)
  const sep = line.includes(";") && !line.includes(",") ? ";" : ",";
  return line.split(sep).map((x) => String(x || "").trim());
}

function normalizeHeaderKey(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mapStatus(raw, defaultStatus = "absent") {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return defaultStatus;
  if (["p", "presente", "presenca", "presença", "present", "compareceu", "ok", "sim", "1", "true"].includes(v))
    return "present";
  if (["f", "faltou", "falta", "absent", "missed", "nao", "não", "0", "false", "no_show", "noshow"].includes(v))
    return "absent";
  // caso venha algo estranho, mantém default
  return defaultStatus;
}

function makeAttendanceId({ phoneCanonical, isoDate, appointmentId }) {
  const p = onlyDigits(phoneCanonical);
  const d = String(isoDate || "").replace(/[^0-9-]/g, "");
  const a = String(appointmentId || "").trim();
  // se tiver appointmentId, usa; se não, usa phone+date
  return a ? `${a}`.slice(0, 180) : `${p}_${d}`.slice(0, 180);
}

export async function POST(req) {
  let auth = null;
  try {
    initAdmin();

    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, { bucket: "admin:attendance:import:legacy", uid: auth.uid, limit: 10, windowMs: 5 * 60_000 });
    if (!rl.ok) return rl.res;


    const body = await req.json().catch(() => ({}));


    const csvText = String(body.csvText || "").trim();
    if (!csvText) return NextResponse.json({ ok: false, error: "csvText vazio" }, { status: 400 });

    const source = String(body.source || "attendance_import").trim();
    const defaultStatus = String(body.defaultStatus || "absent").toLowerCase() === "present" ? "present" : "absent";

    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return NextResponse.json({ ok: false, error: "CSV sem dados" }, { status: 400 });

    const header = parseCSVLine(lines[0]).map(normalizeHeaderKey);

    const idxPhone = header.findIndex((h) => ["phone", "telefone", "celular", "whatsapp", "numero", "número"].includes(h));
    const idxDate = header.findIndex((h) => ["date", "data", "dia"].includes(h));
    const idxStatus = header.findIndex((h) => ["status", "presenca", "presença", "presente", "falta"].includes(h));
    const idxName = header.findIndex((h) => ["name", "nome", "paciente"].includes(h));
    const idxAppointmentId = header.findIndex((h) => ["appointmentid", "appointment_id", "id", "sessaoid", "sessao_id"].includes(h));

    if (idxPhone === -1) return NextResponse.json({ ok: false, error: "CSV sem coluna telefone" }, { status: 400 });
    if (idxDate === -1) return NextResponse.json({ ok: false, error: "CSV sem coluna data" }, { status: 400 });

    const db = admin.firestore();
    const batch = db.batch();

    let imported = 0;
    let skipped = 0;
    const errors = [];

    // limite batch: 500 writes
    let ops = 0;
    async function commitIfNeeded() {
      if (ops >= 450) {
        await batch.commit();
        ops = 0;
      }
    }

    const nowTs = admin.firestore.Timestamp.now();

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const rawPhone = cols[idxPhone] || "";
      const rawDate = cols[idxDate] || "";
      const rawStatus = idxStatus >= 0 ? cols[idxStatus] : "";

      const phoneCanonical = normalizePhoneCanonical(rawPhone);
      const isoDate = normalizeToISODate(rawDate);

      if (!phoneCanonical || !(phoneCanonical.length === 10 || phoneCanonical.length === 11)) {
        skipped += 1;
        errors.push({ line: i + 1, error: "telefone inválido", value: rawPhone });
        continue;
      }
      if (!isoDate) {
        skipped += 1;
        errors.push({ line: i + 1, error: "data inválida", value: rawDate });
        continue;
      }

      const status = mapStatus(rawStatus, defaultStatus);
      const name = idxName >= 0 ? String(cols[idxName] || "").trim() : "";
      const appointmentId = idxAppointmentId >= 0 ? String(cols[idxAppointmentId] || "").trim() : "";

      const docId = makeAttendanceId({ phoneCanonical, isoDate, appointmentId });
      const ref = db.collection("attendance_logs").doc(docId);

      batch.set(
        ref,
        {
          phoneCanonical,
          isoDate,
          status,
          name: name || null,
          appointmentId: appointmentId || null,
          source,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
        { merge: true }
      );
      ops += 1;
      imported += 1;

      await commitIfNeeded();
    }

    if (ops > 0) {
      await batch.commit();
    }

    // history log
    await writeHistory(db, {
      type: "attendance_import_summary",
      createdAt: nowTs,
      count: imported,
      skipped,
      source,
      sampleErrors: errors.slice(0, 10),
    });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "attendance_import_commit_legacy",
      meta: { source, imported, skipped },
    });

    return NextResponse.json(
      { ok: true, imported, skipped, errors: errors.slice(0, 50) },
      { status: 200 }
    );
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "attendance_import_legacy", err: e });
  }
}