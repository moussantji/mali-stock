/**
 * Types et formatage partagés — remplace les données de démonstration.
 * Les vraies données viennent de l'API (src/api/products.ts).
 */
export type StockStatus = "ok" | "low" | "out";

export interface Product {
  id: string;
  initials: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  /** Étiquette lisible « 148 rouleaux » */
  quantityLabel: string;
  /** Niveau de stock de 0 à 100 */
  level: number;
  status: StockStatus;
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  ok: "En stock",
  low: "Stock faible",
  out: "Rupture",
};

export const STATUS_ICON: Record<StockStatus, "checkmark-circle" | "alert-circle" | "close-circle"> = {
  ok: "checkmark-circle",
  low: "alert-circle",
  out: "close-circle",
};

/* Séparateur de milliers manuel : Intl n'est pas garanti dans Hermes. */
function groupThousands(value: number): string {
  const integer = Math.round(Math.abs(value)).toString();
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${groupThousands(value)}`;
}

/** Quantité lisible sans arrondir : « 1,5 kg », « 148 rouleaux ». */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  const rounded = Math.round(Math.abs(value) * 100) / 100;
  const [integer, decimals] = String(rounded).split(".");
  return `${sign}${groupThousands(Number(integer))}${decimals ? `,${decimals}` : ""}`;
}

export function formatFcfa(value: number): string {
  return `${formatNumber(value)} FCFA`;
}

/** Date lisible « 27/10/2026 » sans dépendre d'Intl. */
export function formatDateShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

/** Date + heure lisibles « 27/10/2026 · 14:05 » sans dépendre d'Intl. */
export function formatDateTimeShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${day} · ${time}`;
}

/** Quantité : accepte la virgule française, renvoie un nombre. */
export function parseDecimal(text: string): number {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return NaN;
  return Number(normalized);
}
