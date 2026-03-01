import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import admin from "@/lib/firebaseAdmin";
import { resolveMembershipByUid, upsertUserTenantIndex } from "@/lib/server/tenantMembership";

const SESSION_COOKIE_NAME = "__session";

export async function requireProfessionalSession({ redirectTo = "/login" } = {}) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) redirect(redirectTo);

  try {
    const decoded = await admin.auth().verifySessionCookie(sessionCookie, false);
    const uid = decoded?.uid;
    if (!uid) redirect(redirectTo);

    const membership = await resolveMembershipByUid(uid);
    if (!membership?.tenantId) redirect(redirectTo);

    if (membership.isActive === false) redirect(redirectTo);

    const role = String(membership?.role || "");
    if (!role || !["owner", "professional", "admin"].includes(role)) {
      redirect(redirectTo);
    }

    // garante índice atualizado
    await upsertUserTenantIndex({ uid, ...membership });

    return {
      uid,
      email: decoded?.email || null,
      tenantId: membership.tenantId,
      role,
      membership,
    };
  } catch {
    redirect(redirectTo);
  }
}
