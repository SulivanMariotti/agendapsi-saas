// src/app/api/paciente/notes/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { enforceSameOrigin } from "@/lib/server/originGuard";
import { requireAuth } from "@/lib/server/requireAuth";
import { unauthorized } from "@/lib/server/adminError";

export const runtime = "nodejs";

/**
 * Portal do Paciente — Anotações
 *
 * Fonte da verdade: tenants/{tenantId}/patients/{patientId}/patientNotes/{noteId}
 * (gravação via API server-side; paciente não acessa Firestore direto no client)
 *
 * GET  /api/paciente/notes?limit=30
 * POST /api/paciente/notes  { text }
 * DELETE /api/paciente/notes?noteId=abc
 */

function badRequest(message = "Requisição inválida.") {
  return NextResponse.json({ ok: false, error: String(message || "Requisição inválida.") }, { status: 400 });
}

function forbidden(message = "Acesso negado.") {
  return NextResponse.json({ ok: false, error: String(message || "Acesso negado.") }, { status: 403 });
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function cleanText(v) {
  return String(v ?? "").replace(/\r\n/g, "\n").trim();
}

export async function GET(req) {
  try {
    enforceSameOrigin(req);
    await rateLimit(req, { key: "paciente:notes:get", limit: 60, windowMs: 60_000 });

    const auth = await requireAuth(req);
    if (!auth.ok) return auth.res;

    const { decoded } = auth;
    if (decoded?.role !== "patient") return forbidden();

    const tenantId = String(decoded.tenantId || "");
    const patientId = String(decoded.patientId || "");
    if (!tenantId || !patientId) return unauthorized();

    const { searchParams } = new URL(req.url);
    const limit = clampInt(searchParams.get("limit"), 1, 100, 30);

    const ref = admin
      .firestore()
      .collection("tenants")
      .doc(tenantId)
      .collection("patients")
      .doc(patientId)
      .collection("patientNotes");

    // Busca recentes e filtra "deletedAt" no servidor
// (Evita necessidade de índice composto: where(deletedAt==null) + orderBy(createdAt))
const snap = await ref.orderBy("createdAt", "desc").limit(Math.min(300, limit * 5)).get();

const notes = [];
for (const d of snap.docs) {
  const data = d.data() || {};
  // Considera "ativa" se deletedAt é null/undefined
  if (data.deletedAt != null) continue;

  const createdAt = data.createdAt?.toMillis?.() ?? null;
  const updatedAt = data.updatedAt?.toMillis?.() ?? null;

  notes.push({
    id: d.id,
    text: String(data.text || ""),
    createdAt,
    updatedAt,
  });

  if (notes.length >= limit) break;
}

return NextResponse.json({ ok: true, tenantId, patientId, notes });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("GET /api/paciente/notes error", e);
    return NextResponse.json({ ok: false, error: "Falha ao carregar anotações." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    enforceSameOrigin(req);
    await rateLimit(req, { key: "paciente:notes:post", limit: 30, windowMs: 60_000 });

    const auth = await requireAuth(req);
    if (!auth.ok) return auth.res;

    const { decoded } = auth;
    if (decoded?.role !== "patient") return forbidden();

    const tenantId = String(decoded.tenantId || "");
    const patientId = String(decoded.patientId || "");
    if (!tenantId || !patientId) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const text = cleanText(body?.text);

    if (!text) return badRequest("Informe uma anotação.");
    if (text.length > 2000) return badRequest("A anotação deve ter no máximo 2000 caracteres.");

    const ref = admin
      .firestore()
      .collection("tenants")
      .doc(tenantId)
      .collection("patients")
      .doc(patientId)
      .collection("patientNotes")
      .doc();

    const now = admin.firestore.Timestamp.now();
    await ref.set({
      text,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: decoded.uid || null,
      source: "patientPortal",
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("POST /api/paciente/notes error", e);
    return NextResponse.json({ ok: false, error: "Falha ao salvar anotação." }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    enforceSameOrigin(req);
    await rateLimit(req, { key: "paciente:notes:delete", limit: 20, windowMs: 60_000 });

    const auth = await requireAuth(req);
    if (!auth.ok) return auth.res;

    const { decoded } = auth;
    if (decoded?.role !== "patient") return forbidden();

    const tenantId = String(decoded.tenantId || "");
    const patientId = String(decoded.patientId || "");
    if (!tenantId || !patientId) return unauthorized();

    const { searchParams } = new URL(req.url);
    const noteId = String(searchParams.get("noteId") || "").trim();
    if (!noteId) return badRequest("noteId é obrigatório.");

    const ref = admin
      .firestore()
      .collection("tenants")
      .doc(tenantId)
      .collection("patients")
      .doc(patientId)
      .collection("patientNotes")
      .doc(noteId);

    const snap = await ref.get();
    if (!snap.exists) return badRequest("Nota não encontrada.");

    const now = admin.firestore.Timestamp.now();
    await ref.set({ deletedAt: now, updatedAt: now }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("DELETE /api/paciente/notes error", e);
    return NextResponse.json({ ok: false, error: "Falha ao remover anotação." }, { status: 500 });
  }
}
