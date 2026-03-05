// src/app/api/paciente/library/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { enforceSameOrigin } from "@/lib/server/originGuard";
import { requireAuth } from "@/lib/server/requireAuth";
import { ensureTenantActive } from "@/lib/server/tenantStatus";
import { getPatientPortalConfig } from "@/lib/server/patientPortalConfig";
import { unauthorized } from "@/lib/server/adminError";

export const runtime = "nodejs";

/**
 * Portal do Paciente — Biblioteca (AgendaPsi)
 *
 * IMPORTANTE:
 * - A Biblioteca é gerenciada no Admin (painel já existente) e persiste nas coleções globais:
 *   - library_articles
 *   - library_categories
 * - O paciente consome APENAS artigos publicados (status === 'published').
 *
 * GET /api/paciente/library?limit=60
 *
 * Observações:
 * - Sem Firestore no client (evita permission-denied)
 * - Sem filtro + orderBy (evita índice composto): filtra `status` no servidor.
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

function cleanStr(v, maxLen = 20_000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function asArrayOfStrings(v, maxItems = 200, maxLen = 5_000) {
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const it of v) {
    const s = cleanStr(it, maxLen);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function isPublishedArticle(a) {
  // Admin (legado): status = 'draft' | 'published'
  const st = String(a?.status || "").toLowerCase().trim();
  if (st) return st === "published";

  // Compat: versões antigas podem ter isPublished boolean
  if (typeof a?.isPublished === "boolean") return a.isPublished === true;

  // Default: se não existe status, não publica (fail closed)
  return false;
}

export async function GET(req) {
  try {
    const originCheck = enforceSameOrigin(req, {
      allowNoOrigin: false,
      allowNoOriginWithAuth: true,
      message: "Acesso bloqueado (origem inválida).",
    });
    if (!originCheck.ok) return originCheck.res;

    const rl = await rateLimit(req, {
      bucket: "paciente:library:get",
      limit: 60,
      windowMs: 60_000,
      errorMessage: "Muitas requisições. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const auth = await requireAuth(req);
    if (!auth.ok) return auth.res;

    const { decoded } = auth;
    if (decoded?.role !== "patient") return forbidden();

    const tenantId = String(decoded.tenantId || "");
    const patientId = String(decoded.patientId || "");
    if (!tenantId || !patientId) return unauthorized();

    const tenantCheck = await ensureTenantActive(tenantId);
    if (!tenantCheck.ok) {
      return NextResponse.json(
        { ok: false, error: "tenant-suspended", code: "TENANT_SUSPENDED" },
        { status: 403 }
      );
    }

    const portalCfg = await getPatientPortalConfig(tenantId);
    if (portalCfg?.libraryEnabled === false) {
      return NextResponse.json({ ok: true, disabled: true, articles: [] }, { status: 200 });
    }

    const { searchParams } = new URL(req.url);
    const limit = clampInt(searchParams.get("limit"), 1, 200, 60);

    const db = admin.firestore();

    // A fonte da verdade é o Admin (global).
    // Ordena por `order` (mais curado) e filtra publicação no servidor para evitar índice composto.
    const snap = await db.collection("library_articles").orderBy("order", "asc").limit(limit).get();

    const articles = snap.docs
      .map((d) => {
        const a = d.data() || {};
        if (!isPublishedArticle(a)) return null;

        const body = asArrayOfStrings(a?.body) || null;
        const content = cleanStr(a?.content || "");

        return {
          id: d.id,
          title: cleanStr(a?.title, 200),
          category: cleanStr(a?.categoryLabel || a?.category, 80) || "Geral",
          summary: cleanStr(a?.summary, 600),
          readingTime: cleanStr(a?.readingTime, 40),
          // aceita `content` (string) ou `body` (array)
          content: content || (body ? body.join("\n\n") : ""),
          body,
          // metadados opcionais
          updatedAt: a?.updatedAt?.toMillis?.() ?? null,
          pinned: Boolean(a?.pinned),
        };
      })
      .filter((a) => a && a.title);

    return NextResponse.json({ ok: true, articles }, { status: 200 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("patient library error:", e);
    return NextResponse.json({ ok: false, error: "Falha ao carregar a biblioteca." }, { status: 500 });
  }
}
