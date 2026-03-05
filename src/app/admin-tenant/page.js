import Link from "next/link";

import BillingBannerServer from "@/components/Billing/BillingBannerServer";
import TenantAdminPanelClient from "@/components/TenantAdmin/TenantAdminPanelClient";
import { requireProfessionalSession } from "@/lib/server/requireProfessional";

export const dynamic = "force-dynamic";

export default async function AdminTenantPage() {
  const next = `/login?next=${encodeURIComponent("/admin-tenant")}`;
  const session = await requireProfessionalSession({ redirectTo: next });

  const isTenantAdmin = ["owner", "admin"].includes(String(session?.role || ""));

  if (!isTenantAdmin) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-extrabold text-slate-400">AgendaPsi</p>
          <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Admin do consultório</h1>
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

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <BillingBannerServer billing={session.billing} canTenantAdmin={true} context="tenantAdmin" />

      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-extrabold text-slate-400">AgendaPsi</p>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Admin do consultório</h1>
              <p className="mt-1 text-sm text-slate-600">
                Configurações do seu consultório (agenda, portal do paciente, códigos e WhatsApp).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/profissional" className="text-sm font-bold text-violet-700 hover:underline">
                Voltar para a agenda
              </Link>
            </div>
          </div>

          <div className="mt-4">
            <TenantAdminPanelClient />
          </div>
        </div>
      </div>
    </div>
  );
}
