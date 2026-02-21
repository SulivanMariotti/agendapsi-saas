"use client";

import React, { createContext, useContext, useMemo } from "react";

const UiThemeContext = createContext(null);

/**
 * UiThemeProvider
 * - Used to theme shared UI components (DesignSystem) per surface/skin.
 * - Patient area sets button variants (e.g. primary background) without affecting Admin.
 */
export function UiThemeProvider({ theme, children }) {
  const value = useMemo(() => theme || null, [theme]);
  return <UiThemeContext.Provider value={value}>{children}</UiThemeContext.Provider>;
}

export function useUiTheme() {
  return useContext(UiThemeContext);
}
