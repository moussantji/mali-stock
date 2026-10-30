/**
 * MALI STOCK — Palette 04 · BOGOLAN TRICOLORE PREMIUM
 * Vert, jaune et rouge du Mali en version profonde et luxueuse.
 * Règle 60 · 30 · 10 : ivoire + vert = structure, or = lumière, rouge = signature.
 * Noms identiques aux styles Figma livrés dans le pack Bogolan Tricolore.
 */

export const colors = {
  // — Couleurs signature (palette validée)
  primary: "#0A6B45",        // Vert Mali Profond — boutons, actions
  primaryDeep: "#063D29",    // Vert Forêt Bogolan — en-têtes, fonds sombres
  primaryLight: "#119267",   // Dégradé des boutons primaires
  gold: "#DFA921",           // Jaune Or du Mali — montants, accents lumière
  goldLight: "#F0C75E",      // Dégradés or
  goldDark: "#9C7408",       // Or lisible en texte sur fond clair
  red: "#B23A2E",            // Rouge Latérite — signature (10 % maximum)
  redLight: "#D96A57",       // Dégradé rouge signature
  background: "#F7F0DD",     // Ivoire Bogolan — fond d'application
  accentSoft: "#E9D8A6",     // Ocre Tissé — surfaces douces, bandes

  // — Neutres d'interface
  surface: "#FFFFFF",
  surfaceWarm: "#FFFDF5",
  text: "#1B201A",
  textMuted: "#7C7663",
  border: "rgba(60, 55, 30, 0.11)",
  onPrimary: "#FFFFFF",
  onGold: "#231903",

  // — États de stock (ne jamais utiliser le Rouge Latérite pour les erreurs :
  //    il est réservé à la signature tricolore)
  stockOk: "#2EAE6E",
  stockOkBg: "rgba(46, 174, 110, 0.14)",
  stockLow: "#D9930D",
  stockLowBg: "rgba(240, 165, 0, 0.16)",
  stockOut: "#E5484D",
  stockOutBg: "rgba(229, 72, 77, 0.13)",
} as const;

export type ColorKey = keyof typeof colors;

/** Panneau de la palette — mêmes noms et codes que les styles Figma "BGT/..." */
export const palette = [
  { figmaStyle: "BGT/Primary/Vert Mali Profond", token: "color.primary", name: "Vert Mali Profond", hex: "#0A6B45", role: "Primaire · Boutons" },
  { figmaStyle: "BGT/Gold/Jaune Or du Mali", token: "color.gold", name: "Jaune Or du Mali", hex: "#DFA921", role: "Accent lumière · Dégradés" },
  { figmaStyle: "BGT/Red/Rouge Latérite", token: "color.red", name: "Rouge Latérite", hex: "#B23A2E", role: "Signature · Accents forts" },
  { figmaStyle: "BGT/Primary/Vert Forêt Bogolan", token: "color.primaryDeep", name: "Vert Forêt Bogolan", hex: "#063D29", role: "En-têtes · Fond sombre" },
  { figmaStyle: "BGT/Background/Ivoire Bogolan", token: "color.background", name: "Ivoire Bogolan", hex: "#F7F0DD", role: "Fond d'application" },
  { figmaStyle: "BGT/Surface/Ocre Tissé", token: "color.accentSoft", name: "Ocre Tissé", hex: "#E9D8A6", role: "Surfaces douces · Bandes" },
] as const;

/** Bandeau signature vert-or-rouge (bas des hero banners) */
export const tricoloreBand = [colors.primary, colors.gold, colors.red] as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

export const radius = { sm: 10, md: 14, lg: 16, xl: 22, pill: 999 } as const;

export const typography = {
  // Chargez "Plus Jakarta Sans" (UI) et "Fraunces" (montants) avec expo-font
  // pour reproduire exactement la présentation ; sinon la police système est utilisée.
  fontFamily: undefined as string | undefined,
  display: { fontSize: 28, fontWeight: "700" as const, letterSpacing: 0.2 },
  title: { fontSize: 17, fontWeight: "800" as const },
  subtitle: { fontSize: 13, fontWeight: "700" as const },
  body: { fontSize: 13, fontWeight: "600" as const },
  caption: { fontSize: 11, fontWeight: "600" as const },
  overline: { fontSize: 10, fontWeight: "800" as const, letterSpacing: 1.8 },
} as const;

export const shadows = {
  card: {
    shadowColor: "#3C331E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  primaryButton: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

export const theme = { colors, palette, tricoloreBand, spacing, radius, typography, shadows };
export default theme;
