/**
 * Client API « Produits & stock » — tout passe par l'API authentifiée,
 * jamais MySQL directement. Types alignés sur server/src/routes/products.js.
 */
import { formatNumber, type Product, type StockStatus } from "../data";
import { API_URL, apiRequest } from "../auth/api";

/* ── Types renvoyés par l'API ─────────────────────────────── */

export interface ApiProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  minQuantity: number;
  barcode: string | null;
  qrToken: string;
  initials: string;
  level: number;
  status: StockStatus;
  createdAt: string;
}

export interface StockSummary {
  totalProducts: number;
  totalUnits: number;
  stockValue: number;
  alerts: number;
  outCount: number;
  lowCount: number;
  entriesToday: number;
  exitsToday: number;
  weekly: Array<{ day: string; value: number }>;
  trend: string;
}

export type MovementType = "entry" | "exit" | "adjustment";

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  type: MovementType;
  quantity: number;
  unitPrice: number | null;
  note: string | null;
  createdAt: string;
}

export interface ProductQr {
  qrDataUrl: string;
  qrToken: string;
}

export interface ProductInput {
  name: string;
  sku?: string;
  description?: string | null;
  category?: string | null;
  unit: string;
  purchasePrice?: number;
  salePrice?: number;
  quantity?: number;
  minQuantity?: number;
  barcode?: string | null;
}

export interface MovementInput {
  type: MovementType;
  quantity: number;
  unitPrice?: number | null;
  note?: string | null;
}

/* ── Conversion API → UI ─────────────────────────────────── */

export function toUiProduct(api: ApiProduct): Product {
  return {
    id: api.id,
    initials: api.initials,
    name: api.name,
    sku: api.sku,
    quantity: api.quantity,
    unit: api.unit,
    quantityLabel: `${formatNumber(api.quantity)} ${api.unit}`,
    level: api.level,
    status: api.status,
  };
}

/* ── Appels ──────────────────────────────────────────────── */

export const productsApi = {
  list(token: string) {
    return apiRequest<{ products: ApiProduct[] }>("/api/products", { token });
  },

  summary(token: string) {
    return apiRequest<StockSummary>("/api/products/summary", { token });
  },

  create(token: string, input: ProductInput) {
    return apiRequest<{ product: ApiProduct }>("/api/products", {
      method: "POST",
      body: input,
      token,
    });
  },

  update(token: string, id: string, input: Partial<ProductInput>) {
    return apiRequest<{ product: ApiProduct }>(`/api/products/${id}`, {
      method: "PATCH",
      body: input,
      token,
    });
  },

  remove(token: string, id: string) {
    return apiRequest<void>(`/api/products/${id}`, { method: "DELETE", token });
  },

  move(token: string, id: string, input: MovementInput) {
    return apiRequest<{ product: ApiProduct; movement: { type: MovementType; quantity: number } }>(
      `/api/products/${id}/movements`,
      { method: "POST", body: input, token }
    );
  },

  movements(token: string) {
    return apiRequest<{ movements: StockMovement[] }>("/api/products/movements", { token });
  },

  qr(token: string, id: string) {
    return apiRequest<ProductQr>(`/api/products/${id}/qr`, { token });
  },

  regenerateQr(token: string, id: string) {
    return apiRequest<ProductQr>(`/api/products/${id}/qr/regenerate`, { method: "POST", token });
  },

  /** Recherche par QR interne (« MALISTOCK:MS… ») ou code-barres physique. */
  lookup(token: string, code: string) {
    return apiRequest<{ product: ApiProduct }>(
      `/api/products/lookup?code=${encodeURIComponent(code)}`,
      { token }
    );
  },
};

/** Télécharge le PDF d'étiquettes et renvoie les octets (partage via expo-sharing). */
export async function fetchLabelsPdf(token: string, ids?: string[]): Promise<Uint8Array> {
  const query = ids && ids.length > 0 ? `?ids=${ids.map(encodeURIComponent).join(",")}` : "";
  const response = await fetch(`${API_URL}/api/products/labels.pdf${query}`, {
    headers: { Accept: "application/pdf", Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "Aucun produit à étiqueter." : "Étiquettes indisponibles.");
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}
