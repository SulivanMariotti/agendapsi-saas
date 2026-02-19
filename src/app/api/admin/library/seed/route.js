import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { adminError } from "@/lib/server/adminError";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";
import { LIBRARY_SEED_ARTICLES, seedArticleToDoc } from "@/lib/shared/librarySeed";

export const runtime = "nodejs";

/**
 * POST /api/admin/library/seed
 *
 * Cria artigos modelo no Firestore para o Admin começar rápido.
 * - Idempotente por docId: seed_<id>
 * - Não sobrescreve conteúdo existente.
 */

export async function POST(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const rl = await rateLimit(req, {
    bucket: "admin:library:seed",
    limit: 10,
    windowMs: 60_000,
    uid: auth.uid,
    errorMessage: "Aguarde um pouco e tente novamente.",
  });
  if (!rl.ok) return rl.res;

  try {
    const db = admin.firestore();
    const col = db.collection("library_articles");
    const catCol = db.collection("library_categories");

    let created = 0;
    let skipped = 0;
    let categoriesCreated = 0;

    for (const a of LIBRARY_SEED_ARTICLES) {
      const docId = `seed_${a.id}`;
      const ref = col.doc(docId);
      const snap = await ref.get();
      if (snap.exists) {
        skipped += 1;
        continue;
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const doc = seedArticleToDoc(a);

      // garante categoria (idempotente)
      if (doc?.categoryId && doc?.categoryLabel) {
        const cRef = catCol.doc(String(doc.categoryId));
        const cSnap = await cRef.get();
        if (!cSnap.exists) {
          await cRef.set({
            name: String(doc.categoryLabel),
            order: 100,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            createdBy: auth.uid,
            updatedBy: auth.uid,
            seed: true,
          });
          categoriesCreated += 1;
        }
      }

      await ref.set({
        ...doc,
        createdAt: now,
        updatedAt: now,
        createdBy: auth.uid,
        updatedBy: auth.uid,
      });
      created += 1;
    }

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "library_article:seed",
      status: "success",
      meta: { created, skipped, categoriesCreated },
    });

    return NextResponse.json({ ok: true, created, skipped, categoriesCreated });
  } catch (err) {
    return adminError({ req, auth, action: "library_article_seed", err });
  }
}
