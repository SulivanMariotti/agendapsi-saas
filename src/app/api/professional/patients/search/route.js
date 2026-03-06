import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireProfessionalApi } from "@/lib/server/requireProfessionalApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onlyDigits(v) {
  return String(v || "").replace(/\D+/g, "");
}

// Canonical: 10-11 digits (BR) without country code.
// Mirrors server logic used elsewhere in the project.
function toPhoneCanonical(raw) {
  let d = onlyDigits(raw);
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d;
  if (d.length > 11) return d.slice(-11);
  return d;
}

function uniqBy(arr, keyFn) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const k = keyFn(it);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function safeStr(v) {
  return String(v || "").trim();
}

function normalizeText(v) {
  const s = safeStr(v).toLowerCase();
  // Remove accents/diacritics for more forgiving matching (BR names).
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDate(tsOrDate) {
  if (!tsOrDate) return "";
  const d =
    typeof tsOrDate?.toDate === "function"
      ? tsOrDate.toDate()
      : tsOrDate instanceof Date
        ? tsOrDate
        : new Date(tsOrDate);
  const t = d?.getTime?.();
  if (!Number.isFinite(t)) return "";
  return d.toISOString().slice(0, 10);
}

function startAtMillisFromOcc(occ) {
  // Prefer precomputed startAt when present.
  const sa = occ?.startAt;
  try {
    if (sa && typeof sa?.toDate === "function") {
      const ms = sa.toDate().getTime();
      if (Number.isFinite(ms)) return ms;
    }
  } catch {
    // ignore
  }

  const iso = toIsoDate(occ?.date);
  const st = safeStr(occ?.startTime || "");
  if (!iso) return null;

  if (st && /^\d{2}:\d{2}$/.test(st)) {
    const ms = new Date(`${iso}T${st}:00`).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = new Date(`${iso}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

async function getNextApptForPatient({ tenantRef, patientId, nowMs }) {
  if (!tenantRef || !patientId) return null;
  try {
    // Keep it simple to avoid extra composite indexes: fetch a bounded set and rank server-side.
    const snap = await tenantRef.collection("appointmentOccurrences").where("patientId", "==", patientId).limit(250).get();
    let best = null;

    for (const doc of snap.docs) {
      const o = doc.data() || {};
      if (o?.isHold === true) continue;
      if (o?.isBlock === true) continue;
      if (safeStr(o?.status) === "Cancelado") continue;

      const ms = startAtMillisFromOcc(o);
      if (!Number.isFinite(ms)) continue;

      // Consider an appointment "upcoming" when it is in the future (or happening right now within a short grace).
      const graceMs = 5 * 60 * 1000;
      if (ms < (nowMs - graceMs)) continue;

      if (!best || ms < best.startAtMs) {
        best = {
          occurrenceId: doc.id,
          isoDate: toIsoDate(o?.date),
          startTime: safeStr(o?.startTime),
          startAtMs: ms,
        };
      }
    }

    if (!best?.occurrenceId || !best?.isoDate) return null;
    const { startAtMs, ...out } = best;
    return out;
  } catch {
    return null;
  }
}

async function maybeAttachNextAppts({ tenantRef, patients }) {
  const list = Array.isArray(patients) ? patients : [];
  const nowMs = Date.now();

  const enriched = await Promise.all(
    list.map(async (p) => {
      const pid = safeStr(p?.patientId || "");
      if (!pid) return p;
      const nextAppt = await getNextApptForPatient({ tenantRef, patientId: pid, nowMs });
      if (!nextAppt) return p;
      return { ...p, nextAppt };
    })
  );

  return enriched;
}




export async function GET(request) {
  const auth = await requireProfessionalApi(request, { bucket: "professional:patients:search", limit: 240, windowMs: 60_000 });
  if (!auth.ok) return auth.res;

  const session = auth.session;
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const qRaw = safeStr(searchParams.get("q") || "");
  const includeNextRaw = safeStr(searchParams.get("includeNext") || "");
  const includeNext = ["1", "true", "yes", "y"].includes(includeNextRaw.toLowerCase());
  const q = qRaw.slice(0, 80); // hard cap
  if (q.length < 2) return NextResponse.json({ ok: true, patients: [] }, { status: 200 });

  const db = admin.firestore();
  const tenantRef = db.collection("tenants").doc(session.tenantId);
  const patientsRef = tenantRef.collection("patients");

  const finalize = async (patients) => {
    const out = includeNext ? await maybeAttachNextAppts({ tenantRef, patients }) : patients;
    return NextResponse.json({ ok: true, patients: out }, { status: 200 });
  };

  const qDigits = onlyDigits(q);
  const qLower = q.toLowerCase();
  const qNorm = normalizeText(q);

  try {
    // -------- 1) Exact CPF / phone matches (fast paths) --------
    const directPatientIds = [];

    // CPF: 11 digits (exact)
    if (qDigits.length === 11 && !qDigits.startsWith("55")) {
      try {
        const cpfIndexSnap = await tenantRef.collection("patientCpfIndex").doc(qDigits).get();
        const pid = safeStr(cpfIndexSnap.data()?.patientId || "");
        if (pid) directPatientIds.push(pid);
      } catch {
        // ignore
      }
    }

    // Phone: canonical 10/11 digits (exact)
    if (qDigits.length >= 8) {
      const canon = toPhoneCanonical(qDigits);
      if (canon) {
        try {
          const phoneIndexSnap = await tenantRef.collection("patientPhoneIndex").doc(canon).get();
          const pid = safeStr(phoneIndexSnap.data()?.patientId || "");
          if (pid) directPatientIds.push(pid);
        } catch {
          // ignore
        }
      }
    }

    if (directPatientIds.length) {
      const unique = uniqBy(directPatientIds, (x) => x).slice(0, 8);
      const docs = await Promise.all(
        unique.map(async (pid) => {
          try {
            const snap = await patientsRef.doc(pid).get();
            if (!snap.exists) return null;
            const d = snap.data() || {};
            return {
              patientId: snap.id,
              fullName: safeStr(d.fullName),
              preferredName: safeStr(d.preferredName),
              phoneE164: safeStr(d.phoneE164),
              profileStatus: safeStr(d.profileStatus),
              profileCompleted: Boolean(d.profileCompleted),
            };
          } catch {
            return null;
          }
        })
      );
      const patients = docs.filter(Boolean);
      return await finalize(patients);
    }

        // -------- 2) Name prefix search (normalized, if available) --------
    // If patient docs maintain a `searchName` field (lowercased + no accents),
    // this makes search more forgiving without requiring a scan.
    const normHits = [];
    if (qNorm.length >= 2) {
      try {
        const snap = await patientsRef
          .orderBy("searchName")
          .startAt(qNorm)
          .endAt(qNorm + "\uf8ff")
          .limit(8)
          .get();

        for (const doc of snap.docs) {
          const d = doc.data() || {};
          normHits.push({
            patientId: doc.id,
            fullName: safeStr(d.fullName),
            preferredName: safeStr(d.preferredName),
            phoneE164: safeStr(d.phoneE164),
            profileStatus: safeStr(d.profileStatus),
            profileCompleted: Boolean(d.profileCompleted),
          });
        }
      } catch {
        // ignore (field/index might not exist yet)
      }
    }

    const dedupNorm = uniqBy(normHits, (p) => p.patientId).slice(0, 8);
    if (dedupNorm.length) {
      return await finalize(dedupNorm);
    }

// -------- 3) Name prefix search (best-effort) --------
    const prefixCandidates = uniqBy(
      [
        q,
        q.length ? q[0].toUpperCase() + q.slice(1) : q,
        qLower,
      ].map((x) => safeStr(x)).filter(Boolean),
      (x) => x
    ).slice(0, 3);

    const prefixHits = [];
    for (const pref of prefixCandidates) {
      try {
        const snap = await patientsRef.orderBy("fullName").startAt(pref).endAt(pref + "\uf8ff").limit(8).get();
        for (const doc of snap.docs) {
          const d = doc.data() || {};
          prefixHits.push({
            patientId: doc.id,
            fullName: safeStr(d.fullName),
            preferredName: safeStr(d.preferredName),
            phoneE164: safeStr(d.phoneE164),
            profileStatus: safeStr(d.profileStatus),
            profileCompleted: Boolean(d.profileCompleted),
          });
        }
      } catch {
        // ignore
      }
      if (prefixHits.length >= 8) break;
    }

    const dedupPrefix = uniqBy(prefixHits, (p) => p.patientId).slice(0, 8);
    if (dedupPrefix.length) {
      return await finalize(dedupPrefix);
    }

    // -------- 4) Fallback: bounded scan (ranked) --------
    // NOTE: bounded + rate-limited. This avoids needing search indexes for now.
        const scanSnap = await patientsRef.orderBy("updatedAt", "desc").limit(300).get();

        // Collect a small ranked set (bounded) for better relevance.
        const ranked = [];
        for (const doc of scanSnap.docs) {
          const d = doc.data() || {};
          const fullName = safeStr(d.fullName);
          const pref = safeStr(d.preferredName);
          const phoneE164 = safeStr(d.phoneE164);
          const mobile = safeStr(d.mobile);

          const hayNorm = normalizeText(`${fullName} ${pref}`);
          const phoneDigitsHay = onlyDigits(`${phoneE164} ${mobile}`);

          const phoneMatch = qDigits.length >= 5 && phoneDigitsHay.includes(qDigits);
          const nameMatch = qNorm.length >= 2 && hayNorm.includes(qNorm);
          if (!phoneMatch && !nameMatch) continue;

          let score = 0;
          if (phoneMatch) score += 100;
          if (qNorm && hayNorm.startsWith(qNorm)) score += 80;
          if (qNorm && hayNorm.includes(` ${qNorm}`)) score += 60;
          if (nameMatch) score += 40;

          ranked.push({
            score,
            patientId: doc.id,
            fullName,
            preferredName: pref,
            phoneE164,
            profileStatus: safeStr(d.profileStatus),
            profileCompleted: Boolean(d.profileCompleted),
          });

          if (ranked.length >= 40) break;
        }

        ranked.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return String(a.fullName || "").localeCompare(String(b.fullName || ""), "pt-BR", { sensitivity: "base" });
        });

        const scanHits = ranked.slice(0, 8).map(({ score, ...rest }) => rest);
        return await finalize(scanHits);
  } catch (e) {
    return NextResponse.json({ ok: false, error: "search_failed", message: safeStr(e?.message) }, { status: 400 });
  }
}
