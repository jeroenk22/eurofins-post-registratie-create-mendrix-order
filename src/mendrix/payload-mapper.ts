import type { EntryPayload, Goed, OrderData, WebhookPayload } from "./types.js";
import { CLIENT, PRODUCT } from "./ids.js";

const LAND_CODES: Record<string, string> = {
  nederland: "NL",
  duitsland: "DE",
  belgië: "BE",
  belgie: "BE",
  frankrijk: "FR",
  luxemburg: "LU",
  verenigd_koninkrijk: "GB",
  denemarken: "DK",
  spanje: "ES",
  italië: "IT",
  italie: "IT",
  zwitserland: "CH",
  oostenrijk: "AT",
  polen: "PL",
};

function landToCode(land: string): string {
  return LAND_CODES[land.toLowerCase().replace(/\s+/g, "_")] ?? "";
}

type SenderInfo = Pick<WebhookPayload, "sender_name" | "sender_phone" | "sender_email">;

function resolveIds(entry: EntryPayload, defaultClientId: number): { clientId: number; productId?: number } {
  if (!entry.spoed) return { clientId: defaultClientId };

  const landCode = entry.land ? landToCode(entry.land) : "NL";
  switch (entry.recipient_type) {
    case "mestklant":
      return { clientId: CLIENT.MESTKLANT, productId: PRODUCT.AGRO_OVERNIGHT };
    case "monsternemer":
      if (landCode === "DE") return { clientId: CLIENT.MONSTERNEMER_DE, productId: PRODUCT.AGRO_OVERNIGHT };
      if (landCode === "BE") return { clientId: CLIENT.MONSTERNEMER_BE, productId: PRODUCT.AGRO_OVERNIGHT };
      return { clientId: CLIENT.MONSTERNEMER_NL, productId: PRODUCT.AGRO_OVERNIGHT };
    case "ap06":
      return { clientId: CLIENT.AP06, productId: PRODUCT.AGRO_OVERNIGHT };
    default:
      return { clientId: CLIENT.MONSTERNEMER_NL, productId: PRODUCT.AGRO_OVERNIGHT };
  }
}

export function entryToOrder(
  entry: EntryPayload,
  sender: SenderInfo,
  clientId: number
): OrderData {
  // Elk omschrijving = één goed met aantal 1
  // mestklant: verpakking=omschrijving, geen opmerkingen
  // alle andere types (monsternemer, ap06, leeg/null): verpakking="Colli", opmerkingen=omschrijving
  const isMestklant = entry.recipient_type === "mestklant";
  const goederen: Goed[] = entry.colli_omschrijvingen.map((omschrijving) =>
    isMestklant
      ? { verpakking: omschrijving, aantal: 1 }
      : { verpakking: "Colli", opmerkingen: omschrijving, aantal: 1 }
  );

  // Fallback als colli_omschrijvingen leeg is maar colli > 0
  if (goederen.length === 0 && entry.colli > 0) {
    for (let i = 0; i < entry.colli; i++) {
      goederen.push({ aantal: 1 });
    }
  }

  // Minimaal één goed vereist voor Custom Link
  if (goederen.length === 0) {
    goederen.push({ aantal: 1 });
  }

  const instructieParts: string[] = [];
  if (entry.spoed) instructieParts.push("SPOED");
  if (entry.shelf) instructieParts.push(`Schap: ${entry.shelf}`);

  const contact = sender.sender_name ? `${sender.sender_name} (via Postapp)` : "via Postapp";
  const diversen = [sender.sender_email, sender.sender_phone].filter(Boolean).join(" | ");
  const ids = resolveIds(entry, clientId);

  return {
    clientId: ids.clientId,
    ...(ids.productId !== undefined && { productId: ids.productId }),
    contact,
    reference: String(entry.entry_number),
    referenceYour: entry.spoed ? "Spoed" : "",
    diversen,
    taakType: 2,
    adres: {
      naam: entry.recipient.replace(/\s*\([^)]*\)\s*$/, "").trim(),
      ...(entry.adres !== undefined && { straat: entry.adres }),
      ...(entry.postcode !== undefined && { postcode: entry.postcode }),
      ...(entry.plaats !== undefined && { plaats: entry.plaats }),
      ...(entry.land !== undefined && {
        land: entry.land,
        landcode: landToCode(entry.land),
      }),
    },
    gewenstVan: "",
    gewenstTot: "",
    instructies: instructieParts.join(" | "),
    trackTrace: "",
    goederen,
  };
}

export function entryPhotos(entry: EntryPayload): string[] {
  return entry.photos.map((p) => p.base64);
}
