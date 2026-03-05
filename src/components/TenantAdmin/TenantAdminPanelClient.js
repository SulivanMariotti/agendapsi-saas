"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Toast } from "@/components/DesignSystem";
import TenantPatientPortalTab from "@/components/TenantAdmin/TenantPatientPortalTab";
import TenantWhatsappTemplatesTab from "@/components/TenantAdmin/TenantWhatsappTemplatesTab";
import TenantScheduleTab from "@/components/TenantAdmin/TenantScheduleTab";
import TenantOccurrenceCodesTab from "@/components/TenantAdmin/TenantOccurrenceCodesTab";

const VALID_TABS = ["schedule", "codes", "patientPortal", "whatsapp"];

export default function TenantAdminPanelClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState(() => {
    const t = String(searchParams?.get("tab") || "schedule").toLowerCase();
    return VALID_TABS.includes(t) ? t : "schedule";
  });

  const [toast, setToast] = useState({ msg: "", type: "success" });

  useEffect(() => {
    const t = String(searchParams?.get("tab") || "schedule").toLowerCase();
    if (t && t !== tab && VALID_TABS.includes(t)) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const showToast = (msg, type = "success") => setToast({ msg, type });

  function changeTab(nextTab) {
    const t = String(nextTab || "").trim().toLowerCase();
    if (!VALID_TABS.includes(t)) return;
    setTab(t);
    const sp = new URLSearchParams(Array.from(searchParams?.entries?.() || []));
    sp.set("tab", t);
    router.replace(`/admin-tenant?${sp.toString()}`);
  }

  const tabs = useMemo(
    () => [
      { id: "schedule", label: "Agenda do Profissional" },
      { id: "codes", label: "Códigos de Ocorrência" },
      { id: "patientPortal", label: "Portal do Paciente" },
      { id: "whatsapp", label: "Templates WhatsApp" },
    ],
    []
  );

  return (
    <>
      {toast?.msg ? (
        <Toast message={toast.msg} type={toast.type} onClose={() => setToast({ msg: "", type: "success" })} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Button key={t.id} variant={tab === t.id ? "primary" : "secondary"} onClick={() => changeTab(t.id)}>
            {t.label}
          </Button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "schedule" ? <TenantScheduleTab showToast={showToast} /> : null}
        {tab === "codes" ? <TenantOccurrenceCodesTab showToast={showToast} /> : null}
        {tab === "patientPortal" ? <TenantPatientPortalTab showToast={showToast} /> : null}
        {tab === "whatsapp" ? <TenantWhatsappTemplatesTab showToast={showToast} /> : null}
      </div>
    </>
  );
}
