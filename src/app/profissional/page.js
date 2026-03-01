import ProfessionalDayViewClient from "@/components/Professional/ProfessionalDayViewClient";
import ProfessionalMonthViewClient from "@/components/Professional/ProfessionalMonthViewClient";
import ProfessionalWeekViewClient from "@/components/Professional/ProfessionalWeekViewClient";
import { getProfessionalDayData, getProfessionalMonthData, getProfessionalWeekData, resolveIsoDate } from "@/lib/server/agendapsiData";
import { requireProfessionalSession } from "@/lib/server/requireProfessional";

export const dynamic = "force-dynamic";

export default async function ProfissionalPage({ searchParams }) {
  const next = `/login?next=${encodeURIComponent("/profissional")}`;
  const session = await requireProfessionalSession({ redirectTo: next });
  const tenantId = session.tenantId;

  // Some Next.js versions provide searchParams as a Promise.
  const sp = await Promise.resolve(searchParams);
  const isoDate = resolveIsoDate(sp);
  const view = String((Array.isArray(sp?.view) ? sp.view[0] : sp?.view) || "day").toLowerCase();

  if (view === "month") {
    const data = await getProfessionalMonthData({ tenantId, isoDate });
    return (
      <div className="min-h-[100dvh] bg-slate-50">
        <ProfessionalMonthViewClient initialData={data} />
      </div>
    );
  }

  if (view === "week") {
    const data = await getProfessionalWeekData({ tenantId, isoDate });
    return (
      <div className="min-h-[100dvh] bg-slate-50">
        <ProfessionalWeekViewClient initialData={data} />
      </div>
    );
  }

  const data = await getProfessionalDayData({ tenantId, isoDate });

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <ProfessionalDayViewClient initialData={data} />
    </div>
  );
}
