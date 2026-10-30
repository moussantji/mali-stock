/**
 * Onglet Scanner (vendeur) — caméra code-barres / QR :
 *  - QR interne Mali Stock (« MALISTOCK:MS… ») → produit lié.
 *  - Code-barres physique (EAN, UPC, Code128…) → produit lié.
 *  - Code inconnu → création d'un produit avec le code pré-rempli.
 *  - Saisie manuelle de secours, torche, permissions propres.
 */
import React, { useCallback, useState } from "react";
import { productsApi, type ApiProduct } from "../api/products";
import { CameraScanner } from "../ui/CameraScanner";
import { useAppDialog } from "../ui/AppDialog";

interface Props {
  token: string;
  onFound: (product: ApiProduct) => void;
  onUnknownCode: (code: string) => void;
}

export function ScanScreen({ token, onFound, onUnknownCode }: Props) {
  const dialog = useAppDialog();
  const [busy, setBusy] = useState(false);

  const handleCode = useCallback(
    async (code: string) => {
      setBusy(true);
      try {
        const { product } = await productsApi.lookup(token, code);
        onFound(product);
      } catch (requestError) {
        const status = (requestError as { status?: number }).status;
        if (status === 404) {
          onUnknownCode(code);
        } else if (status === 400) {
          /* Code illisible : on ignore, l'utilisateur rescanne. */
        } else {
          await dialog.alert({
            title: "Scanner",
            message:
              requestError instanceof Error && requestError.message
                ? requestError.message
                : "Impossible de vérifier ce code. Vérifie que le serveur tourne.",
            variant: "danger",
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [token, onFound, onUnknownCode, dialog]
  );

  return (
    <CameraScanner
      onCode={handleCode}
      busy={busy}
      legend="QR Mali Stock & codes-barres"
      hint="Place le QR ou le code-barres dans le cadre"
      busyHint="Recherche du produit…"
      manualPlaceholder="Saisir un code manuellement"
      permissionText="Autorise la caméra pour scanner les QR codes Mali Stock et les codes-barres de tes produits. Aucune image n'est enregistrée."
    />
  );
}
