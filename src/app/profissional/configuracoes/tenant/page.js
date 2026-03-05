import Link from "next/link";
import { redirect } from "next/navigation";

import { requireProfessionalSession } from "@/lib/server/requireProfessional";

export const dynamic = "force-dynamic";

export default async function ProfissionalTenantSettingsPage() {
  const next = `/login?next=${encodeURIComponent("/profissional/configuracoes/tenant")}`;
  const session = await requireProfessionalSession({ redirectTo: next });

  const isTenantAdmin = ["owner", "admin"].includes(String(session?.role || ""));

  // Compat: rota antiga foi movida para /admin-tenant (Opção A).
  if (isTenantAdmin) {
    redirect("/admin-tenant");
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-extrabold text-slate-400">AgendaPsi</p>
        <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Admin do tenant</h1>
        <p className="mt-2 text-sm text-slate-600">
          Este painel é restrito ao <b>Owner/Admin</b> do tenant.
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
