// src/app/api/admin/users/normalize-phones/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
import { logAdminAudit } from "@/lib/server/auditLog";
import {
  readJsonObjectBody,
  getBoolean,
  getNumber,
  getString,
} from "@/lib/server/payloadSchema";

/**
 * Admin API: Normalize phoneCanonical on users
 *
 * Objetivo:
 * - Sustentar consistência operacional (push / follow-ups / pareamento)
 * - Reduzir ambiguidade ao vincular presença/falta por telefone
 *
 * POST body:
 * - dryRun?: boolean (default true)
 * - limit?: number  (default 2000, max 5000)
 * - cursor?: string (base64 { updatedAtMillis, uid }) optional
 */

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function toPhoneCanonical(raw) {
  let d = onlyDigits(raw).replace(/^0+/, "");
  if (!d) return "";
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d;
  if (d.length > 11) return d.slice(-11);
  return d;
}

function encodeCursor(payload) {
  try {
    return Buffer.from(JSON.stringify(payload || {}), "utf-8").toString("base64");
  } catch {
    return null;
  }
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const json = Buffer.from(String(cursor), "base64").toString("utf-8");
    const obj = JSON.parse(json);
    const updatedAtMillis = Number(obj?.updatedAtMillis ?? 0);
    const uid = (obj?.uid ?? "").toString().trim() || null;
    return { updatedAtMillis, uid };
  } catch {
    return null;
  }
}

function pickRawPhone(d) {
  // Prefer explicit canonical if present; otherwise fallback to legacy fields.
  return (
    d?.phoneCanonical ||
    d?.phone ||
    d?.whatsapp ||
    d?.mobile ||
    d?.phoneNumber ||
    ""
  );
}

export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:users:normalize-phones",
      uid: auth.uid,
      limit: 6,
      windowMs: 10 * 60_000,
    });
    if (!rl.ok) return rl.res;

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 20_000,
      defaultValue: {},
      allowedKeys: ["limit", "dryRun", "cursor"],
      label: "normalize-phones",
      showKeys: true,
    });
    if (!bodyRes.ok) {
      return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    }
    const body = bodyRes.value;

    const dryRunRes = getBoolean(body, "dryRun", {
      required: false,
      defaultValue: true,
    });
    if (!dryRunRes.ok)
      return NextResponse.json({ ok: false, error: dryRunRes.error }, { status: 400 });
    const dryRun = dryRunRes.value;

    const limitRes = getNumber(body, "limit", {
      required: false,
      defaultValue: 2000,
      min: 1,
      max: 5000,
      integer: true,
    });
    if (!limitRes.ok)
      return NextResponse.json({ ok: false, error: limitRes.error }, { status: 400 });
    const limit = limitRes.value;

    const cursorRes = getString(body, "cursor", {
      required: false,
      defaultValue: "",
      trim: true,
      max: 5000,
    });
    if (!cursorRes.ok)
      return NextResponse.json({ ok: false, error: cursorRes.error }, { status: 400 });
    const cursor = cursorRes.value || null;

    const db = admin.firestore();

    let q = db.collection("users").orderBy("updatedAt", "desc");
    const cur = decodeCursor(cursor);
    if (cur?.updatedAtMillis) {
      const ts = admin.firestore.Timestamp.fromMillis(Number(cur.updatedAtMillis || 0));
      q = q.startAfter(ts);
    }

    // fetch +1 to know if there is more
    const snap = await q.limit(limit + 1).get();
    const docs = snap.docs || [];
    const hasMore = docs.length > limit;
    const scanDocs = docs.slice(0, limit);

    let scanned = 0;
    let candidates = 0;
    let updated = 0;
    let skippedNoPhone = 0;
    let unchanged = 0;

    const samples = [];
    const canonicalToUids = new Map();
    const updates = [];

    for (const d of scanDocs) {
      scanned += 1;
      const data = d.data() || {};

      const rawPhone = pickRawPhone(data);
      const canonical = toPhoneCanonical(rawPhone);
      if (!canonical) {
        skippedNoPhone += 1;
        continue;
      }

      // duplicates within this scan window
      const arr = canonicalToUids.get(canonical) || [];
      arr.push(d.id);
      canonicalToUids.set(canonical, arr);

      const existing = toPhoneCanonical(data?.phoneCanonical || "");
      if (existing === canonical) {
        unchanged += 1;
        continue;
      }

      candidates += 1;
      updates.push({ ref: d.ref, uid: d.id, canonical });
      if (samples.length < 10) {
        samples.push({
          uid: d.id,
          name: String(data?.name || "").trim() || null,
          before: String(data?.phoneCanonical || "").trim() || null,
          after: canonical,
        });
      }
    }

    const duplicates = [];
    for (const [phoneCanonical, uids] of canonicalToUids.entries()) {
      if (uids.length > 1) duplicates.push({ phoneCanonical, uids });
    }
    duplicates.sort((a, b) => b.uids.length - a.uids.length);

    if (!dryRun && updates.length) {
      const now = admin.firestore.FieldValue.serverTimestamp();

      // Firestore batch limit: 500 operations. Keep margin.
      const chunkSize = 450;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        const batch = db.batch();
        for (const u of chunk) {
          batch.set(
            u.ref,
            {
              phoneCanonical: u.canonical,
              updatedAt: now,
            },
            { merge: true }
          );
        }
        await batch.commit();
        updated += chunk.length;
      }
    }

    // next cursor based on last scanned doc
    let nextCursor = null;
    if (hasMore && scanDocs.length) {
      const last = scanDocs[scanDocs.length - 1];
      const lastData = last.data() || {};
      const updatedAtMillis =
        typeof lastData?.updatedAt?.toMillis === "function" ? lastData.updatedAt.toMillis() : 0;
      nextCursor = encodeCursor({ updatedAtMillis, uid: last.id });
    }

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: dryRun ? "users_normalize_phones_dryrun" : "users_normalize_phones_commit",
      meta: {
        dryRun,
        limit,
        scanned,
        candidates,
        updated,
        unchanged,
        skippedNoPhone,
        duplicates: duplicates.length,
      },
    });

    return NextResponse.json({
      ok: true,
      dryRun,
      scanned,
      candidates,
      updated,
      unchanged,
      skippedNoPhone,
      duplicates,
      sample: samples,
      nextCursor,
      hasMore,
    });
  } catch (e) {
    return adminError({
      req,
      auth: auth?.ok ? auth : null,
      action: "users_normalize_phones",
      err: e,
    });
  }
}
