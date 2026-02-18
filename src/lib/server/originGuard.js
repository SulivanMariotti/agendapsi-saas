import { NextResponse } from "next/server";

/**
 * originGuard (CSRF/CORS hardening)
 *
 * Objetivo:
 * - Para rotas "browser-facing" (login/admin/paciente), bloquear chamadas cross-site
 *   e reduzir risco de CSRF.
 * - Sem quebrar chamadas server-to-server quando já existe autenticação forte
 *   (ex.: Authorization Bearer).
 *
 * Regras:
 * - Em dev: permissivo (não bloquear), para não atrapalhar hot reload / tooling.
 * - Em produção: para métodos não-idempotentes (POST/PUT/PATCH/DELETE),
 *   bloqueia se:
 *   - sec-fetch-site === 'cross-site'  OU
 *   - Origin/Referer não bate com o host atual.
 */

function isUnsafeMethod(req) {
  const m = String(req?.method || "").toUpperCase();
  return ["POST", "PUT", "PATCH", "DELETE"].includes(m);
}

function normalizeUrlOrigin(input) {
  if (!input) return null;
  try {
    const u = new URL(String(input));
    const proto = u.protocol.toLowerCase();
    const host = u.hostname.toLowerCase();
    let port = u.port || "";

    // Normaliza portas padrão
    if ((proto === "https:" && port === "443") || (proto === "http:" && port === "80")) {
      port = "";
    }

    const origin = `${proto}//${host}${port ? `:${port}` : ""}`;
    return { proto, host, port: port || null, origin };
  } catch (_) {
    return null;
  }
}

function getExpectedOrigin(req) {
  const protoRaw = req.headers.get("x-forwarded-proto") || req.headers.get("x-forwarded-protocol") || "https";
  const proto = String(protoRaw).includes(":") ? String(protoRaw) : `${protoRaw}:`;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host) return null;
  return normalizeUrlOrigin(`${proto}//${host}`);
}

function getRequestOrigin(req) {
  const origin = req.headers.get("origin");
  const ref = req.headers.get("referer");

  const o = normalizeUrlOrigin(origin);
  if (o) return o;

  const r = normalizeUrlOrigin(ref);
  if (r) return r;

  return null;
}

function hasAuthHeader(req) {
  const a = req.headers.get("authorization") || "";
  return /^Bearer\s+.+/i.test(a.trim());
}

/**
 * enforceSameOrigin(req, opts)
 *
 * opts:
 * - allowNoOrigin: permite ausência de Origin/Referer (produção). Default: false.
 * - allowNoOriginWithAuth: permite ausência de Origin/Referer se houver Authorization Bearer. Default: true.
 * - allowSameSite: permite sec-fetch-site 'same-site'. Default: true.
 * - failureResponse: NextResponse ou função que retorna NextResponse.
 * - message: mensagem padrão.
 * - status: status padrão.
 */
export function enforceSameOrigin(req, opts = {}) {
  const {
    allowNoOrigin = false,
    allowNoOriginWithAuth = true,
    allowSameSite = true,
    failureResponse = null,
    message = "Acesso bloqueado (origem inválida).",
    status = 403,
  } = opts;

  // Dev: não bloquear para não atrapalhar DX.
  if (process.env.NODE_ENV !== "production") return { ok: true };

  // Só faz sentido para métodos não-idempotentes.
  if (!isUnsafeMethod(req)) return { ok: true };

  // Heurística moderna de browsers (CSRF defense)
  const sfs = String(req.headers.get("sec-fetch-site") || "").toLowerCase().trim();
  if (sfs === "cross-site") {
    return {
      ok: false,
      res: typeof failureResponse === "function"
        ? failureResponse()
        : failureResponse || NextResponse.json({ ok: false, error: message }, { status }),
    };
  }
  if (sfs === "same-origin") return { ok: true };
  if (sfs === "same-site" && allowSameSite) return { ok: true };

  const expected = getExpectedOrigin(req);
  if (!expected) return { ok: true };

  const reqOrigin = getRequestOrigin(req);
  if (!reqOrigin) {
    // Sem Origin/Referer: permite apenas se explicitamente liberado,
    // ou quando há Authorization Bearer (server-to-server / non-browser).
    if (allowNoOrigin) return { ok: true };
    if (allowNoOriginWithAuth && hasAuthHeader(req)) return { ok: true };

    return {
      ok: false,
      res: typeof failureResponse === "function"
        ? failureResponse()
        : failureResponse || NextResponse.json({ ok: false, error: message }, { status }),
    };
  }

  if (reqOrigin.origin !== expected.origin) {
    return {
      ok: false,
      res: typeof failureResponse === "function"
        ? failureResponse()
        : failureResponse || NextResponse.json({ ok: false, error: message }, { status }),
    };
  }

  return { ok: true };
}
