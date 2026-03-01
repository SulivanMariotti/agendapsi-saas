import { cookies } from "next/headers";
import admin from "@/lib/firebaseAdmin";
import { resolveMembershipByUid, upsertUserTenantIndex } from "@/lib/server/tenantMembership";

const SESSION_COOKIE_NAME = "__session";

/**
 * getAdminApiSession()
 *
 * Sessão via cookie (__session) para rotas de API do Admin do AgendaPsi.
 * - valida cookie
 * - resolve membership (tenant)
 * - permite apenas roles: owner | admin
 */
export async function getAdminApiSession() {
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
    if (!role || !["owner", "admin"].includes(role)) return null;

    await upsertUserTenantIndex({ uid, ...membership });

    return { uid, tenantId: membership.tenantId, role, email: decoded?.email || null };
  } catch {
    return null;
  }
}
