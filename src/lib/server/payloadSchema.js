// src/lib/server/payloadSchema.js
// Pequeno helper de validação de payload (schema-lite) para rotas API.
// Objetivo: reduzir superfície de ataque (payload inesperado), padronizar erros 400,
// e evitar bugs silenciosos que viram inconsistências clínicas (ex.: constância).

function isObjectLike(x) {
  return x !== null && typeof x === "object";
}

export function isPlainObject(x) {
  if (!isObjectLike(x)) return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

export function asPlainObject(input) {
  if (!isPlainObject(input)) {
    return { ok: false, error: "Payload inválido (esperado objeto JSON)." };
  }
  return { ok: true, value: input };
}

export function unknownKeys(obj, allowedKeys = []) {
  const allow = new Set((allowedKeys || []).map(String));
  return Object.keys(obj || {}).filter((k) => !allow.has(k));
}

export function pickAllowed(obj, allowedKeys = []) {
  const allow = new Set((allowedKeys || []).map(String));
  const out = {};
  for (const k of Object.keys(obj || {})) {
    if (allow.has(k)) out[k] = obj[k];
  }
  return out;
}

export function getString(obj, key, opts = {}) {
  const {
    required = false,
    trim = true,
    toLower = false,
    min = 0,
    max = 10_000,
    maxBytes = null,
    pattern = null,
    allowed = null,
    defaultValue = "",
    label = null,
  } = opts;

  const raw = obj ? obj[key] : undefined;
  const name = label || key;

  if (raw === undefined || raw === null || raw === "") {
    if (required) return { ok: false, error: `${name} é obrigatório.` };
    return { ok: true, value: defaultValue };
  }

  let v = String(raw);
  if (trim) v = v.trim();
  if (toLower) v = v.toLowerCase();

  if (v.length < min) return { ok: false, error: `${name} muito curto.` };
  if (v.length > max) return { ok: false, error: `${name} muito longo.` };

  if (maxBytes != null) {
    const bytes = Buffer.byteLength(v, "utf8");
    if (bytes > maxBytes) {
      return { ok: false, error: `${name} excede o limite de tamanho.` };
    }
  }

  if (pattern && !pattern.test(v)) {
    return { ok: false, error: `${name} em formato inválido.` };
  }

  if (Array.isArray(allowed) && allowed.length) {
    if (!allowed.includes(v)) {
      return { ok: false, error: `${name} inválido.` };
    }
  }

  return { ok: true, value: v };
}

export function getBoolean(obj, key, opts = {}) {
  const { required = false, defaultValue = false, label = null } = opts;
  const raw = obj ? obj[key] : undefined;
  const name = label || key;

  if (raw === undefined || raw === null || raw === "") {
    if (required) return { ok: false, error: `${name} é obrigatório.` };
    return { ok: true, value: Boolean(defaultValue) };
  }

  if (typeof raw === "boolean") return { ok: true, value: raw };

  const s = String(raw).trim().toLowerCase();
  if (["true", "1", "yes", "sim"].includes(s)) return { ok: true, value: true };
  if (["false", "0", "no", "nao", "não"].includes(s)) return { ok: true, value: false };

  return { ok: false, error: `${name} inválido.` };
}

export function getNumber(obj, key, opts = {}) {
  const {
    required = false,
    defaultValue = 0,
    min = null,
    max = null,
    integer = false,
    label = null,
  } = opts;

  const raw = obj ? obj[key] : undefined;
  const name = label || key;

  if (raw === undefined || raw === null || raw === "") {
    if (required) return { ok: false, error: `${name} é obrigatório.` };
    return { ok: true, value: Number(defaultValue) };
  }

  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return { ok: false, error: `${name} inválido.` };
  if (integer && !Number.isInteger(n)) return { ok: false, error: `${name} deve ser inteiro.` };
  if (min != null && n < min) return { ok: false, error: `${name} abaixo do mínimo.` };
  if (max != null && n > max) return { ok: false, error: `${name} acima do máximo.` };

  return { ok: true, value: n };
}

export function getEnum(obj, key, allowed = [], opts = {}) {
  const { required = false, defaultValue = allowed?.[0] ?? "", label = null } = opts;
  const res = getString(obj, key, {
    required,
    trim: true,
    toLower: false,
    min: 0,
    max: 200,
    allowed,
    defaultValue,
    label,
  });
  return res;
}

export function getObject(obj, key, opts = {}) {
  const {
    required = false,
    defaultValue = null,
    allowedKeys = null,
    maxKeys = 50,
    label = null,
  } = opts;

  const raw = obj ? obj[key] : undefined;
  const name = label || key;

  if (raw === undefined || raw === null) {
    if (required) return { ok: false, error: `${name} é obrigatório.` };
    return { ok: true, value: defaultValue };
  }

  if (!isPlainObject(raw)) return { ok: false, error: `${name} inválido.` };

  const keys = Object.keys(raw);
  if (keys.length > maxKeys) return { ok: false, error: `${name} tem muitas chaves.` };

  let out = raw;
  if (Array.isArray(allowedKeys)) {
    out = pickAllowed(raw, allowedKeys);
  }

  return { ok: true, value: out };
}

export async function readJsonBody(req, opts = {}) {
  const {
    maxBytes = 80_000,
    defaultValue = {},
  } = opts;

  let text = "";
  try {
    text = await req.text();
  } catch (_) {
    return { ok: true, value: defaultValue };
  }

  if (!text) return { ok: true, value: defaultValue };

  try {
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > maxBytes) {
      return { ok: false, error: "Payload muito grande." };
    }
  } catch (_) {
    // ignore
  }

  try {
    const parsed = JSON.parse(text);
    return { ok: true, value: parsed };
  } catch (_) {
    return { ok: false, error: "JSON inválido." };
  }
}

