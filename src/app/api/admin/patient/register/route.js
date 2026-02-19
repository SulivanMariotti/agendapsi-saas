import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";
import { adminError } from "@/lib/server/adminError";
import { writeHistory } from "@/lib/server/historyLog";
import { asPlainObject, enforceAllowedKeys, getString, readJsonBody } from "@/lib/server/payloadSchema";
export const runtime = "nodejs";
/**
 * POST /api/admin/patient/register
 *
 * Cria/edita paciente (whitelist):
 * - users/{uid} (perfil + contrato + patientExternalId)
 * - subscribers/{phoneCanonical} (pushToken/metadata) — paciente NÃO lê no client
 *
 * Payload:
 * { name, email, phone, patientExternalId?, previousPhoneCanonical?, previousEmail? }
 *
 * Regras importantes:
 * - Identidade estável do paciente = patientExternalId (quando informado).
 * - Alterar email/telefone NÃO pode criar um novo paciente.
 */

function getServiceAccount() {
  const b64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_B64;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT(_B64) env var");
  return JSON.parse(raw);
}

function initAdmin() {
  if (admin.apps.length) return;
  admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function normalizePhoneCanonical(input) {
  let d = onlyDigits(input).replace(/^0+/, "");
  if (!d) return "";
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

async function findUserDocByExternalId(db, patientExternalId) {
  const snap = await db
    .collection("users")
    .where("patientExternalId", "==", patientExternalId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, data: doc.data() || {} };
}

export async function POST(req) {
  let gate = null;
  try {
    initAdmin();

    // Gatekeeper: valida Bearer token + custom claim role=admin
    gate = await requireAdmin(req);
    if (!gate.ok) return gate.res;

    const rl = await rateLimit(req, {
      bucket: "admin:patient:register",
      uid: gate.uid,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;


    const rb = await readJsonBody(req, { maxBytes: 30_000 });
    if (!rb.ok) {
      return NextResponse.json({ ok: false, error: rb.error }, { status: 400 });
    }

    const po = asPlainObject(rb.value);
    if (!po.ok) {
      return NextResponse.json({ ok: false, error: po.error }, { status: 400 });
    }

    const ek = enforceAllowedKeys(
      po.value,
      ["name", "email", "phone", "patientExternalId", "previousPhoneCanonical", "previousEmail"],
      { label: "PatientRegister" }
    );
    if (!ek.ok) {
      return NextResponse.json({ ok: false, error: ek.error }, { status: 400 });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    const nameRes = getString(po.value, "name", {
      required: true,
      trim: true,
      max: 120,
      maxBytes: 420,
      label: "Nome",
    });
    if (!nameRes.ok) {
      return NextResponse.json({ ok: false, error: nameRes.error }, { status: 400 });
    }

    const emailRes = getString(po.value, "email", {
      required: true,
      trim: true,
      toLower: true,
      max: 160,
      maxBytes: 260,
      pattern: emailPattern,
      label: "Email",
    });
    if (!emailRes.ok) {
      return NextResponse.json({ ok: false, error: emailRes.error }, { status: 400 });
    }

    const phoneRes = getString(po.value, "phone", {
      required: true,
      trim: true,
      max: 40,
      maxBytes: 120,
      label: "Telefone",
    });
    if (!phoneRes.ok) {
      return NextResponse.json({ ok: false, error: phoneRes.error }, { status: 400 });
    }

    const extRes = getString(po.value, "patientExternalId", {
      required: false,
      trim: true,
      max: 80,
      maxBytes: 120,
      defaultValue: "",
      label: "ID externo",
    });
    if (!extRes.ok) {
      return NextResponse.json({ ok: false, error: extRes.error }, { status: 400 });
    }

    const prevPhoneRes = getString(po.value, "previousPhoneCanonical", {
      required: false,
      trim: true,
      max: 40,
      maxBytes: 120,
      defaultValue: "",
      label: "Telefone anterior",
    });
    if (!prevPhoneRes.ok) {
      return NextResponse.json({ ok: false, error: prevPhoneRes.error }, { status: 400 });
    }

    const prevEmailRes = getString(po.value, "previousEmail", {
      required: false,
      trim: true,
      toLower: true,
      max: 160,
      maxBytes: 260,
      pattern: emailPattern,
      defaultValue: "",
      label: "Email anterior",
    });
    if (!prevEmailRes.ok) {
      return NextResponse.json({ ok: false, error: prevEmailRes.error }, { status: 400 });
    }

    const name = nameRes.value;
    const email = emailRes.value;
    const phoneCanonical = normalizePhoneCanonical(phoneRes.value);
    const patientExternalId = String(extRes.value || "").trim() || null;

    const previousPhoneCanonical = normalizePhoneCanonical(prevPhoneRes.value || "");
    const previousEmail = String(prevEmailRes.value || "").trim();

    if (!name || !email || !(phoneCanonical.length === 10 || phoneCanonical.length === 11)) {
      return NextResponse.json({ ok: false, error: "Dados inválidos" }, { status: 400 });
    }

    const db = admin.firestore();
    const auth = admin.auth();
    const nowTs = admin.firestore.Timestamp.now();

    // 1) Resolver UID (prioridade: patientExternalId)
    let uid = null;

    if (patientExternalId) {
      const found = await findUserDocByExternalId(db, patientExternalId);
      if (found?.uid) uid = found.uid;
    }

    // Fallbacks para bases antigas / edições sem externalId
    if (!uid && previousEmail) {
      try {
        const prev = await auth.getUserByEmail(previousEmail);
        uid = prev.uid;
      } catch (_) {}
    }

    if (!uid) {
      try {
        const byEmail = await auth.getUserByEmail(email);
        uid = byEmail.uid;
      } catch (_) {}
    }

    // 2) Garantir que existe usuário no Auth e que o email/nome estão atualizados
    let userRecord = null;
    if (uid) {
      try {
        userRecord = await auth.getUser(uid);
      } catch (_) {
        // se Firestore tem doc mas Auth não tem (raro), cria
        userRecord = await auth.createUser({ email, displayName: name, disabled: false });
        uid = userRecord.uid;
      }

      // Atualizar email/nome se necessário (IMPORTANTE: não criar novo user ao trocar email)
      const needEmailUpdate = String(userRecord.email || "").toLowerCase() !== email;
      const needNameUpdate = String(userRecord.displayName || "") !== name;

      if (needEmailUpdate || needNameUpdate || userRecord.disabled) {
        // Se email já estiver em uso por outro uid, Firebase lança error e a gente devolve 409
        try {
          await auth.updateUser(uid, {
            email,
            displayName: name,
            disabled: false,
          });
          userRecord = await auth.getUser(uid);
        } catch (e) {
          const msg = e?.message || "Erro ao atualizar usuário";
          const isEmailInUse =
            String(e?.code || "").includes("email-already") ||
            String(msg).toLowerCase().includes("email") && String(msg).toLowerCase().includes("already");
          return NextResponse.json(
            { ok: false, error: isEmailInUse ? "Email já está em uso por outro paciente" : msg },
            { status: isEmailInUse ? 409 : 500 }
          );
        }
      }
    } else {
      // Criar novo (somente quando não existe mesmo)
      userRecord = await auth.createUser({ email, displayName: name, disabled: false });
      uid = userRecord.uid;
    }

    // 3) users/{uid} (não sobrescrever createdAt se já existe)
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const isNewDoc = !userSnap.exists;

    await userRef.set(
      {
        uid,
        role: "patient",
        name,
        email,
        // manter compatibilidade com campos antigos
        phone: phoneCanonical,
        phoneCanonical,
        patientExternalId,
        status: "active",
        updatedAt: nowTs,
        ...(isNewDoc ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      },
      { merge: true }
    );

    // 4) subscribers/{phoneCanonical} com migração de token se telefone mudou
    const newSubRef = db.collection("subscribers").doc(phoneCanonical);

    if (previousPhoneCanonical && previousPhoneCanonical !== phoneCanonical) {
      const oldSubRef = db.collection("subscribers").doc(previousPhoneCanonical);
      const [oldSnap, newSnap] = await Promise.all([oldSubRef.get(), newSubRef.get()]);

      const oldData = oldSnap.exists ? oldSnap.data() || {} : {};
      const newData = newSnap.exists ? newSnap.data() || {} : {};

      // Se o novo ainda não tem pushToken, tenta copiar do antigo
      const pushTokenToCarry = newData.pushToken ? null : oldData.pushToken || null;

      await newSubRef.set(
        {
          phoneCanonical,
          status: "active",
          ...(pushTokenToCarry ? { pushToken: pushTokenToCarry } : {}),
          updatedAt: nowTs,
          ...(newSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );

      // Marca o antigo como merged (não apaga)
      await oldSubRef.set(
        { status: "merged", mergedTo: phoneCanonical, updatedAt: nowTs },
        { merge: true }
      );
    } else {
      const snap = await newSubRef.get();
      await newSubRef.set(
        {
          phoneCanonical,
          status: "active",
          updatedAt: nowTs,
          ...(snap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );
    }

    // 5) Marcadores de merge para email anterior (não cria paciente novo)
    if (previousEmail && previousEmail !== email) {
      try {
        const prev = await auth.getUserByEmail(previousEmail);
        if (prev?.uid && prev.uid !== uid) {
          await db.collection("users").doc(prev.uid).set(
            { status: "merged", mergedTo: uid, updatedAt: nowTs },
            { merge: true }
          );
        }
      } catch (_) {}
    }

    await writeHistory(db, {
      type: "patient_register",
      createdAt: nowTs,
      uid,
      phoneCanonical,
      email,
      patientExternalId,
    });

    await logAdminAudit({
      req,
      actorUid: gate.uid,
      actorEmail: gate.decoded?.email || null,
      action: "patient_register_upsert",
      target: uid,
      meta: { patientExternalId, phoneCanonical, previousPhoneCanonical: previousPhoneCanonical || null, previousEmail: previousEmail || null },
    });

    return NextResponse.json({ ok: true, uid, phoneCanonical }, { status: 200 });
  } catch (e) {
    return adminError({ req, auth: gate?.ok ? gate : null, action: "patient_register", err: e });
  }
}
