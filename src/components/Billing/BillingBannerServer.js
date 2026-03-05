// src/components/Billing/BillingBannerServer.js
import Link from "next/link";
import { billingBannerCopy } from "@/lib/shared/billingText";

export default function BillingBannerServer({ billing, canTenantAdmin = false, context = "professional" }) {
  const copy = billingBannerCopy(billing, { canTenantAdmin, context });
  if (!copy) return null;

  const showDebug = process.env.NODE_ENV !== "production";
  const raw = String(billing?.statusRaw || "");
  const eff = String(billing?.statusEffective || "");

  return (
    <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="max-w-5xl mx-auto flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold">{copy.title}</div>
          <div className="text-sm font-semibold">{copy.msg}</div>

          {canTenantAdmin ? (
            <div className="mt-1 text-xs">
              Ajustes de configuração ficam em{" "}
              <Link className="font-bold underline" href="/admin-tenant">
                Admin do consultório
              </Link>
              .
            </div>
          ) : null}

          {showDebug && raw && eff ? (
            <div className="mt-1 text-[11px] opacity-70">status: {raw} → {eff}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
