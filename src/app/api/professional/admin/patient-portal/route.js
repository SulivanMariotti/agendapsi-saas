import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import { getPatientPortalConfig } from "@/lib/server/patientPortalConfig";
import { requireTenantAdmin } from "@/lib/server/requireTenantAdmin";

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

  if (!out.termsText) out.termsText = norm(fallback?.termsText || "");
  out.termsText = out.termsText.slice(0, 20_000);

  return out;
}

export async function GET(req) {
  try {
    const auth = await requireTenantAdmin(req, {
      bucket: "tenant-admin:patient-portal:get",
      limit: 120,
      windowMs: 60_000,
    });
    if (!auth.ok) return auth.res;

    const tenantId = auth.session.tenantId;
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
    // eslint-disable-next-line no-console
    console.error("[TENANT_ADMIN_API] patient-portal:get", e);
    return NextResponse.json({ ok: false, error: "Ocorreu um erro. Tente novamente." }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const auth = await requireTenantAdmin(req, {
      bucket: "tenant-admin:patient-portal:put",
      limit: 30,
      windowMs: 60_000,
    });
    if (!auth.ok) return auth.res;

    const tenantId = auth.session.tenantId;

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 50_000,
      defaultValue: {},
      allowedKeys: ["termsVersion", "termsText", "libraryEnabled", "notesEnabled", "remindersEnabled"],
      label: "tenant-admin-patient-portal",
      showKeys: true,
    });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });

    const body = bodyRes.value || {};

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
      updatedBy: auth.session.uid,
    };

    if (!snap.exists) payload.createdAt = now;

    await ref.set(payload, { merge: true });

    return NextResponse.json({ ok: true, tenantId }, { status: 200 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[TENANT_ADMIN_API] patient-portal:put", e);
    return NextResponse.json({ ok: false, error: "Ocorreu um erro. Tente novamente." }, { status: 500 });
  }
}
