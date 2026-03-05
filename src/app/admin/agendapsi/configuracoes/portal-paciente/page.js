import { redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/server/requireAdminSession";

export const dynamic = "force-dynamic";

export default async function AdminPatientPortalSettingsRedirectPage() {
  const next = `/login?next=${encodeURIComponent("/admin/agendapsi/configuracoes/portal-paciente")}`;
  await requireAdminSession({ redirectTo: next });

  // Configuração do Portal do Paciente fica embutida no /admin (menu "AgendaPsi — Portal do Paciente").
  redirect("/admin");
}
