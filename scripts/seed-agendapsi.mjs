#!/usr/bin/env node
/**
 * Seed Firestore - AgendaPsi SaaS
 *
 * Cria dados mínimos (tenant, membership owner, índices, catálogos, paciente teste,
 * série de agendamento e ocorrências) para acelerar testes.
 *
 * Idempotente: pode rodar múltiplas vezes sem duplicar.
 *
 * Uso:
 *   npm run seed:agendapsi
 *
 * ENV credenciais (ordem de prioridade):
 * - FIREBASE_ADMIN_SERVICE_ACCOUNT_B64 (recomendado)
 * - FIREBASE_ADMIN_SERVICE_ACCOUNT (JSON string)
 * - SERVICE_ACCOUNT_JSON_PATH (caminho local para serviceAccount.json)
 *
 * ENV opcionais:
 * - AGENDA_PSI_TENANT_ID
 * - AGENDA_PSI_OWNER_UID
 * - AGENDA_PSI_OWNER_NAME
 * - AGENDA_PSI_PATIENT_ID
 */

import fs from "node:fs";
import path from "node:path";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ---------- tiny .env loader (sem dependências) ----------
function loadDotEnvIfPresent() {
  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] == null) process.env[k] = v;
    }
  }
}

// ---------- admin init ----------
function getServiceAccountFromEnvOrFile() {
  const b64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = Buffer.from(b64, "base64").toString("utf-8");
    return JSON.parse(json);
  }

  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (raw) return JSON.parse(raw);

  const p = process.env.SERVICE_ACCOUNT_JSON_PATH;
  if (p && fs.existsSync(p)) {
    const json = fs.readFileSync(p, "utf-8");
    return JSON.parse(json);
  }

  throw new Error(
    "Missing service account. Set FIREBASE_ADMIN_SERVICE_ACCOUNT_B64 or FIREBASE_ADMIN_SERVICE_ACCOUNT or SERVICE_ACCOUNT_JSON_PATH"
  );
}

function ensureAdmin() {
  if (getApps().length) return { projectId: getApps()[0].options?.projectId };
  const serviceAccount = getServiceAccountFromEnvOrFile();
  const projectId = serviceAccount.project_id || serviceAccount.projectId;
  initializeApp({ credential: cert(serviceAccount), projectId });
  return { projectId };
}

function nowServer() {
  return FieldValue.serverTimestamp();
}

async function upsertDoc(ref, data) {
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ ...data, createdAt: nowServer(), updatedAt: nowServer() }, { merge: true });
    return "created";
  }
  // mantém createdAt original
  await ref.set({ ...data, updatedAt: nowServer() }, { merge: true });
  return "updated";
}

async function ensureCatalogDocs(colRef, docs) {
  let created = 0;
  let updated = 0;
  for (const d of docs) {
    const { id, ...rest } = d;
    const res = await upsertDoc(colRef.doc(id), rest);
    if (res === "created") created++;
    else updated++;
  }
  return { created, updated };
}

