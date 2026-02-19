import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { requirePatient } from "@/lib/server/requirePatient";

export const runtime = "nodejs";

function serializeFirestoreValue(v) {
  if (v == null) return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (Array.isArray(v)) return v.map(serializeFirestoreValue);
  if (typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = serializeFirestoreValue(val);
    return out;
  }
  return v;
}

function safeNumber(v, defVal = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : defVal;
}

export async function GET(req) {
  try {
    const rl = await rateLimit(req, {
      bucket: "patient:library",
      limit: 120,
      windowMs: 60_000,
      errorMessage: "Muitas requisições. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const auth = await requirePatient(req);
    if (!auth.ok) return auth.res;

    const snap = await admin
      .firestore()
      .collection("library_articles")
      .where("status", "==", "published")
      .limit(250)
      .get();

    const articles = snap.docs
      .map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          ...serializeFirestoreValue(data),
        };
      })
      .map((a) => {
        // redução do payload (apenas o necessário para o paciente)
        const label = String(a.categoryLabel || a.category || "Geral").trim() || "Geral";
        return {
          id: String(a.id || ""),
          title: String(a.title || "").trim(),
          category: label,
          categoryId: a.categoryId ? String(a.categoryId) : null,
          summary: String(a.summary || "").trim(),
          content: String(a.content || "").trim(),
          readingTime: a.readingTime ? String(a.readingTime) : null,
          pinned: Boolean(a.pinned),
          order: safeNumber(a.order, 9999),
          updatedAt: a.updatedAt ?? null,
        };
      })
      .filter((a) => a.title && a.content);

    // Ordenação estável (sem exigir index composto)
    articles.sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap; // pinned desc
      if (a.order !== b.order) return a.order - b.order; // order asc
      const au = safeNumber(a.updatedAt, 0);
      const bu = safeNumber(b.updatedAt, 0);
      return bu - au; // updatedAt desc
    });

    return NextResponse.json({ ok: true, articles });
  } catch (e) {
    console.error("[PATIENT_LIBRARY] Error", e);
    return NextResponse.json({ ok: false, error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
