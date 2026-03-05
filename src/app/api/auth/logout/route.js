import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { enforceSameOrigin } from "@/lib/server/originGuard";
import { rateLimit } from "@/lib/server/rateLimit";

const SESSION_COOKIE_NAME = "__session";

export async function POST(req) {
  const originCheck = enforceSameOrigin(req, { allowNoOrigin: false, allowNoOriginWithAuth: false });
  if (!originCheck.ok) return originCheck.res;

  const rl = await rateLimit(req, { bucket: "auth:logout", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.res;

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