async function main() {
  loadDotEnvIfPresent();
  const { projectId } = ensureAdmin();

  const db = getFirestore();

  const tenantId = process.env.AGENDA_PSI_TENANT_ID || "tn_JnA5yU";
  const ownerUid = process.env.AGENDA_PSI_OWNER_UID || "JnA5yUhXt0PxA6fx3UlxnKOZ4Kl2";
  const ownerName = process.env.AGENDA_PSI_OWNER_NAME || "Sulivan";
  const patientId = process.env.AGENDA_PSI_PATIENT_ID || "oke7bg0oQ2qJDOfTF3Xu";

  const tz = "America/Sao_Paulo";

  const tenantRef = db.collection("tenants").doc(tenantId);

  console.log("\n=== AgendaPsi Seed ===");
  console.log("ProjectId (service account):", projectId || "(não detectado)");
  console.log("Tenant path:", `tenants/${tenantId}`);
  console.log("======================\n");

  // tenant
  const trialDays = 10;
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

  const tenantRes = await upsertDoc(tenantRef, {
    ownerUid,
    planStatus: "trial",
    trialDays,
    trialEndsAt,
    timezone: tz,
  });

  // membership (padrão oficial: docId=uid e campo uid)
  const memberRef = tenantRef.collection("users").doc(ownerUid);
  const memberRes = await upsertDoc(memberRef, {
    uid: ownerUid,
    role: "owner",
    displayName: ownerName,
    isActive: true,
  });

  // userTenantIndex (lookup rápido do login)
  const indexRef = db.collection("userTenantIndex").doc(ownerUid);
  const indexRes = await upsertDoc(indexRef, {
    uid: ownerUid,
    tenantId,
    role: "owner",
    isActive: true,
    displayName: ownerName,
  });

  // schedule settings
  const scheduleRef = tenantRef.collection("settings").doc("schedule");
  const scheduleRes = await upsertDoc(scheduleRef, {
    slotIntervalMin: 30,
    sessionDurationMin: 0, // legado (não usado para grade)

    bufferMin: 0,
    lunchBreakEnabled: false,
    lunchStart: "12:00",
    lunchEnd: "13:00",
    weekAvailability: {
      mon: [],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    },
  });

  // catalogs
  const occurrenceCodes = [
    { id: "OC001", code: "OC001", description: "Sessão realizada normalmente", isActive: true, sortOrder: 1 },
    { id: "OC002", code: "OC002", description: "Sessão com foco em avaliação/triagem", isActive: true, sortOrder: 2 },
    { id: "OC003", code: "OC003", description: "Sessão com intervenção específica planejada", isActive: true, sortOrder: 3 },
  ];

  const whatsappTemplates = [
    { id: "WT_CONFIRM", title: "Confirmação de atendimento", body: "Olá, {nome}! Confirmando nosso atendimento em {data} às {hora}.", isActive: true, sortOrder: 1 },
    { id: "WT_CONFIRM_PRES", title: "Confirmação de atendimento presencial", body: "Olá, {nome}! Confirmando nosso atendimento presencial em {data} às {hora}.", isActive: true, sortOrder: 2 },
    { id: "WT_CONFIRM_TELE", title: "Confirmação de teleatendimento", body: "Olá, {nome}! Confirmando nosso teleatendimento em {data} às {hora}.", isActive: true, sortOrder: 3 },
    { id: "WT_REMINDER", title: "Lembrete de atendimento", body: "Olá, {nome}! Lembrete do nosso atendimento em {data} às {hora}.", isActive: true, sortOrder: 4 },
    { id: "WT_BOOKED", title: "Aviso horário agendado", body: "Olá, {nome}! Seu horário foi agendado para {data} às {hora}.", isActive: true, sortOrder: 5 },
    { id: "WT_RESCHED", title: "Aviso de reagendamento", body: "Olá, {nome}! Seu atendimento foi reagendado para {data} às {hora}.", isActive: true, sortOrder: 6 },
    { id: "WT_CANCELED", title: "Aviso horário cancelado", body: "Olá, {nome}! Seu horário em {data} às {hora} foi cancelado.", isActive: true, sortOrder: 7 },
    { id: "WT_NO_SHOW", title: "Não comparecimento", body: "Olá, {nome}. Notei que você não pôde comparecer ao horário de {data} às {hora}.", isActive: true, sortOrder: 8 },
    { id: "WT_SAT", title: "Pesquisa de satisfação", body: "Olá, {nome}! Se puder, me conte como foi sua experiência no atendimento. Sua opinião é importante.", isActive: true, sortOrder: 9 },
    { id: "WT_BDAY", title: "Aniversário", body: "Olá, {nome}! Feliz aniversário! Que seu novo ciclo seja leve e significativo.", isActive: true, sortOrder: 10 },
  ];

  const codesRes = await ensureCatalogDocs(tenantRef.collection("occurrenceCodes"), occurrenceCodes);
  const waRes = await ensureCatalogDocs(tenantRef.collection("whatsappTemplates"), whatsappTemplates);

  // patient (pré-cadastro)
  const patientRef = tenantRef.collection("patients").doc(patientId);
  const patientRes = await upsertDoc(patientRef, {
    fullName: "Paciente Teste",
    cpf: "00000000000",
    mobile: "5511999999999",
    profileStatus: "pre_cadastro",
    createdFrom: "quick_booking",
    notes: "Paciente criado via seed para testes.",
  });

  // series + occurrences
  const seriesId = "AS_TEST_001";
  const seriesRef = tenantRef.collection("appointmentSeries").doc(seriesId);
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const seriesRes = await upsertDoc(seriesRef, {
    patientId,
    plannedTotalSessions: 30,
    title: "Psicoterapia (teste)",
    kind: "weekly",
    weekday: startDate.getDay(),
    startTime: "10:00",
    durationMin: 50,
    bufferMin: 10,
    startDate,
    endDate: null,
    status: "active",
      planId: "pro",
  });

  const occCol = tenantRef.collection("appointmentOccurrences");
  const occBaseTime = "10:00";

  function addDays(d, days) {
    const out = new Date(d.getTime());
    out.setDate(out.getDate() + days);
    return out;
  }

  const occurrences = [];
  for (let i = 0; i < 4; i++) {
    const date = addDays(startDate, i * 7);
    const occId = `AO_${seriesId}_${date.toISOString().slice(0, 10)}`;
    occurrences.push({
      id: occId,
      seriesId,
      patientId,
      date,
      startTime: occBaseTime,
      durationMin: 50,
      bufferMin: 10,
      sessionIndex: i + 1,
      plannedTotalSessions: 30,
      status: "Agendado",
      isHold: false,
      occurrenceCodeId: null,
      observation: "",
      progressNote: "",
    });
  }

  const occRes = await ensureCatalogDocs(occCol, occurrences);

  // sanity checks
  const seriesSnap = await seriesRef.get();
  const occAnySnap = await occCol.limit(1).get();
  const subcols = await tenantRef.listCollections();
  const subcolNames = subcols.map((c) => c.id).sort();

  console.log("Seed concluído ✅");
  console.log({ tenantRes, memberRes, indexRes, scheduleRes, codesRes, waRes, patientRes, seriesRes, occRes });
  console.log("Tenant:", tenantId);
  console.log("Owner UID:", ownerUid);
  console.log("Patient:", patientId);
  console.log("Series exists:", seriesSnap.exists);
  console.log("Any occurrence exists:", !occAnySnap.empty);
  console.log("Tenant subcollections:", subcolNames);
}

main().catch((err) => {
  console.error("Seed falhou ❌");
  console.error(err);
  process.exit(1);
});
