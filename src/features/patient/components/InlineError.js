// src/features/patient/components/InlineError.js
"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "../../../components/DesignSystem";

/**
 * Erro inline reutilizável
 * Uso:
 *  <InlineError
 *    title="Não foi possível carregar"
 *    description="Tente novamente."
 *    actionLabel="Recarregar"
 *    onAction={refetch}
 *  />
 */
export default function InlineError({
  title = "Algo deu errado",
  description = "",
  actionLabel = "",
  onAction = null,
  className = "",
}) {
  const hasAction = Boolean(actionLabel) && typeof onAction === "function";

  return (
    <div className={`rounded-2xl bg-amber-50/70 p-4 shadow-sm ${className}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
          <AlertTriangle size={18} className="text-amber-700" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          {description ? <div className="mt-1 text-sm text-slate-700">{description}</div> : null}

          {hasAction ? (
            <div className="mt-3">
              <Button variant="secondary" onClick={onAction}>
                {actionLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
