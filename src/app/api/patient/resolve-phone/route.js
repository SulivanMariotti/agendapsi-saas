import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { requirePatient } from "@/lib/server/requirePatient";

export const runtime = "nodejs";

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function isInactiveUser(u) {
  const status = String(u?.status ?? "active").toLowerCase().trim();
  if (["inactive", "disabled", "archived", "deleted", "merged"].includes(status)) return true;
  if (u?.isActive === false) return true;
  if (u?.disabled === true) return true;
  if (u?.deletedAt) return true;
  if (u?.disabledAt) return true;
  if (u?.mergedTo) return true;
  return false;
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  const n = Date.parse(String(ts));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Canonical phone for this project:
 * - DDD + número (10/11 dígitos)
 * - SEM 55
 */
function toPhoneCanonical(raw) {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d.slice(2);
  if (d.length === 10 || d.length === 11) return d;
  if (d.length > 11) return d.slice(-11);
  return d;
}

export async function GET(req) {
  try {
    const rl = await rateLimit(req, {
      bucket: "patient:resolve-phone",
      limit: 60,
      windowMs: 60_000,
      errorMessage: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const auth = await requirePatient(req);
    if (!auth.ok) return auth.res;

    const decoded = auth.decoded;
    const uid = auth.uid;

    const userRef = admin.firestore().collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const email =
      String(decoded?.email || "").trim().toLowerCase() ||
      String(userData?.email || "").trim().toLowerCase() ||
      "";

    // Aceita múltiplos campos possíveis (inclui custom claims dos custom tokens)
    const claimPhoneRaw =
      decoded?.phoneCanonical ||
      decoded?.patientPhone ||
      decoded?.phone ||
      decoded?.phone_number ||
      "";

    const phoneRaw =
      userData?.phoneCanonical ||
      userData?.phone ||
      userData?.phoneNumber ||
      userData?.phoneE164 ||
      claimPhoneRaw ||
      "";

    let phoneCanonical = toPhoneCanonical(phoneRaw);

    // Fallback 2: se o doc atual não tem telefone, tenta resolver pelo EMAIL
    // (casos legados: doc antigo sem phone/phoneCanonical)
    if (!phoneCanonical && email) {
      const q = await admin
        .firestore()
        .collection("users")
        .where("role", "==", "patient")
        .where("email", "==", email)
        .limit(10)
        .get();

      const candidates = q.docs.map((d) => ({ id: d.id, ...d.data() }));
      const actives = candidates.filter((c) => !isInactiveUser(c));

      // Escolhe o "melhor" doc (com telefone preenchido)
      let best = null;
      for (const c of actives) {
        const pc = toPhoneCanonical(c?.phoneCanonical || c?.phone || c?.phoneNumber || c?.phoneE164 || "");
        if (pc) {
          best = { ...c, phoneCanonical: pc };
          break;
        }
      }

      if (best?.phoneCanonical) {
        phoneCanonical = best.phoneCanonical;

        // Best-effort: corrige o doc atual (uid) para evitar repetir esse fallback no futuro
        try {
          await userRef.set(
            {
              phoneCanonical,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } catch (_) {
          // ignore
        }
      }
    }

    if (!phoneCanonical) {
      return NextResponse.json({ ok: false, error: "Telefone não encontrado no cadastro." }, { status: 404 });
    }

    // Também devolve infos úteis (não sensíveis) para UX do painel
    const lastSeenAt = toMillis(userData?.lastSeenAt || userData?.lastSeen || userData?.updatedAt || null);

    return NextResponse.json({
      ok: true,
      uid,
      phoneCanonical,
      email: email || null,
      lastSeenAt: lastSeenAt || null,
    });
  } catch (e) {
    console.error("[PATIENT_RESOLVE_PHONE] Error", e);
    return NextResponse.json({ ok: false, error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
