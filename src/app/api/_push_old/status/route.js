import { NextResponse } from "next/server";

// Legacy endpoint (deprecated).
// Security: kept disabled to reduce attack surface.
// Migration: use /api/patient/push/status.

export const runtime = "nodejs";

function legacyDisabled() {
  // In production, act like it doesn't exist.
  const status = process.env.NODE_ENV === "production" ? 404 : 410;
  const body =
    status === 404
      ? { ok: false, error: "Not found" }
      : {
          ok: false,
          error: "Legacy endpoint disabled. Use /api/patient/push/status.",
        };
  return NextResponse.json(body, { status });
}

export async function GET() {
  return legacyDisabled();
}