export function enforceAllowedKeys(obj, allowedKeys = [], opts = {}) {
  const { label = null, showKeys = true } = opts;
  if (!isPlainObject(obj)) {
    return { ok: false, error: "Payload inválido (esperado objeto JSON)." };
  }
  const unk = unknownKeys(obj, allowedKeys);
  if (unk.length) {
    const name = label ? `${label}: ` : "";
    const detail = showKeys ? ` Chaves não permitidas: ${unk.join(", ")}.` : "";
    return { ok: false, error: `${name}Payload inválido.${detail}` };
  }
  return { ok: true };
}


export function getStringArray(obj, key, opts = {}) {
  const {
    required = false,
    defaultValue = [],
    minItems = 0,
    maxItems = 2000,
    itemMin = 0,
    itemMax = 5000,
    itemMaxBytes = null,
    trim = true,
    toLower = false,
    label = null,
  } = opts;

  const raw = obj ? obj[key] : undefined;
  const name = label || key;

  if (raw === undefined || raw === null || raw === "") {
    if (required) return { ok: false, error: `${name} é obrigatório.` };
    return { ok: true, value: Array.isArray(defaultValue) ? defaultValue : [] };
  }

  if (!Array.isArray(raw)) return { ok: false, error: `${name} inválido.` };
  if (raw.length < minItems) return { ok: false, error: `${name} tem poucos itens.` };
  if (raw.length > maxItems) return { ok: false, error: `${name} tem muitos itens.` };

  const out = [];
  for (const it of raw) {
    let v = String(it ?? "");
    if (trim) v = v.trim();
    if (toLower) v = v.toLowerCase();

    if (v.length < itemMin) continue;
    if (v.length > itemMax) return { ok: false, error: `${name} contém item muito longo.` };

    if (itemMaxBytes != null) {
      const bytes = Buffer.byteLength(v, "utf8");
      if (bytes > itemMaxBytes) return { ok: false, error: `${name} contém item grande demais.` };
    }

    out.push(v);
  }

  return { ok: true, value: out };
}

export async function readJsonObjectBody(req, opts = {}) {
  const {
    maxBytes = 80_000,
    defaultValue = {},
    allowedKeys = null,
    label = null,
    showKeys = true,
  } = opts;

  const bodyRes = await readJsonBody(req, { maxBytes, defaultValue });
  if (!bodyRes.ok) return bodyRes;

  const plain = asPlainObject(bodyRes.value);
  if (!plain.ok) return plain;

  if (Array.isArray(allowedKeys)) {
    const keysOk = enforceAllowedKeys(plain.value, allowedKeys, { label, showKeys });
    if (!keysOk.ok) return keysOk;
  }

  return { ok: true, value: plain.value };
}
