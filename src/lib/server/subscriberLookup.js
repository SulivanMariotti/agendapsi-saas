// Server-only helpers to lookup subscribers by phone with legacy compatibility.
// Canonical phone for Lembrete Psi:
// - DDD + número (10/11 dígitos)
// - sem prefixo 55

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

/**
 * Canonicalize a phone to this project's standard (DDD+number, no 55)
 */
export function toPhoneCanonical(raw) {
  const d0 = onlyDigits(raw);
  if (!d0) return "";
  // strip leading 55 for BR numbers
  if (d0.startsWith("55") && (d0.length === 12 || d0.length === 13)) return d0.slice(2);
  // if longer than 11 digits, keep last 11 (best effort)
  if (d0.length > 11) return d0.slice(-11);
  return d0;
}

export function toPhoneE164Like(phoneCanonical) {
  const p = toPhoneCanonical(phoneCanonical);
  if (!p) return "";
  if (p.startsWith("55") && (p.length === 12 || p.length === 13)) return p;
  if (p.length === 10 || p.length === 11) return `55${p}`;
  return p;
}

export function extractSubscriberToken(data) {
  if (!data) return null;
  const direct = data.pushToken || data.fcmToken || data.token;
  if (direct) return String(direct);

  const arr1 = Array.isArray(data.pushTokens) ? data.pushTokens : null;
  if (arr1 && arr1.length) return String(arr1[0]);

  const arr2 = Array.isArray(data.tokens) ? data.tokens : null;
  if (arr2 && arr2.length) return String(arr2[0]);

  if (data.push) {
    const nested = data.push.pushToken || data.push.fcmToken || data.push.token;
    if (nested) return String(nested);
  }

  return null;
}

export function isSubscriberInactive(data) {
  if (!data) return false;
  const st = String(data.status || "").toLowerCase().trim();
  if (["inactive", "disabled", "archived", "deleted"].includes(st)) return true;
  if (data.deletedAt || data.disabledAt) return true;
  if (data.isActive === false || data.disabled === true) return true;
  return false;
}

/**
 * Fetch subscriber meta for each canonical phone.
 * - Looks up both canonical docId and legacy docId with 55 prefix.
 * - Token is only accepted from an ACTIVE subscriber doc.
 */
export async function fetchSubscriberMetaByPhone(db, phonesCanonical) {
  const phones = Array.isArray(phonesCanonical) ? phonesCanonical.map(toPhoneCanonical).filter(Boolean) : [];
  const out = {};
  if (!phones.length) return out;

  // chunk to keep getAll arguments reasonable
  const chunks = [];
  for (let i = 0; i < phones.length; i += 400) chunks.push(phones.slice(i, i + 400));

  for (const chunk of chunks) {
    const refs = [];
    const index = new Map(); // canon -> [ids]

    for (const p of chunk) {
      const canon = toPhoneCanonical(p);
      if (!canon) continue;
      const e164 = toPhoneE164Like(canon);

      refs.push(db.collection("subscribers").doc(canon));
      index.set(canon, (index.get(canon) || []).concat(canon));

      if (e164 && e164 !== canon) {
        refs.push(db.collection("subscribers").doc(e164));
        index.set(canon, (index.get(canon) || []).concat(e164));
      }
    }

    const snaps = refs.length ? await db.getAll(...refs) : [];

    const byId = new Map();
    for (const snap of snaps) {
      byId.set(snap.id, snap.exists ? snap.data() : null);
    }

    for (const [canon, ids] of index.entries()) {
      const candidates = (ids || [])
        .map((id) => ({ id, data: byId.get(id) }))
        .filter((x) => x.data);

      const active = candidates.filter((c) => !isSubscriberInactive(c.data));
      const tokenFromActive = active.find((c) => extractSubscriberToken(c.data));
      const token = tokenFromActive ? extractSubscriberToken(tokenFromActive.data) : null;

      const anyInactive = candidates.some((c) => isSubscriberInactive(c.data));
      const inactive = active.length === 0 && anyInactive;

      out[canon] = {
        token,
        inactive,
        sourceId: tokenFromActive ? tokenFromActive.id : null,
        exists: candidates.length > 0,
      };
    }
  }

  return out;
}
