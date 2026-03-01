import { redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/server/requireAdminSession";

export const dynamic = "force-dynamic";

export default async function AdminAgendaSettingsRedirectPage() {
  const next = `/login?next=${encodeURIComponent("/admin/agendapsi/configuracoes/agenda")}`;
  await requireAdminSession({ redirectTo: next });

  // Configuração da agenda do AgendaPsi fica embutida no /admin (menu "AgendaPsi — Agenda do Profissional").
  redirect("/admin");
}
