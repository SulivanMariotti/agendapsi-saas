import Link from "next/link";
import { redirect } from "next/navigation";

import { requireProfessionalSession } from "@/lib/server/requireProfessional";

export const dynamic = "force-dynamic";

export default async function ProfissionalAgendaSettingsPage() {
  const next = `/login?next=${encodeURIComponent("/profissional/configuracoes/agenda")}`;
  const session = await requireProfessionalSession({ redirectTo: next });

  // Decisão de produto: configurações do tenant ficam no Admin do tenant.
  if (["owner", "admin"].includes(String(session?.role || ""))) {
    redirect("/admin-tenant");
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-extrabold text-slate-400">AgendaPsi</p>
        <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Configuração da agenda</h1>
        <p className="mt-2 text-sm text-slate-600">
          As configurações de grade/horários/buffer/almoço são definidas pelo Admin do tenant.
        </p>
        <p className="mt-4 text-sm">
          <Link className="font-bold text-violet-700 hover:underline" href="/profissional">
            Voltar para a agenda
          </Link>
        </p>
      </div>
    </div>
  );
}
