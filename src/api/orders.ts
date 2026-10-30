/**
 * Client API « Réseau commerce » — fiche produit publique + commandes comptoir.
 * Types alignés sur server/src/routes/public.js et server/src/routes/orders.js.
 */
import { apiRequest } from "../auth/api";

/* ── Types ────────────────────────────────────────────────── */

export type OrderStatus = "pending" | "confirmed" | "declined" | "completed" | "cancelled";
export type PaymentMethod = "cash" | "orange_money" | "moov" | "wave";

export interface PublicVendor {
  id: string;
  shopName: string;
  category: string | null;
  city: string | null;
  bio: string | null;
  ownerName: string;
  initials: string;
}

export interface PublicProduct {
  name: string;
  unit: string;
  category: string | null;
  price: number;
  available: boolean;
  status: "available" | "out";
}

export interface PublicFiche {
  self: boolean;
  vendor?: PublicVendor;
  product?: PublicProduct | null;
}

export interface OrderCounterpart {
  id: string | null;
  name: string;
  initials: string;
  /** null = client comptoir sans compte Mali Stock. */
  accountType: "standard" | "pro" | null;
  phone: string | null;
  shopName: string | null;
  category: string | null;
  city: string | null;
}

export interface ApiOrder {
  id: string;
  /** Présent côté acheteur historique : la boutique où la commande a été passée. */
  vendor?: OrderCounterpart;
  /** Présent côté vendeur : le client, avec ou sans compte. */
  client?: OrderCounterpart;
  product: {
    id: string;
    name: string | null;
    sku: string | null;
    unit: string | null;
    shopName: string | null;
  };
  quantity: number;
  confirmedQuantity: number | null;
  unitPrice: number;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  note: string | null;
  vendorNote: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface OrderList {
  role: "standard" | "pro";
  orders: ApiOrder[];
}

/* ── Libellés partagés ────────────────────────────────────── */

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  declined: "Refusée",
  completed: "Terminée",
  cancelled: "Annulée",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Espèces",
  orange_money: "Orange Money",
  moov: "Moov Africa",
  wave: "Wave Mali",
};

export const PAYMENT_METHOD_HINT: Record<PaymentMethod, string> = {
  cash: "Le client paie en liquide au comptoir.",
  orange_money: "Encaissement Orange Money Mali.",
  moov: "Encaissement Moov Africa.",
  wave: "Encaissement Wave Mali.",
};

/* ── Appels ───────────────────────────────────────────────── */

export const publicApi = {
  /** Fiche publique d'un produit scanné (QR interne Mali Stock). */
  product(token: string, code: string) {
    return apiRequest<PublicFiche>(`/api/public/products/${encodeURIComponent(code)}`, { token });
  },
};

export const ordersApi = {
  list(token: string) {
    return apiRequest<OrderList>("/api/orders", { token });
  },

  create(token: string, input: { qrToken: string; quantity: number; note?: string | null }) {
    return apiRequest<{ order: ApiOrder }>("/api/orders", {
      method: "POST",
      body: input,
      token,
    });
  },

  createManual(
    token: string,
    input: {
      productId: string;
      quantity: number;
      customerName?: string | null;
      customerPhone?: string | null;
      note?: string | null;
    }
  ) {
    return apiRequest<{ order: ApiOrder }>("/api/orders/manual", {
      method: "POST",
      body: input,
      token,
    });
  },

  confirm(
    token: string,
    id: string,
    input: { confirmedQuantity?: number; vendorNote?: string | null } = {}
  ) {
    return apiRequest<{ order: ApiOrder }>(`/api/orders/${id}`, {
      method: "PATCH",
      body: { action: "confirm", ...input },
      token,
    });
  },

  decline(token: string, id: string, vendorNote?: string | null) {
    return apiRequest<{ order: ApiOrder }>(`/api/orders/${id}`, {
      method: "PATCH",
      body: { action: "decline", vendorNote: vendorNote ?? null },
      token,
    });
  },

  complete(
    token: string,
    id: string,
    input: { paymentMethod: PaymentMethod; paymentReference?: string | null; confirmedQuantity?: number }
  ) {
    return apiRequest<{ order: ApiOrder }>(`/api/orders/${id}`, {
      method: "PATCH",
      body: { action: "complete", ...input },
      token,
    });
  },

  cancel(token: string, id: string) {
    return apiRequest<{ order: ApiOrder }>(`/api/orders/${id}`, {
      method: "PATCH",
      body: { action: "cancel" },
      token,
    });
  },
};
