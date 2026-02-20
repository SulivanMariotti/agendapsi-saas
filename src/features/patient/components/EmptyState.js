// src/features/patient/components/EmptyState.js
"use client";

import React from "react";
import { Inbox } from "lucide-react";

/**
 * Estado vazio reutilizável
 * Uso: <EmptyState title="Sem atendimentos" description="Assim que sua agenda estiver disponível, ela aparecerá aqui." />
 */
export default function EmptyState({
  title = "Nada por aqui ainda",
  description = "",
  Icon = Inbox,
  className = "",
}) {
  return (
    <div className={`rounded-2xl bg-slate-50/60 p-4 shadow-sm ${className}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
          <Icon size={18} className="text-slate-600" />
        </div>

        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          {description ? <div className="mt-1 text-sm text-slate-600">{description}</div> : null}
        </div>
      </div>
    </div>
  );
}
