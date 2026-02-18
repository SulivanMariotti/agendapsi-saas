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
 * PADRÃO DA PLANILHA (CSV) — PRESENÇA/FALTAS
 * ID, NOME, DATA, HORA, PROFISSIONAL, SERVIÇOS, LOCAL, STATUS
 *
 * ⚠️ IMPORTANTE:
 * - ID = ID DO PACIENTE (no seu sistema atual), NÃO é ID da sessão.
 * - Para permitir o MESMO paciente ter várias datas (presente em um dia e falta em outro),
 *   o registro em attendance_logs é gravado com chave composta:
 *     {patientId}_{isoDate}_{hora}_{profissionalSlug}
 *
 * Como obtemos o telefone (caso pai/filho usem o mesmo número):
 * - O telefone é do RESPONSÁVEL (contato). Ele pode ser compartilhado.
 * - Buscamos o telefone em `users` via campo `patientExternalId` (ou `patientId`).
 *   - userDoc.phoneCanonical deve existir.
 *
 * Server-side (Admin SDK) para evitar rules no client.
 * NÃO cria/permite reagendar/cancelar.
 * Registra resumo em history (type=attendance_import_summary) apenas quando dryRun=false.
 *
 * Body:
 * - csvText: string (obrigatório)
 * - source: string (opcional)
 * - defaultStatus: "present"|"absent" (opcional, usado se coluna STATUS faltar ou vier vazia)
 * - dryRun: boolean (opcional) -> valida/normaliza e retorna preview sem gravar no Firestore
 */

function getServiceAccount() {
  const b64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_B64;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT(_B64) env var");
  return JSON.parse(raw);
}

function initAdmin() {
  if (admin.apps.length) return;
  admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
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

function normalizeTime(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function parseCSVLine(line) {
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

function safeSlug(str, max = 18) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, max);
}

function normalizeDefaultStatus(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "present" || v === "absent") return v;
  return "absent";
}

function mapStatus(raw, fallbackStatus = "absent") {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return fallbackStatus;

  if (
    [
      "p",
      "presente",
      "presenca",
      "presença",
      "present",
      "compareceu",
      "ok",
      "sim",
      "1",
      "true",
    ].includes(v)
  )
    return "present";

  if (
    [
      "f",
      "faltou",
      "falta",
      "absent",
      "missed",
      "nao",
      "não",
      "0",
      "false",
      "no_show",
      "noshow",
    ].includes(v)
  )
    return "absent";

  // default: absent (clínica: ausência precisa ser conscientizada)
  return fallbackStatus;
}

function isKnownStatus(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return true;
  const yes = [
    "p","presente","presenca","presença","present","compareceu","ok","sim","1","true"
  ];
  const no = [
    "f","faltou","falta","absent","missed","nao","não","0","false","no_show","noshow"
  ];
  return yes.includes(v) || no.includes(v);
}

