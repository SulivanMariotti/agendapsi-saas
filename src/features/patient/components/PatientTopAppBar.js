"use client";

import React, { useMemo, useState } from "react";
import { Menu } from "lucide-react";
import { PT } from "../lib/uiTokens";

export default function PatientTopAppBar({
  appName = "Lembrete Psi",
  logoSrc,
  onOpenMenu,
}) {
  const [imgOk, setImgOk] = useState(true);

  const finalLogoSrc = useMemo(() => {
    // Prefer the provided logo, otherwise fallback to the existing brand mark.
    return String(logoSrc || "/brand/permitta-mark-128.png");
  }, [logoSrc]);

  return (
    <div className="sm:hidden fixed top-0 left-0 right-0 z-30">
      <div
        className={`${PT.appBarBg} backdrop-blur-md border-b ${PT.appBarBorder} shadow-sm`}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-5xl mx-auto px-[var(--pad)] h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {imgOk ? (
              <img
                src={finalLogoSrc}
                alt={appName}
                className="w-6 h-6 rounded-md"
                onError={() => setImgOk(false)}
              />
            ) : (
              <div className="w-6 h-6 rounded-md bg-white/15 flex items-center justify-center text-[10px] font-extrabold tracking-wide">
                LP
              </div>
            )}

            <div className="text-sm font-extrabold text-white tracking-wide truncate">
              {appName}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Abrir menu"
            className={`w-11 h-11 inline-flex items-center justify-center rounded-xl ${PT.appBarIcon} ${PT.appBarIconHover} active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40`}
          >
            <Menu size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
