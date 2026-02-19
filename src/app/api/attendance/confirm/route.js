import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { requirePatient } from "@/lib/server/requirePatient";
import { asPlainObject, enforceAllowedKeys, getString, readJsonBody } from "@/lib/server/payloadSchema";

export const runtime = "nodejs";

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function normalizePhoneCanonical(input) {
  let d = onlyDigits(input).replace(/^0+/, "");
  if (!d) return "";
  // Remove DDI 55 (BR) se vier junto
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

export async function POST(req) {
  try {
    const auth = await requirePatient(req);
    if (!auth.ok) return auth.res;

    const uid = auth.uid;

    const rlIp = await rateLimit(req, {
      bucket: "patient:attendance:confirm:ip",
      global: true,
      limit: 120,
      windowMs: 10 * 60_000,
      errorMessage: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    });
    if (!rlIp.ok) return rlIp.res;

    const rl = await rateLimit(req, {
      bucket: "patient:attendance:confirm",
      global: true,
      uid,
      limit: 30,
      windowMs: 10 * 60_000,
      errorMessage: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const rb = await readJsonBody(req, { maxBytes: 6_000 });
    if (!rb.ok) {
      return NextResponse.json({ ok: false, error: rb.error }, { status: 400 });
    }

    const po = asPlainObject(rb.value);
    if (!po.ok) {
      return NextResponse.json({ ok: false, error: po.error }, { status: 400 });
    }

    const ek = enforceAllowedKeys(po.value, ["appointmentId", "channel"], { showKeys: false });
    if (!ek.ok) {
      return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    }

    const appointmentRes = getString(po.value, "appointmentId", {
      required: true,
      trim: true,
      max: 160,
      maxBytes: 300,
      label: "appointmentId",
    });
    if (!appointmentRes.ok) {
      return NextResponse.json({ ok: false, error: appointmentRes.error }, { status: 400 });
    }

    const channelRes = getString(po.value, "channel", {
      required: false,
      trim: true,
      max: 20,
      defaultValue: "web",
      label: "channel",
    });
    if (!channelRes.ok) {
      return NextResponse.json({ ok: false, error: channelRes.error }, { status: 400 });
    }

    const appointmentId = appointmentRes.value;
    const channel = channelRes.value || "web";

    const db = admin.firestore();

    // Segurança/Integridade: NÃO aceitar phone do client.
    // Deriva do perfil do paciente (users/{uid}) para evitar falsificação/ruído.
    let phoneCanonical = "";
    let patientExternalId = null;
    try {
      const userSnap = await db.collection("users").doc(uid).get();
      const u = userSnap.exists ? userSnap.data() || {} : {};
      phoneCanonical = normalizePhoneCanonical(u.phoneCanonical || u.phone || "");
      patientExternalId = String(u.patientExternalId || "").trim() || null;
    } catch (_) {
      // best-effort (confirmar presença não deve falhar por leitura do perfil)
    }

    // Deduplicação + rate limit leve (evita spam / múltiplos cliques)
    // 1) Bloqueia confirmações repetidas para o mesmo appointmentId + uid
    const existingSnap = await db
      .collection("attendance_logs")
      .where("eventType", "==", "patient_confirmed")
      .where("appointmentId", "==", appointmentId)
      .where("patientId", "==", uid)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return NextResponse.json({ ok: true, alreadyConfirmed: true });
    }

    // 2) Rate limit: se confirmou outra sessão há menos de 30s, bloqueia (protege contra double-click)
    const recentSnap = await db
      .collection("attendance_logs")
      .where("eventType", "==", "patient_confirmed")
      .where("patientId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (!recentSnap.empty) {
      const last = recentSnap.docs[0].data()?.createdAt?.toDate?.();
      if (last) {
        const diffMs = Date.now() - last.getTime();
        if (diffMs < 30_000) {
          return NextResponse.json({ ok: false, error: "Aguarde alguns segundos e tente novamente." }, { status: 429 });
        }
      }
    }

    await db.collection("attendance_logs").add({
      eventType: "patient_confirmed",
      appointmentId,
      patientId: uid,
      // compatibilidade: alguns fluxos legados leem "phone"; padrão novo: phoneCanonical
      phone: phoneCanonical || null,
      phoneCanonical: phoneCanonical || null,
      patientExternalId,
      channel,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, alreadyConfirmed: false });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}
