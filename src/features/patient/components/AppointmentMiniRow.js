"use client";

import React from "react";
import { brDateParts } from "../lib/dates";
import {
  prettyServiceLabel,
  getServiceTypeFromAppointment,
  getLocationFromAppointment,
  statusChipFor,
} from "../lib/appointments";

export default function AppointmentMiniRow({ a, isConfirmed }) {
  const dateBase = a?.isoDate || a?.date || "";
  const { day, mon, label } = brDateParts(dateBase);
  const time = a?.time || "";
  const prof = a?.profissional || "Profissional não informado";
  const place = getLocationFromAppointment(a);
  const serviceRaw = getServiceTypeFromAppointment(a);
  const serviceLabel = prettyServiceLabel(serviceRaw);

  const st = statusChipFor(a?.status, isConfirmed);

  return (
    <div className="px-3 py-2.5 rounded-2xl bg-white shadow-sm flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 rounded-2xl bg-slate-50 p-2 text-center shrink-0 shadow-sm">
          <div className="text-base font-black text-slate-800 leading-none">{day}</div>
          <div className="text-[10px] font-bold text-slate-500 mt-1">{mon}</div>
        </div>

        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">
            {label}
            {time ? <span className="text-slate-500"> • {time}</span> : null}
          </div>

          <div className="text-[12px] leading-snug mt-0.5">
            <div className="text-slate-600 whitespace-normal break-words">
              Prof.: <b className="text-slate-700">{prof}</b>
              {serviceLabel ? <span className="text-slate-400"> • </span> : null}
              {serviceLabel ? <span className="text-slate-600">{serviceLabel}</span> : null}
            </div>

            {place ? (
              <div className="text-slate-500 whitespace-normal break-words">
                Local: <span className="text-slate-600">{place}</span>
              </div>
            ) : null}
          </div>

        </div>
      </div>

      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className={`text-[11px] px-2 py-1 rounded-full border font-semibold ${st.cls}`}>{st.text}</span>
        {a?.reminderType ? (
          <span className="text-[11px] px-2 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-600 font-semibold">
            {String(a.reminderType).toUpperCase()}
          </span>
        ) : null}
      </div>
    </div>
  );
}