function maskPhoneCanonical(pc) {
  const s = String(pc || "").trim();
  if (!s) return "";
  if (s.length <= 4) return s;
  return `${"*".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

async function findUserByPatientId(db, patientId) {
  const pid = String(patientId || "").trim();
  if (!pid) return null;

  // 1) tenta patientExternalId
  const q1 = await db.collection("users").where("patientExternalId", "==", pid).limit(1).get();
  if (!q1.empty) return q1.docs[0].data() || null;

  // 2) fallback patientId
  const q2 = await db.collection("users").where("patientId", "==", pid).limit(1).get();
  if (!q2.empty) return q2.docs[0].data() || null;

  return null;
}

export async function POST(req) {
  let auth = null;
  try {
    initAdmin();

    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:attendance:import",
      uid: auth.uid,
      limit: 10,
      windowMs: 5 * 60_000,
    });
    if (!rl.ok) return rl.res;


    const body = await req.json().catch(() => ({}));


    const csvText = String(body.csvText || "").trim();
    if (!csvText) return NextResponse.json({ ok: false, error: "csvText vazio" }, { status: 400 });

    const source = String(body.source || "attendance_import").trim();
    const dryRun = Boolean(body.dryRun);
    const defaultStatus = normalizeDefaultStatus(body.defaultStatus);

    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) return NextResponse.json({ ok: false, error: "CSV sem dados" }, { status: 400 });

    const header = parseCSVLine(lines[0]).map(normalizeHeaderKey);

    const idxId = header.findIndex((h) => ["id", "codigo", "código", "patientid", "patient_id"].includes(h));
    const idxName = header.findIndex((h) => ["nome", "name", "paciente"].includes(h));
    const idxDate = header.findIndex((h) => ["data", "date", "dia"].includes(h));
    const idxTime = header.findIndex((h) => ["hora", "time", "horario", "horário"].includes(h));
    const idxProf = header.findIndex((h) => ["profissional", "profissional(a)", "prof"].includes(h));
    const idxService = header.findIndex((h) => ["servico", "serviço", "servicos", "serviços", "service", "tipo"].includes(h));
    const idxLocation = header.findIndex((h) => ["local", "location", "sala"].includes(h));
    const idxStatus = header.findIndex((h) => ["status", "presenca", "presença", "presenca/falta", "falta"].includes(h));    const missing = [];
    if (idxId === -1) missing.push("ID");
    if (idxName === -1) missing.push("NOME");
    if (idxDate === -1) missing.push("DATA");
    if (idxTime === -1) missing.push("HORA");
    if (idxProf === -1) missing.push("PROFISSIONAL");
    if (idxService === -1) missing.push("SERVIÇOS");
    if (idxLocation === -1) missing.push("LOCAL");

    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: `CSV sem coluna(s): ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const db = admin.firestore();
    const nowTs = admin.firestore.Timestamp.now();

    const candidates = Math.max(0, lines.length - 1);
        let imported = 0; // dryRun: "wouldImport"
    let skipped = 0;

    const errors = [];
    const warnings = [];
    const sample = [];

    let warned = 0;
    let skippedDuplicateInFile = 0;
    let warnedNoPhone = 0;

    // Preview normalizado (apenas em dryRun): linhas que seriam importadas
    const MAX_NORMALIZED_PREVIEW_ROWS = 5000;
    const normalizedRows = [];
    let normalizedRowsTruncated = false;

    const seenDocIds = new Set();

    // cache de user por patientId
    const userCache = new Map();

    let batch = db.batch();
    let ops = 0;

    async function commitIfNeeded(force = false) {
      if (dryRun) return; // nunca commita em dryRun
      if (ops >= 450 || (force && ops > 0)) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const rawLine = lines[i];

      const patientId = String(cols[idxId] || "").trim();
      const name = idxName >= 0 ? String(cols[idxName] || "").trim() : "";
      const rawDate = String(cols[idxDate] || "").trim();
      const rawTime = String(cols[idxTime] || "").trim();
      const profissional = idxProf >= 0 ? String(cols[idxProf] || "").trim() : "";
      const service = idxService >= 0 ? String(cols[idxService] || "").trim() : "";
      const location = idxLocation >= 0 ? String(cols[idxLocation] || "").trim() : "";

      const isoDate = normalizeToISODate(rawDate);
      const time = normalizeTime(rawTime);

      const statusRaw = idxStatus >= 0 ? cols[idxStatus] : "";
      const status = mapStatus(statusRaw, defaultStatus);
      const statusKnown = isKnownStatus(statusRaw);

      const sampleRow = {
        line: i + 1,
        patientId: patientId || null,
        name: name || null,
        isoDate: isoDate || null,
        time: time || null,
        profissional: profissional || null,
        service: service || null,
        location: location || null,
        status,
        phone: null,
        result: "ok",
        reason: null,

      };
      const issueContext = {
        patientId: patientId || null,
        name: name || null,
        rawDate: rawDate || null,
        rawTime: rawTime || null,
        profissional: profissional || null,
        service: service || null,
        location: location || null,
        statusRaw: String(statusRaw || "").trim() || null,
        status,
        isoDate: isoDate || null,
        time: time || null,
        rawLine: rawLine || null,
      };

      const pushError = (code, field, message, value = "") => {
        errors.push({
          type: "error",
          line: i + 1,
          code,
          field,
          error: message,
          value: value ?? "",
          ...issueContext,
        });
      };

      const pushWarning = (code, field, message, value = "") => {
        warned += 1;
        warnings.push({
          type: "warning",
          line: i + 1,
          code,
          field,
          warning: message,
          value: value ?? "",
          ...issueContext,
        });
      };

      if (!patientId) {
        skipped += 1;
        pushError("missing_id", "ID", "ID vazio (coluna ID)", "");
        sampleRow.result = "skip";
        sampleRow.reason = "missing_id";
        if (sample.length < 10) sample.push(sampleRow);
        continue;
      }
      if (!isoDate) {
        skipped += 1;
        pushError("invalid_date", "DATA", "DATA inválida. Esperado dd/mm/aaaa ou yyyy-mm-dd", rawDate);
        sampleRow.result = "skip";
        sampleRow.reason = "invalid_date";
        if (sample.length < 10) sample.push(sampleRow);
        continue;
      }
      if (!time) {
        skipped += 1;
        pushError("invalid_time", "HORA", "HORA inválida. Esperado HH:MM (ex.: 14:00)", rawTime);
        sampleRow.result = "skip";
        sampleRow.reason = "invalid_time";
        if (sample.length < 10) sample.push(sampleRow);
        continue;
      }

      const profSlug = safeSlug(profissional || "prof", 12) || "prof";
      const docId = `${patientId}_${isoDate}_${time.replace(":", "")}_${profSlug}`.slice(0, 180);

      if (seenDocIds.has(docId)) {
        skipped += 1;
        skippedDuplicateInFile += 1;
        pushError("duplicate_in_file", "LINHA", "Linha duplicada no arquivo (mesmo ID/data/hora/prof.)", docId);
        sampleRow.result = "skip";
        sampleRow.reason = "duplicate_in_file";
        if (sample.length < 10) sample.push(sampleRow);
        continue;
      }
      seenDocIds.add(docId);

      // Avisos (não bloqueiam importação)
      const warnRow = (reason, code, field, warning, value) => {
        pushWarning(code, field, warning, value);
        if (sampleRow.result !== "skip") sampleRow.result = "warn";
        if (!sampleRow.reason) sampleRow.reason = reason;
      };

      if (!name) warnRow("missing_name", "missing_name", "NOME", "NOME vazio (importado, mas recomenda-se completar)", "");
      if (!profissional) warnRow("missing_profissional", "missing_profissional", "PROFISSIONAL", "PROFISSIONAL vazio (importado, mas recomenda-se completar)", "");
      if (!service) warnRow("missing_service", "missing_service", "SERVIÇOS", "SERVIÇOS vazio (importado, mas recomenda-se completar)", "");
      if (!location) warnRow("missing_location", "missing_location", "LOCAL", "LOCAL vazio (importado, mas recomenda-se completar)", "");
      if (!statusKnown && String(statusRaw || "").trim()) warnRow("unknown_status", "unknown_status", "STATUS", "STATUS não reconhecido (usando status padrão)", String(statusRaw || ""));

      let user = userCache.get(patientId);
      if (user === undefined) {
        user = await findUserByPatientId(db, patientId);
        userCache.set(patientId, user);
      }

      const phoneCanonical = user ? String(user.phoneCanonical || user.phone || "").trim() : "";
      sampleRow.phone = phoneCanonical ? maskPhoneCanonical(phoneCanonical) : null;

      if (!phoneCanonical) {
        warnedNoPhone += 1;
        // Importa para constância, mas alerta: followups dependem de telefone ou vínculo correto
        pushWarning(
          "no_phone_for_patient",
          "PHONE",
          "Sem phoneCanonical: paciente não vinculado/sem telefone. Importado para constância; ajuste o cadastro para enviar followups.",
          patientId
        );
        if (sampleRow.result !== "skip") sampleRow.result = "warn";
        if (!sampleRow.reason) sampleRow.reason = "no_phone_for_patient";
      }

      if (!dryRun) {
        const ref = db.collection("attendance_logs").doc(docId);
        batch.set(
          ref,
          {
            patientId, // ID do paciente (do seu sistema)
            phoneCanonical: phoneCanonical || null, // pode ser compartilhado (responsável)
            hasPhone: Boolean(phoneCanonical),
            name: name || (user ? user.name || null : null),
            isoDate,
            time,
            profissional: profissional || null,
            service: service || null,
            location: location || null,
            status,
            source,
            createdAt: nowTs,
            updatedAt: nowTs,
          },
          { merge: true }
        );
        ops += 1;
        await commitIfNeeded();
      }

      imported += 1;

    if (dryRun) {
        if (normalizedRows.length < MAX_NORMALIZED_PREVIEW_ROWS) {
          normalizedRows.push({
            line: sampleRow.line,
            patientId: sampleRow.patientId,
            name: sampleRow.name,
            isoDate: sampleRow.isoDate,
            time: sampleRow.time,
            profissional: sampleRow.profissional,
            service: sampleRow.service,
            location: sampleRow.location,
            status: sampleRow.status,
            phone: sampleRow.phone,
          });
        } else {
          normalizedRowsTruncated = true;
        }
      }

      if (sample.length < 10) sample.push(sampleRow);
    }

    await commitIfNeeded(true);

    if (!dryRun) {
      await writeHistory(db, {
        type: "attendance_import_summary",
        createdAt: nowTs,
        count: imported,
        skipped,
        source,
        sampleErrors: errors.slice(0, 10),
      });
    }

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: dryRun ? "attendance_import_preview" : "attendance_import_commit",
      meta: { source, dryRun, candidates, imported, skipped, skippedDuplicateInFile, warned, warnedNoPhone },
    });

    if (dryRun) {
      return NextResponse.json(
        {
          ok: true,
          dryRun: true,
          candidates,
          wouldImport: imported,
          skipped,
          skippedDuplicateInFile,
          warned,
          warnedNoPhone,
          errors: errors.slice(0, 200),
          warnings: warnings.slice(0, 200),
          normalizedRows,
          normalizedRowsTruncated,
          sample,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        imported,
        skipped,
        skippedDuplicateInFile,
        warned,
        warnedNoPhone,
        errors: errors.slice(0, 50),
        warnings: warnings.slice(0, 50),
      },
      { status: 200 }
    );
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "attendance_import", err: e });
  }
}