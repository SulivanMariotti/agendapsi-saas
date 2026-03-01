import { cookies } from "next/headers";
import admin from "@/lib/firebaseAdmin";
import { resolveMembershipByUid, upsertUserTenantIndex } from "@/lib/server/tenantMembership";

const SESSION_COOKIE_NAME = "__session";

export async function getProfessionalApiSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await admin.auth().verifySessionCookie(sessionCookie, false);
    const uid = decoded?.uid;
    if (!uid) return null;

    const membership = await resolveMembershipByUid(uid);
    if (!membership?.tenantId) return null;
    if (membership.isActive === false) return null;

    const role = String(membership.role || "");
    if (!role || !["owner", "professional", "admin"].includes(role)) return null;

    await upsertUserTenantIndex({ uid, ...membership });

    return { uid, tenantId: membership.tenantId, role, email: decoded?.email || null };
  } catch {
    return null;
  }
}
