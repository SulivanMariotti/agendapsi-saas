import { NextResponse } from "next/server";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";
import { adminError } from "@/lib/server/adminError";
import { writeHistory } from "@/lib/server/historyLog";
import { makeBatchId } from "@/lib/server/batchId";

export const runtime = "nodejs";

/**
 * POST /api/admin/attendance/import
 *
 * Importa CSV de Presença/Faltas para `attendance_logs` (Admin SDK).
 * Objetivo clínico: sustentar constância e vínculo.
 *
 * Aceita CSV com:
 * - Separador autodetectado pelo cabeçalho: `;` | `,` | `TAB`
 * - UTF-8 com BOM (removido do header)
 * - Colunas opcionais (além das obrigatórias)
 * - Telefone opcional como fallback (sem forçar envio de followups quando vínculo é incerto)
 * - DATA/HORA em colunas separadas OU em coluna única (DATAHORA)
 *
 * Body:
 * - csvText: string (obrigatório)
 * - source: string (opcional)
 * - defaultStatus: "present"|"absent" (opcional)
 * - dryRun: boolean (opcional)
 * - reportMode: "auto"|"mapped" (opcional)
 * - columnMap: objeto (opcional, quando reportMode="mapped")
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

function stripBOM(s) {
  const str = String(s ?? "");
  return str.replace(/^\uFEFF/, "");
}

function normalizeHeaderKey(h) {
  return stripBOM(h)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function detectSeparator(headerLine) {
  const line = String(headerLine ?? "");
  const seps = [";", ",", "\t"];

  const countOutsideQuotes = (sep) => {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        // "" dentro de aspas
        if (inQuotes && line[i + 1] === '"') {
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && ch === sep) count += 1;
    }
    return count;
  };

  let best = ";";
  let bestCount = -1;
  for (const s of seps) {
    const c = countOutsideQuotes(s);
    if (c > bestCount) {
      best = s;
      bestCount = c;
    }
  }
  return best;
}

function splitCSVLine(line, sep) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  const s = String(line ?? "");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '"') {
      if (inQuotes && s[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === sep) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((x) => String(x ?? "").trim());
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
  // HH:MM or HH:MM:SS
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return t;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function normalizeDateTime(raw) {
  const s = String(raw || "").trim();
  if (!s) return { isoDate: "", time: "" };

  // yyyy-mm-ddTHH:MM or yyyy-mm-dd HH:MM
  let m = s.match(/^(\d{4}[/-]\d{2}[/-]\d{2})[ T](\d{1,2}:\d{2})(?::\d{2})?$/);
  if (m) {
    const isoDate = normalizeToISODate(m[1]);
    const time = normalizeTime(m[2]);
    return { isoDate, time };
  }

  // dd/mm/yyyy HH:MM
  m = s.match(/^(\d{2}[/-]\d{2}[/-]\d{4})[ T](\d{1,2}:\d{2})(?::\d{2})?$/);
  if (m) {
    const isoDate = normalizeToISODate(m[1]);
    const time = normalizeTime(m[2]);
    return { isoDate, time };
  }

  return { isoDate: "", time: "" };
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
      "ausente",
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

  return fallbackStatus;
}

function isKnownStatus(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return true;

  const yes = [
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
  ];
  const no = [
    "f",
    "faltou",
    "falta",
    "ausente",
    "absent",
    "missed",
    "nao",
    "não",
    "0",
    "false",
    "no_show",
    "noshow",
  ];

  return yes.includes(v) || no.includes(v);
}

function normalizeDigits(s) {
  return String(s || "").replace(/\D+/g, "");
}

function canonicalPhone(raw) {
  const d = normalizeDigits(raw);
  if (!d) return "";
  if (d.length >= 12 && d.startsWith("55")) return d.slice(2);
  return d;
}

function isValidPhoneCanonical(pc) {
  const d = canonicalPhone(pc);
  return d.length === 10 || d.length === 11;
}

function maskPhoneCanonical(pc) {
  const s = String(pc || "").trim();
  if (!s) return "";
  if (s.length <= 4) return s;
  return `${"*".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

function maskDigitsTailText(raw, keep = 4) {
  const s = String(raw || "");
  if (!s) return "";
  return s.replace(/\d{6,}/g, (m) => `***${m.slice(-Math.max(0, keep))}`);
}

function sanitizeCsvLinePreview(line, max = 220) {
  let s = String(line || "");
  if (!s) return null;

  // mask emails (keep first char + domain)
  s = s.replace(/([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})/gi, (m, u, d) => {
    const head = u && u.length ? u[0] : "*";
    return `${head}***@${d}`;
  });

  // mask long digit sequences (phones/IDs)
  s = maskDigitsTailText(s, 4);

  if (s.length > max) s = s.slice(0, max) + "…";
  return s;
}

async function findUserByPatientId(db, patientId) {
  const pid = String(patientId || "").trim();
  if (!pid) return null;

  // 1) patientExternalId
  const q1 = await db
    .collection("users")
    .where("patientExternalId", "==", pid)
    .limit(1)
    .get();
  if (!q1.empty) return { id: q1.docs[0].id, ...q1.docs[0].data() };

  // 2) fallback patientId
  const q2 = await db
    .collection("users")
    .where("patientId", "==", pid)
    .limit(1)
    .get();
  if (!q2.empty) return { id: q2.docs[0].id, ...q2.docs[0].data() };

  return null;
}

function resolveIdxAuto(headerKeys, candidates) {
  for (const c of candidates) {
    const idx = headerKeys.findIndex((h) => h === c);
    if (idx >= 0) return idx;
  }
  return -1;
}

function resolveIdxMapped(headerKeys, colValue) {
  if (colValue == null) return -1;
  if (typeof colValue === "number" && Number.isFinite(colValue)) {
    const idx = Math.trunc(colValue);
    return idx >= 0 && idx < headerKeys.length ? idx : -1;
  }
  const key = normalizeHeaderKey(String(colValue));
  if (!key) return -1;
  return headerKeys.findIndex((h) => h === key);
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

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 3600000,
      defaultValue: {},
      allowedKeys: ["csvText", "source", "defaultStatus", "dryRun", "reportMode", "columnMap"],
      label: "attendance-import",
      showKeys: true,
    });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    const body = bodyRes.value;

    const csvText = String(body.csvText || "").trim();
    if (!csvText)
      return NextResponse.json({ ok: false, error: "csvText vazio" }, { status: 400 });

    const source = String(body.source || "attendance_import").trim();
    const dryRun = Boolean(body.dryRun);
    const batchId = makeBatchId("attendance_import", dryRun ? "dry" : "commit");
    const defaultStatus = normalizeDefaultStatus(body.defaultStatus);

    const reportMode = String(body.reportMode || "auto").trim();
    const columnMap = body && typeof body.columnMap === "object" ? body.columnMap : null;

    const rawLines = csvText
      .split(/\r?\n/)
      .map((l) => String(l ?? ""))
      .filter((l) => l.trim().length > 0);

    if (rawLines.length > 25000)
      return NextResponse.json({ ok: false, error: "CSV grande demais (limite 25.000 linhas). Divida o arquivo e importe em partes." }, { status: 400 });

    if (rawLines.length < 2)
      return NextResponse.json({ ok: false, error: "CSV sem dados" }, { status: 400 });

    const headerLine = rawLines[0];
    const sep = detectSeparator(headerLine);

    const headerCells = splitCSVLine(headerLine, sep);
    const headerKeys = headerCells.map(normalizeHeaderKey);

    const auto = reportMode !== "mapped";

    const idx = {
      id: -1,
      name: -1,
      date: -1,
      time: -1,
      dateTime: -1,
      profissional: -1,
      service: -1,
      location: -1,
      status: -1,
      phone: -1,
    };

    if (auto) {
      idx.id = resolveIdxAuto(headerKeys, ["id", "codigo", "código", "patientid", "patient_id"]);
      idx.name = resolveIdxAuto(headerKeys, ["nome", "name", "paciente"]);
      idx.date = resolveIdxAuto(headerKeys, ["data", "date", "dia"]);
      idx.time = resolveIdxAuto(headerKeys, ["hora", "time", "horario", "horário"]);
      idx.dateTime = resolveIdxAuto(headerKeys, [
        "datahora",
        "data hora",
        "data/hora",
        "data e hora",
        "data_hora",
        "dt",
        "datetime",
        "inicio",
        "início",
        "inicio da sessao",
        "início da sessão",
      ]);
      idx.profissional = resolveIdxAuto(headerKeys, ["profissional", "profissional(a)", "prof", "terapeuta"]);
      idx.service = resolveIdxAuto(headerKeys, [
        "servico",
        "serviço",
        "servicos",
        "serviços",
        "service",
        "tipo",
      ]);
      idx.location = resolveIdxAuto(headerKeys, ["local", "location", "sala", "modalidade"]);
      idx.status = resolveIdxAuto(headerKeys, [
        "status",
        "presenca",
        "presença",
        "presenca/falta",
        "falta",
        "comparecimento",
      ]);
      idx.phone = resolveIdxAuto(headerKeys, [
        "telefone",
        "tel",
        "celular",
        "whatsapp",
        "fone",
        "phone",
      ]);
    } else {
      idx.id = resolveIdxMapped(headerKeys, columnMap?.id);
      idx.name = resolveIdxMapped(headerKeys, columnMap?.name);
      idx.date = resolveIdxMapped(headerKeys, columnMap?.date);
      idx.time = resolveIdxMapped(headerKeys, columnMap?.time);
      idx.dateTime = resolveIdxMapped(headerKeys, columnMap?.dateTime ?? columnMap?.datetime);
      idx.profissional = resolveIdxMapped(headerKeys, columnMap?.profissional);
      idx.service = resolveIdxMapped(headerKeys, columnMap?.service);
      idx.location = resolveIdxMapped(headerKeys, columnMap?.location);
      idx.status = resolveIdxMapped(headerKeys, columnMap?.status);
      idx.phone = resolveIdxMapped(headerKeys, columnMap?.phone);
    }

    const missing = [];
    if (idx.id === -1) missing.push("ID");

    const hasDateTime = idx.dateTime !== -1;
    const hasDateTimeParts = idx.date !== -1 && idx.time !== -1;

    if (!hasDateTime && !hasDateTimeParts) missing.push("DATA/HORA");

    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: `CSV sem coluna(s) obrigatória(s): ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const db = admin.firestore();
    const nowTs = admin.firestore.Timestamp.now();

    const candidates = Math.max(0, rawLines.length - 1);
    let imported = 0; // dryRun: "wouldImport"
    let skipped = 0;

    const errors = [];
    const warnings = [];
    const sample = [];

    let warned = 0;
    let skippedDuplicateInFile = 0;
    let warnedNoPhone = 0;

    const MAX_NORMALIZED_PREVIEW_ROWS = 5000;
    const normalizedRows = [];
    let normalizedRowsTruncated = false;

    const seenDocIds = new Set();

    // cache de user por patientId
    const userCache = new Map();

    // avisos por paciente (evita spam)
    const warnedUnlinked = new Set();
    const warnedPhoneFromCsv = new Set();
    const warnedInvalidPhone = new Set();

    let batch = db.batch();
    let ops = 0;

    async function commitIfNeeded(force = false) {
      if (dryRun) return;
      if (ops >= 450 || (force && ops > 0)) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    for (let i = 1; i < rawLines.length; i++) {
      const rawLine = rawLines[i];
      const cols = splitCSVLine(rawLine, sep);

      const patientId = String(cols[idx.id] || "").trim();
      const name = idx.name >= 0 ? String(cols[idx.name] || "").trim() : "";

      let isoDate = "";
      let time = "";

      if (hasDateTime) {
        const rawDT = String(cols[idx.dateTime] || "").trim();
        const dt = normalizeDateTime(rawDT);
        isoDate = dt.isoDate;
        time = dt.time;
      } else {
        const rawDate = String(cols[idx.date] || "").trim();
        const rawTime = String(cols[idx.time] || "").trim();
        isoDate = normalizeToISODate(rawDate);
        time = normalizeTime(rawTime);
      }

      const profissional = idx.profissional >= 0 ? String(cols[idx.profissional] || "").trim() : "";
      const service = idx.service >= 0 ? String(cols[idx.service] || "").trim() : "";
      const location = idx.location >= 0 ? String(cols[idx.location] || "").trim() : "";

      const statusRaw = idx.status >= 0 ? cols[idx.status] : "";
      const status = mapStatus(statusRaw, defaultStatus);
      const statusKnown = isKnownStatus(statusRaw);

      const rawPhone = idx.phone >= 0 ? String(cols[idx.phone] || "").trim() : "";

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
        phoneSource: null,
        isLinked: null,
        result: "ok",
        reason: null,
      };

      const issueContext = {
        patientId: patientId || null,
        name: name || null,
        isoDate: isoDate || null,
        time: time || null,
        profissional: profissional || null,
        service: service || null,
        location: location || null,
        statusRaw: String(statusRaw || "").trim() || null,
        status,
        rawLinePreview: sanitizeCsvLinePreview(rawLine),
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

      const warnRow = (reason, code, field, warning, value) => {
        pushWarning(code, field, warning, value);
        if (sampleRow.result !== "skip") sampleRow.result = "warn";
        if (!sampleRow.reason) sampleRow.reason = reason;
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
        pushError(
          "invalid_date",
          "DATA",
          "DATA inválida. Esperado dd/mm/aaaa ou yyyy-mm-dd (ou DATA/HORA válida)",
          ""
        );
        sampleRow.result = "skip";
        sampleRow.reason = "invalid_date";
        if (sample.length < 10) sample.push(sampleRow);
        continue;
      }

      if (!time) {
        skipped += 1;
        pushError("invalid_time", "HORA", "HORA inválida. Esperado HH:MM (ex.: 14:00)", "");
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
        pushError(
          "duplicate_in_file",
          "LINHA",
          "Linha duplicada no arquivo (mesmo ID/data/hora/prof.)",
          docId
        );
        sampleRow.result = "skip";
        sampleRow.reason = "duplicate_in_file";
        if (sample.length < 10) sample.push(sampleRow);
        continue;
      }
      seenDocIds.add(docId);

      // Avisos de completude (não bloqueiam)
      if (!name)
        warnRow(
          "missing_name",
          "missing_name",
          "NOME",
          "NOME vazio (importado, mas recomenda-se completar)",
          ""
        );
      if (!profissional)
        warnRow(
          "missing_profissional",
          "missing_profissional",
          "PROFISSIONAL",
          "PROFISSIONAL vazio (importado, mas recomenda-se completar)",
          ""
        );
      if (!service)
        warnRow(
          "missing_service",
          "missing_service",
          "SERVIÇOS",
          "SERVIÇOS vazio (importado, mas recomenda-se completar)",
          ""
        );
      if (!location)
        warnRow(
          "missing_location",
          "missing_location",
          "LOCAL",
          "LOCAL vazio (importado, mas recomenda-se completar)",
          ""
        );
      if (!statusKnown && String(statusRaw || "").trim())
        warnRow(
          "unknown_status",
          "unknown_status",
          "STATUS",
          "STATUS não reconhecido (usando status padrão)",
          String(statusRaw || "")
        );

      let user = userCache.get(patientId);
      if (user === undefined) {
        user = await findUserByPatientId(db, patientId);
        userCache.set(patientId, user);
      }

      const profilePhoneRaw = user ? String(user.phoneCanonical || user.phone || "").trim() : "";
      const profilePhone = isValidPhoneCanonical(profilePhoneRaw) ? canonicalPhone(profilePhoneRaw) : "";

      const csvPhone = isValidPhoneCanonical(rawPhone) ? canonicalPhone(rawPhone) : "";
      const csvPhoneInvalid = rawPhone && !csvPhone;

      let phoneCanonicalFinal = "";
      let phoneSource = null;
      let isLinked = false;
      let linkedUserId = null;

      if (user) {
        isLinked = true;
        linkedUserId = user.id || null;
        if (profilePhone) {
          phoneCanonicalFinal = profilePhone;
          phoneSource = "profile";
        } else if (csvPhone) {
          phoneCanonicalFinal = csvPhone;
          phoneSource = "csv";
          if (!warnedPhoneFromCsv.has(patientId)) {
            warnedPhoneFromCsv.add(patientId);
            pushWarning(
              "phone_from_csv",
              "TELEFONE",
              "Perfil sem phoneCanonical: usando TELEFONE do CSV (verifique o cadastro para maior segurança).",
              maskPhoneCanonical(csvPhone)
            );
          }
        }
      } else {
        // sem vínculo de cadastro
        if (!warnedUnlinked.has(patientId)) {
          warnedUnlinked.add(patientId);
          pushWarning(
            "unlinked_patient",
            "ID",
            "Paciente não vinculado (users). Importado para constância; follow-ups ficam bloqueados até vincular.",
            patientId
          );
        }
        if (csvPhone) {
          phoneCanonicalFinal = csvPhone;
          phoneSource = "csv";
          if (!warnedPhoneFromCsv.has(patientId)) {
            warnedPhoneFromCsv.add(patientId);
            pushWarning(
              "phone_from_csv",
              "TELEFONE",
              "TELEFONE do CSV registrado para constância (sem vínculo). Follow-ups continuam bloqueados até vincular.",
              maskPhoneCanonical(csvPhone)
            );
          }
        }
      }

      if (!phoneCanonicalFinal) {
        warnedNoPhone += 1;
        pushWarning(
          "no_phone_for_patient",
          "TELEFONE",
          "Sem telefone resolvido (perfil/CSV). Importado para constância; follow-ups exigem telefone e vínculo correto.",
          patientId
        );
        if (sampleRow.result !== "skip") sampleRow.result = "warn";
        if (!sampleRow.reason) sampleRow.reason = "no_phone_for_patient";
      }

      if (csvPhoneInvalid && !warnedInvalidPhone.has(patientId)) {
        warnedInvalidPhone.add(patientId);
        pushWarning(
          "invalid_phone",
          "TELEFONE",
          "TELEFONE inválido no CSV (esperado DDD+numero com 10 ou 11 dígitos).",
          maskDigitsTailText(rawPhone)
        );
      }

      sampleRow.phone = phoneCanonicalFinal ? maskPhoneCanonical(phoneCanonicalFinal) : null;
      sampleRow.phoneSource = phoneSource;
      sampleRow.isLinked = isLinked;

      if (!dryRun) {
        const ref = db.collection("attendance_logs").doc(docId);
        batch.set(
          ref,
          {
            patientId,
            phoneCanonical: phoneCanonicalFinal || null,
            phoneSource: phoneSource || null,
            isLinked,
            linkedUserId: linkedUserId || null,
            hasPhone: Boolean(phoneCanonicalFinal),
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
            phoneSource: sampleRow.phoneSource,
            isLinked: sampleRow.isLinked,
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
        batchId,
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
      meta: {
        batchId,
        source,
        dryRun,
        candidates,
        imported,
        skipped,
        skippedDuplicateInFile,
        warned,
        warnedNoPhone,
        reportMode,
        separator: sep === "\t" ? "TAB" : sep,
      },
    });

    if (dryRun) {
      return NextResponse.json(
        {
          ok: true,
          dryRun: true,
          batchId,
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
        batchId,
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
    return adminError({
      req,
      auth: auth?.ok ? auth : null,
      action: "attendance_import",
      err: e,
    });
  }
}
