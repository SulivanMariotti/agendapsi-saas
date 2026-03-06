"use client";

import React from "react";

/**
 * Standard top header for the Appointment Detail panel (Profissional).
 * Keep styles consistent across Dia / Semana / Mês.
 */
export default function AppointmentDetailHeader({
  title,
  subtitle,
  accentClass = "border-l-slate-300",
  right = null,
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 border-l-4 ${accentClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-extrabold text-slate-900 truncate">{title}</p>
          {subtitle ? (
            <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p>
          ) : null}
        </div>

        {right ? (
          <div className="flex flex-wrap items-center justify-end gap-1">{right}</div>
        ) : null}
      </div>
    </div>
  );
}
