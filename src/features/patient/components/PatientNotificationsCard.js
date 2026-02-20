"use client";

import React from "react";
import NotificationStatusCard from "./NotificationStatusCard";

/**
 * PatientNotificationsCard
 * Wrapper compacto (mobile-friendly) para o status de notificações,
 * sem checklist e sem título redundante.
 */
export default function PatientNotificationsCard({
  app,
  user,
  notifHasToken,
  setNotifHasToken,
  showToast,
  className = "",
}) {
  return (
    <div
      className={[
        "bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden",
        className,
      ].join(" ")}
    >
      <div className="p-3 sm:p-4">
        <NotificationStatusCard
          app={app}
          user={user}
          notifHasToken={notifHasToken}
          setNotifHasToken={setNotifHasToken}
          showToast={showToast}
        />
      </div>
    </div>
  );
}
