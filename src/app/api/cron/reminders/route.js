import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { writeHistory } from "@/lib/server/historyLog";
import { requireCron } from "@/lib/server/cronAuth";
import { fetchSubscriberMetaByPhone } from "@/lib/server/subscriberLookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reminders
 *
 * Objetivo clínico (produto): garantir que os lembretes 48h/24h/12h sejam enviados
 * automaticamente, reduzindo faltas por esquecimento e sustentando constância.
 *
 * Segurança:
 * - Produção: header-only (não expõe secret em URL/log).
 *   - Authorization: Bearer <secret>
 *   - ou x-cron-secret: <secret>
 * - Legado (desativado em produção): ?key=...
 *   (só funciona se ALLOW_CRON_QUERY_KEY=true).
 */

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function normalizePhoneCanonical(input) {
  let d = onlyDigits(input).replace(/^0+/, "");
  if (!d) return "";
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

function escapeRegExp(str) {
  return String(str || "").replace(/[.*+?^${}()|[\[\]\\]/g, "\\$&");
}

function applyTemplate(tpl, vars) {
  const template = String(tpl || "");
  if (!template) return "";

  const nameFull = String(vars.nameFull || vars.nomeCompleto || vars.name || vars.nome || "").trim();
  const firstName = nameFull ? nameFull.split(" ")[0] : "";

  const map = {
    // nomes
    nome: firstName,
    name: firstName,
    nomecompleto: nameFull,
    fullname: nameFull,

    // data/hora
    data: String(vars.date || vars.data || ""),
    date: String(vars.date || vars.data || ""),
    hora: String(vars.time || vars.hora || ""),
    time: String(vars.time || vars.hora || ""),

    // profissional
    profissional: String(vars.professional || vars.profissional || ""),
    professional: String(vars.professional || vars.profissional || ""),
    terapeuta: String(vars.professional || vars.profissional || ""),

    // serviço/local
    servicotype: String(vars.serviceType || vars.servico || "Sessão"),
    servico: String(vars.serviceType || vars.servico || "Sessão"),
    service: String(vars.serviceType || vars.servico || "Sessão"),

    location: String(vars.location || vars.local || "Clínica"),
    local: String(vars.location || vars.local || "Clínica"),
  };

  let out = template;
  for (const [k, v] of Object.entries(map)) {
    const key = escapeRegExp(k);
    const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}|\\{\\s*${key}\\s*\\}`, "gi");
    out = out.replace(re, String(v ?? ""));
  }
  return out;
}

function normalizeReminderSlot(reminderType) {
  const rt = String(reminderType || "").toLowerCase().trim();
  if (!rt) return "";
  if (rt === "slot1" || rt.includes("slot1") || rt === "1" || rt.includes("48")) return "slot1";
  if (rt === "slot2" || rt.includes("slot2") || rt === "2" || rt.includes("24")) return "slot2";
  if (rt === "slot3" || rt.includes("slot3") || rt === "3" || rt.includes("12")) return "slot3";
  return "";
}

function joinTitle(prefix, suffix) {
  const p = String(prefix || "").trim();
  const s = String(suffix || "").trim();
  if (!p) return s;
  if (!s) return p;
  const needsSpace = !p.endsWith(" ") && !s.startsWith(" ");
  if (/[—\-:•]$/.test(p)) return p + (needsSpace ? " " : "") + s;
  return p + " — " + s;
}

function resolveReminderTitle(cfg, slotKey) {
  const defaultsFull = {
    slot1: "💜 Lembrete Psi — Seu espaço em 48h",
    slot2: "💜 Lembrete Psi — Amanhã: seu horário",
    slot3: "💜 Lembrete Psi — Hoje: sessão no seu horário",
    multi: "💜 Lembrete Psi — Seus lembretes",
    fallback: "💜 Lembrete Psi — Seu espaço de cuidado",
  };

  const suffixDefaults = {
    slot1: "Seu espaço em 48h",
    slot2: "Amanhã: seu horário",
    slot3: "Hoje: sessão no seu horário",
    multi: "Seus lembretes",
    fallback: "Seu espaço de cuidado",
  };

  const keyMap = {
    slot1: "reminderTitle1",
    slot2: "reminderTitle2",
    slot3: "reminderTitle3",
    multi: "reminderTitleMulti",
    fallback: "reminderTitleDefault",
  };

  const k = keyMap[slotKey] || keyMap.fallback;
  const raw = cfg && cfg[k] != null ? String(cfg[k]).trim() : "";
  const prefixSafe = cfg && cfg.reminderTitlePrefix != null ? String(cfg.reminderTitlePrefix).trim() : "";

  if (raw) {
    if (prefixSafe && !raw.includes("Lembrete Psi") && !raw.includes("💜")) return joinTitle(prefixSafe, raw);
    return raw;
  }

  if (prefixSafe) {
    const suf = suffixDefaults[slotKey] || suffixDefaults.fallback;
    return joinTitle(prefixSafe, suf);
  }

  return defaultsFull[slotKey] || defaultsFull.fallback;
}

function pickTemplate(cfg, reminderType) {
  const rt = String(reminderType || "").toLowerCase().trim();

  if (rt === "slot1" || rt.includes("slot1") || rt === "1") return cfg?.msg1 || "";
  if (rt === "slot2" || rt.includes("slot2") || rt === "2") return cfg?.msg2 || "";
  if (rt === "slot3" || rt.includes("slot3") || rt === "3") return cfg?.msg3 || "";

  if (rt.includes("48")) return cfg?.msg48h || cfg?.msg1 || "";
  if (rt.includes("24")) return cfg?.msg24h || cfg?.msg2 || "";
  if (rt.includes("12")) return cfg?.msg12h || cfg?.msg3 || "";

  return cfg?.msg2 || cfg?.msg1 || cfg?.msg3 || cfg?.msg24h || cfg?.msg48h || cfg?.msg12h || "";
}

function isUserInactive(u) {
  if (!u) return false;

  // Flags explícitas de segurança/acesso (fonte de verdade no Lembrete Psi)
  if (u.accessDisabled === true) return true;
  if (u.securityHold === true) return true;
  if (u.accessDisabledAt || (u.access && u.access.disabledAt)) return true;

  const accessStatus = String(u.accessStatus || (u.access && u.access.status) || "").toLowerCase().trim();
  if (["disabled", "blocked", "suspended", "hold"].includes(accessStatus)) return true;

  // Status cadastral (legado/compat)
  const st = String(u.status || "").toLowerCase().trim();
  if (["inactive", "disabled", "archived", "deleted"].includes(st)) return true;

  if (u.deletedAt || u.disabledAt) return true;
  if (u.isActive === false || u.disabled === true) return true;
  if (u.mergedTo) return true;

  return false;
}


async function sendWithConcurrency(messaging, messages, concurrency = 20) {
  const results = new Array(messages.length);
  let idx = 0;

  async function worker() {
    while (idx < messages.length) {
      const myIdx = idx++;
      try {
        const res = await messaging.send(messages[myIdx]);
        results[myIdx] = { success: true, messageId: res };
      } catch (err) {
        results[myIdx] = { success: false, error: err };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, messages.length) }, () => worker());
  await Promise.all(workers);
  return { results };
}

function determineSlotByDiffHours(diffHours, tolHours = 6) {
  if (diffHours < 0) return "";
  if (diffHours <= (12 + tolHours)) return "slot3";
  if (diffHours <= (24 + tolHours)) return "slot2";
  if (diffHours <= (48 + tolHours)) return "slot1";
  return "";
}

export async function GET(req) {
  const guard = requireCron(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";

  const db = admin.firestore();
  const nowDate = new Date();

  // janela: cobre o slot1 (48h + tolerância) com folga
  const tolHours = 6;
  const maxHours = 48 + tolHours;
  const windowEnd = new Date(nowDate.getTime() + (maxHours + 6) * 60 * 60 * 1000);

  // Busca apenas por startAt (sem composite index)
  const snap = await db
    .collection("appointments")
    .where("startAt", ">=", nowDate)
    .where("startAt", "<=", windowEnd)
    .orderBy("startAt", "asc")
    .limit(1500)
    .get();

  const cfgSnap = await db.collection("config").doc("global").get();
  const cfg = cfgSnap.exists ? cfgSnap.data() : {};

  const clickUrl = "https://agenda.msgflow.app.br";
  const now = nowDate.getTime();

  const candidates = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    if (String(data.status || "scheduled").toLowerCase() !== "scheduled") return;
    if (!data.startAt) return;

    const startAtMs = typeof data.startAt?.toMillis === "function" ? data.startAt.toMillis() : new Date(data.startAt).getTime();
    const diffHours = (startAtMs - now) / (1000 * 60 * 60);
    const slot = determineSlotByDiffHours(diffHours, tolHours);
    if (!slot) return;

    const already = Boolean(data?.reminders?.[slot]?.sentAt);
    if (already) return;

    const phone = normalizePhoneCanonical(data.phoneCanonical || data.phone || "");
    if (!phone) return;

    candidates.push({
      id: d.id,
      phoneCanonical: phone,
      slot,
      nome: String(data.nome || ""),
      profissional: String(data.profissional || ""),
      isoDate: String(data.isoDate || ""),
      date: String(data.date || ""),
      time: String(data.time || ""),
      serviceType: String(data.serviceType || "Sessão"),
      location: String(data.location || "Clínica"),
    });
  });

  // Agrupa por telefone (um push por paciente por execução)
  const byPhone = new Map();
  for (const c of candidates) {
    const arr = byPhone.get(c.phoneCanonical) || [];
    arr.push(c);
    byPhone.set(c.phoneCanonical, arr);
  }
  const phones = Array.from(byPhone.keys());

  // Subscribers em batch (canonical + compat legado 55)
  const subMetaByPhone = await fetchSubscriberMetaByPhone(db, phones);
  const subByPhone = {};
  for (const phone of phones) {
    const m = subMetaByPhone[phone] || { token: null, inactive: false };
    subByPhone[phone] = { token: m.token ? String(m.token) : null, inactive: Boolean(m.inactive) };
  }


  // Users inativos (best effort)
  const userInactiveByPhone = {};
  if (phones.length) {
    const inChunk = 10;
    for (let i = 0; i < phones.length; i += inChunk) {
      const chunk = phones.slice(i, i + inChunk);
      const snapUsers = await db
        .collection("users")
        .where("role", "==", "patient")
        .where("phoneCanonical", "in", chunk)
        .get();
      snapUsers.docs.forEach((doc) => {
        const data = doc.data() || {};
        const ph = String(data.phoneCanonical || "").trim();
        if (!ph) return;
        const inactive = isUserInactive(data);
          // Se existir QUALQUER perfil ativo com este telefone, o telefone NÃO deve ser tratado como inativo.
          // (evita que um registro antigo/inativo "vença" quando há duplicatas)
          userInactiveByPhone[ph] = (userInactiveByPhone[ph] ?? true) && inactive;
});
    }
  }

  let skippedNoToken = 0;
  let skippedInactive = 0;
  let skippedNoPhone = 0;
  let skippedPreparedAlreadySent = 0;

  const messages = [];
  const perPhoneMeta = [];

  for (const phone of phones) {
    const itemsRaw = byPhone.get(phone) || [];

    if (!phone) {
      skippedNoPhone += itemsRaw.length;
      continue;
    }

    if (userInactiveByPhone[phone] === true) {
      skippedInactive += itemsRaw.length;
      continue;
    }

    const sub = subByPhone[phone] || { token: null, inactive: false };
    if (sub.inactive) {
      skippedInactive += itemsRaw.length;
      continue;
    }
    if (!sub.token) {
      skippedNoToken += itemsRaw.length;
      continue;
    }

    // dedup local por appointmentId+slot e respeita idempotência atual (já filtrado em candidates)
    const seen = new Set();
    const items = [];
    for (const it of itemsRaw) {
      const slot = normalizeReminderSlot(it.slot);
      const key = `${it.id}:${slot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!slot) continue;
      items.push({ ...it, _slot: slot });
    }

    if (!items.length) {
      skippedPreparedAlreadySent += itemsRaw.length;
      continue;
    }

    const first = items[0];
    const date = first.date || (first.isoDate ? first.isoDate : "");
    const time = first.time || "";

    const tpl = pickTemplate(cfg, first._slot);
    let bodyText = tpl
      ? applyTemplate(tpl, {
          nameFull: first.nome,
          professional: first.profissional,
          date,
          time,
          serviceType: first.serviceType,
          location: first.location,
        })
      : "";

    if (!bodyText) {
      const firstName = first.nome ? String(first.nome).trim().split(" ")[0] : "";
      bodyText = `Olá${firstName ? ", " + firstName : ""}. Seu horário de cuidado está reservado para ${date || "a data agendada"} às ${
        time || "hora agendada"
      }.`;
    }

    // garante placeholders também se já veio preenchido
    bodyText = applyTemplate(bodyText, {
      nameFull: first.nome,
      professional: first.profissional,
      date,
      time,
      serviceType: first.serviceType,
      location: first.location,
    });

    const extraCount = items.length - 1;
    const finalBody = extraCount > 0 ? `${bodyText}\n\nVocê tem mais ${extraCount} lembrete(s) nesta seleção.` : bodyText;

    const slotKeys = items.map((x) => x._slot).filter(Boolean);
    const uniqSlots = Array.from(new Set(slotKeys));

    const titleKey = uniqSlots.length > 1 ? "multi" : uniqSlots.length === 1 ? uniqSlots[0] : "fallback";
    const title = resolveReminderTitle(cfg, titleKey);

    const slotForKey = uniqSlots.length === 1 ? uniqSlots[0] : (first._slot || "");
    const dedupeKey = `${first.id || phone}:${slotForKey || "reminder"}`;

    messages.push({
      token: String(sub.token),
      webpush: {
        notification: {
          title: String(title),
          body: String(finalBody),
          icon: "/icon.png",
          tag: String(dedupeKey),
          renotify: false,
        },
        fcmOptions: { link: clickUrl },
      },
      data: {
        kind: "appointment_reminder",
        source: "cron",
        title: String(title),
        body: String(finalBody),
        phoneCanonical: String(phone),
        reminderTypes: JSON.stringify(uniqSlots),
        appointmentIds: JSON.stringify(items.map((x) => x.id)),
        dedupeKey: String(dedupeKey),
        click_url: clickUrl,
      },
    });

    perPhoneMeta.push({ phone, items, uniqSlots });
  }

  // resposta rápida em dryRun (sem envio)
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      window: { from: nowDate.toISOString(), to: windowEnd.toISOString() },
      candidates: candidates.length,
      phones: phones.length,
      messagesPrepared: messages.length,
      skippedNoToken,
      skippedInactive,
      skippedNoPhone,
      skippedPreparedAlreadySent,
    });
  }

  if (!messages.length) {
    await writeHistory(db, {
      type: "cron_reminders_send_summary",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      window: { from: nowDate.toISOString(), to: windowEnd.toISOString() },
      candidates: candidates.length,
      phones: phones.length,
      messagesPrepared: 0,
      sentCount: 0,
      failCount: 0,
      skippedNoToken,
      skippedInactive,
      skippedNoPhone,
      skippedPreparedAlreadySent,
    });

    return NextResponse.json({
      ok: true,
      sentCount: 0,
      failCount: 0,
      candidates: candidates.length,
      phones: phones.length,
      messagesPrepared: 0,
      skippedNoToken,
      skippedInactive,
      skippedNoPhone,
      skippedPreparedAlreadySent,
    });
  }

  const messaging = admin.messaging();

  let sendResponses = null;
  if (typeof messaging.sendAll === "function") {
    const resp = await messaging.sendAll(messages);
    sendResponses = resp.responses.map((r) => ({ success: r.success, error: r.error || null }));
  } else if (typeof messaging.sendEach === "function") {
    const resp = await messaging.sendEach(messages);
    sendResponses = resp.responses.map((r) => ({ success: r.success, error: r.error || null }));
  } else {
    const resp = await sendWithConcurrency(messaging, messages, 20);
    sendResponses = resp.results.map((r) => ({ success: r.success, error: r.error || null }));
  }

  let sentCount = 0;
  let failCount = 0;

  // Persistir idempotência por sessão+slot quando o envio for sucesso
  const markByAppt = new Map();

  for (let i = 0; i < sendResponses.length; i++) {
    const r = sendResponses[i];
    const meta = perPhoneMeta[i];

    if (r?.success) {
      sentCount += 1;
      for (const it of meta.items) {
        const apptId = String(it.id || "");
        const slot = String(it._slot || "");
        if (!apptId || !slot) continue;
        const setSlots = markByAppt.get(apptId) || new Set();
        setSlots.add(slot);
        markByAppt.set(apptId, setSlots);
      }
    } else {
      failCount += 1;
    }
  }

  const nowTs = admin.firestore.FieldValue.serverTimestamp();

  const apptEntries = Array.from(markByAppt.entries());
  if (apptEntries.length) {
    const BATCH_LIMIT = 450;
    for (let i = 0; i < apptEntries.length; i += BATCH_LIMIT) {
      const slice = apptEntries.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const [apptId, slotsSet] of slice) {
        const remindersMap = {};
        for (const slot of Array.from(slotsSet || [])) {
          remindersMap[slot] = { sentAt: nowTs };
        }
        const ref = db.collection("appointments").doc(apptId);
        batch.set(ref, { reminders: remindersMap }, { merge: true });
      }
      await batch.commit();
    }
  }

  await writeHistory(db, {
    type: "cron_reminders_send_summary",
    createdAt: nowTs,
    window: { from: nowDate.toISOString(), to: windowEnd.toISOString() },
    candidates: candidates.length,
    phones: phones.length,
    messagesPrepared: messages.length,
    sentCount,
    failCount,
    skippedNoToken,
    skippedInactive,
    skippedNoPhone,
    skippedPreparedAlreadySent,
  });

  return NextResponse.json({
    ok: true,
    sentCount,
    failCount,
    candidates: candidates.length,
    phones: phones.length,
    messagesPrepared: messages.length,
    skippedNoToken,
    skippedInactive,
    skippedNoPhone,
    skippedPreparedAlreadySent,
  });
}
