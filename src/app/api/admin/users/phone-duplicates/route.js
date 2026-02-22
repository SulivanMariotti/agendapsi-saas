// src/app/api/admin/users/phone-duplicates/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
import { logAdminAudit } from "@/lib/server/auditLog";
import { readJsonObjectBody, getNumber, getBoolean } from "@/lib/server/payloadSchema";

/**
 * Admin API: Report duplicate phoneCanonical across users.
 *
 * Objetivo:
 * - Encontrar telefones (phoneCanonical) usados por mais de um perfil
 * - Ajudar a reduzir "ambiguous_phone" em imports de Presença/Faltas e evitar envios errados
 *
 * POST body:
 * - limit?: number (default 5000, max 10000)  // quantos users varrer
 * - maxGroups?: number (default 200, max 500) // quantos grupos retornar
 * - maxUsersPerGroup?: number (default 10, max 25) // amostra por grupo
 * - includeDisabled?: boolean (default false) // inclui pacientes desativados/inativos
 */

function safeStr(v) {
  return String(v || "").trim();
}

/**
 * Considera "inativo/desativado" se:
 * - status in ["inactive","disabled","archived","deleted"]
 * - isActive === false
 * - disabled === true
 * - disabledAt / deletedAt existem
 * - mergedTo existe (duplicado consolidado)
 */
function isInactiveUser(d) {
  const status = (d?.status ?? "active").toString().toLowerCase().trim();
  if (["inactive", "disabled", "archived", "deleted"].includes(status)) return true;

  if (d?.isActive === false) return true;
  if (d?.disabled === true) return true;

  if (d?.disabledAt) return true;
  if (d?.deletedAt) return true;

  if (d?.mergedTo) return true;

  return false;
}

export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:users:phone-duplicates",
      uid: auth.uid,
      limit: 10,
      windowMs: 10 * 60_000,
    });
    if (!rl.ok) return rl.res;

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 12_000,
      defaultValue: {},
      allowedKeys: ["limit", "maxGroups", "maxUsersPerGroup", "includeDisabled"],
      label: "phone-duplicates",
      showKeys: false,
    });
    if (!bodyRes.ok) {
      return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    }
    const body = bodyRes.value;

    const limitRes = getNumber(body, "limit", {
      required: false,
      defaultValue: 5000,
      min: 100,
      max: 10000,
      integer: true,
    });
    if (!limitRes.ok) return NextResponse.json({ ok: false, error: limitRes.error }, { status: 400 });
    const limit = limitRes.value;

    const maxGroupsRes = getNumber(body, "maxGroups", {
      required: false,
      defaultValue: 200,
      min: 10,
      max: 500,
      integer: true,
    });
    if (!maxGroupsRes.ok)
      return NextResponse.json({ ok: false, error: maxGroupsRes.error }, { status: 400 });
    const maxGroups = maxGroupsRes.value;

    const maxUsersPerGroupRes = getNumber(body, "maxUsersPerGroup", {
      required: false,
      defaultValue: 10,
      min: 3,
      max: 25,
      integer: true,
    });
    if (!maxUsersPerGroupRes.ok)
      return NextResponse.json({ ok: false, error: maxUsersPerGroupRes.error }, { status: 400 });
    const maxUsersPerGroup = maxUsersPerGroupRes.value;

    const includeDisabledRes = getBoolean(body, "includeDisabled", {
      required: false,
      defaultValue: false,
      label: "includeDisabled",
    });
    if (!includeDisabledRes.ok)
      return NextResponse.json({ ok: false, error: includeDisabledRes.error }, { status: 400 });
    const includeDisabled = includeDisabledRes.value;

    const db = admin.firestore();

    // Somente docs que possuem phoneCanonical (evita varrer vazios/missing).
    // Observação: evitar orderBy(documentId) aqui para não exigir índice composto.
    // Inequality + orderBy no mesmo campo costuma funcionar com índice simples.
    let q = db
      .collection("users")
      .where("phoneCanonical", ">=", "")
      .orderBy("phoneCanonical", "asc")
      .limit(limit + 1);

    const snap = await q.get();
    const docs = snap.docs || [];
    const hasMore = docs.length > limit;
    const scanDocs = docs.slice(0, limit);

    const byPhone = new Map();
    let scanned = 0;
    let included = 0;
    let hiddenInactive = 0;
    let hiddenNonPatient = 0;

    for (const d of scanDocs) {
      scanned += 1;
      const data = d.data() || {};
      const phoneCanonical = safeStr(data?.phoneCanonical);
      if (!phoneCanonical) continue;

      const roleNorm = safeStr(data?.role).toLowerCase();
      if (!roleNorm || roleNorm !== "patient") {
        hiddenNonPatient += 1;
        continue;
      }

      if (!includeDisabled && isInactiveUser(data)) {
        hiddenInactive += 1;
        continue;
      }

      included += 1;

      const entry = byPhone.get(phoneCanonical) || {
        phoneCanonical,
        count: 0,
        users: [],
      };

      entry.count += 1;

      if (entry.users.length < maxUsersPerGroup) {
        const updatedAtMillis =
          typeof data?.updatedAt?.toMillis === "function" ? data.updatedAt.toMillis() : null;
        entry.users.push({
          uid: d.id,
          name: safeStr(data?.name) || null,
          email: safeStr(data?.email) || null,
          patientExternalId: safeStr(data?.patientExternalId) || null,
          status: safeStr(data?.status) || null,
          role: safeStr(data?.role) || null,
          updatedAtMillis,
        });
      }

      byPhone.set(phoneCanonical, entry);
    }

    const all = Array.from(byPhone.values());
    const dupAll = all.filter((x) => x.count > 1);

    dupAll.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.phoneCanonical.localeCompare(b.phoneCanonical);
    });

    const groups = dupAll.slice(0, maxGroups);
    const duplicatesTotalGroups = dupAll.length;
    const duplicatesTotalUsers = dupAll.reduce((acc, x) => acc + (x.count || 0), 0);

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "users_phone_duplicates_report",
      meta: {
        scanned,
        distinctPhones: byPhone.size,
        duplicatesTotalGroups,
        duplicatesTotalUsers,
        limit,
        maxGroups,
        maxUsersPerGroup,
        hasMore,
        includeDisabled,
        included,
        hiddenInactive,
        hiddenNonPatient,
      },
    });

    return NextResponse.json({
      ok: true,
      scanned,
      included,
      hiddenInactive,
      hiddenNonPatient,
      includeDisabled,
      distinctPhones: byPhone.size,
      duplicatesTotalGroups,
      duplicatesTotalUsers,
      groups,
      truncated: duplicatesTotalGroups > groups.length,
      hasMore,
    });
  } catch (e) {
    return adminError({
      req,
      auth: auth?.ok ? auth : null,
      action: "users_phone_duplicates_report",
      err: e,
    });
  }
}
