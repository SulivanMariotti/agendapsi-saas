import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import { getPatientPortalConfig } from "@/lib/server/patientPortalConfig";

export const runtime = "nodejs";

function norm(v) {
  return String(v ?? "").trim();
}

function toBool(v, fallback) {
  if (typeof v === "boolean") return v;
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim().toLowerCase();
  if (!s) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

function toInt(v, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function resolveTenantIdFromReq(req) {
  const { searchParams } = new URL(req.url);
  const fromQuery = norm(searchParams.get("tenantId"));
  const fromEnv = norm(process.env.AGENDA_PSI_TENANT_ID);
  return fromQuery || fromEnv || "tn_JnA5yU";
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizePortalInput(input, fallback) {
  const out = {
    termsVersion: clamp(toInt(input?.termsVersion, fallback?.termsVersion || 1) || 1, 1, 999),
    termsText: norm(input?.termsText || fallback?.termsText || ""),
    libraryEnabled: toBool(input?.libraryEnabled, fallback?.libraryEnabled !== false),
    notesEnabled: toBool(input?.notesEnabled, fallback?.notesEnabled === true),
    remindersEnabled: toBool(input?.remindersEnabled, fallback?.remindersEnabled !== false),
  };

  // termsText: mínimo razoável e limite pra evitar abuso.
  if (!out.termsText) out.termsText = norm(fallback?.termsText || "");
  out.termsText = out.termsText.slice(0, 20_000);

  return out;
}

export async function GET(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:agendapsi:patient-portal:get",
      uid: auth.uid,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const tenantId = resolveTenantIdFromReq(req);
    if (!tenantId) return NextResponse.json({ ok: false, error: "tenantId é obrigatório." }, { status: 400 });

    // Usa o loader para aplicar defaults consistentes
    const cfg = await getPatientPortalConfig(tenantId);

    return NextResponse.json(
      {
        ok: true,
        tenantId,
        config: {
          termsVersion: cfg.termsVersion,
          termsText: cfg.termsText,
          libraryEnabled: cfg.libraryEnabled,
          notesEnabled: cfg.notesEnabled,
          remindersEnabled: cfg.remindersEnabled,
        },
      },
      { status: 200 }
    );
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "agendapsi_patient_portal_get", err: e });
  }
}

export async function PUT(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:agendapsi:patient-portal:put",
      uid: auth.uid,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 50_000,
      defaultValue: {},
      allowedKeys: ["tenantId", "termsVersion", "termsText", "libraryEnabled", "notesEnabled", "remindersEnabled"],
      label: "agendapsi-patient-portal",
      showKeys: true,
    });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });

    const body = bodyRes.value || {};
    const tenantId = norm(body?.tenantId) || resolveTenantIdFromReq(req);
    if (!tenantId) return NextResponse.json({ ok: false, error: "tenantId é obrigatório." }, { status: 400 });

    // fallback = estado atual (com defaults)
    const fallbackCfg = await getPatientPortalConfig(tenantId);
    const normalized = normalizePortalInput(body, fallbackCfg);

    if (!normalized.termsText || normalized.termsText.length < 20) {
      return NextResponse.json({ ok: false, error: "O texto do termo deve ter pelo menos 20 caracteres." }, { status: 400 });
    }

    const ref = admin.firestore().collection("tenants").doc(tenantId).collection("settings").doc("patientPortal");
    const snap = await ref.get();

    const now = admin.firestore.FieldValue.serverTimestamp();

    const payload = {
      termsVersion: normalized.termsVersion,
      termsText: normalized.termsText,
      libraryEnabled: normalized.libraryEnabled,
      notesEnabled: normalized.notesEnabled,
      remindersEnabled: normalized.remindersEnabled,
      updatedAt: now,
    };

    if (!snap.exists) payload.createdAt = now;

    await ref.set(payload, { merge: true });

    return NextResponse.json({ ok: true, tenantId }, { status: 200 });
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "agendapsi_patient_portal_put", err: e });
  }
}
