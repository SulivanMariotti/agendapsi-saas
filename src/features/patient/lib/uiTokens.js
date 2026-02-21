// Patient UI tokens (scoped usage inside Patient panel only)
// Goal: reduce color fragmentation and "everything looks clickable".
export const PT = {
  // Neutrals
  textPrimary: "text-slate-900",
  textSecondary: "text-slate-600",
  textMuted: "text-slate-500",
  textSubtle: "text-slate-400",

  // Surfaces
  surface: "bg-white",
  surfaceSoft: "bg-slate-50",
  card: "bg-white shadow-sm",
  cardSoft: "bg-slate-50 shadow-sm",

  // Accent (brand / clinical)
  accentBg: "bg-violet-950/95 text-white",
  // Subtle tint that matches the new primary (and is NOT remapped by skin-patient).
  accentSoft: "bg-violet-950/5",
  accentText: "text-violet-950",
  accentIcon: "text-violet-950",
  // Focus ring (avoid skin remap): keep /60 opacity variant.
  focusRing: "focus:ring-2 focus:ring-violet-200/60",
  focusRingVisible: "focus-visible:ring-2 focus-visible:ring-violet-200/60",

  // App bar (mobile top header)
  // Darker tone of the palette to create a clear "app" framing without adding CTA.
  appBarBg: "bg-violet-950/95 text-white",
  appBarBorder: "border-white/10",
  appBarIcon: "text-white/90",
  appBarIconHover: "hover:text-white hover:bg-white/10",

  // States
  ok: "bg-emerald-50 text-emerald-800",
  warn: "bg-amber-50 text-amber-900",
  neutralChip: "bg-slate-50 text-slate-700",

  // Borders (use only when necessary: inputs + separators)
  borderSubtle: "border-slate-200/60",
};
