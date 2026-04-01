import type { EntryPayload, Goed, OrderData, WebhookPayload } from "./types.js";
import { CLIENT, PRODUCT } from "./ids.js";

// ---------------------------------------------------------------------------
// Verpakking mapping (mestklant colli-omschrijvingen → instructie-tekst)
// ---------------------------------------------------------------------------

const VERPAKKING_MAPPING: Record<string, string> = {
  "grote doos sealrollen (10 doosjes)": "grote doos sealrollen",
  "grote doos vaste mestzakken (500 stuks)": "doos vaste mestzakken",
  "setje insteekhoezen": "insteekhoezen",
  "setje vaste mestzakken (50 stuks)": "setje vaste mestzakken",
};

function mapVerpakking(omschrijving: string): string {
  const key = omschrijving.toLowerCase().trim();
  return VERPAKKING_MAPPING[key] ?? key;
}

export function formatColliInstructie(omschrijvingen: string[]): string {
  if (omschrijvingen.length === 0) return "";

  // Tel duplicaten op basis van gemapte naam
  const counts = new Map<string, number>();
  for (const o of omschrijvingen) {
    const mapped = mapVerpakking(o);
    counts.set(mapped, (counts.get(mapped) ?? 0) + 1);
  }

  // Sorteer alfabetisch op gemapte naam, formatteer daarna
  const parts = Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b, "nl"))
    .map(([name, count]) => {
      if (count > 1 && /^doos\s+\S/.test(name)) {
        return `${count} dozen ${name.slice(5).trim()}`;
      }
      if (count > 1) return `${count}x ${name}`;
      return name;
    });

  const sentence = parts.length === 1
    ? `${parts[0]} afleveren`
    : `${parts.slice(0, -1).join(", ")} en ${parts[parts.length - 1]} afleveren`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function formatNlDatetime(d: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map(({ type, value }) => [type, value]));
  return `${p["day"]}-${p["month"]}-${p["year"]} om ${p["hour"]}:${p["minute"]} uur`;
}

function toAmsterdamIso(d: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map(({ type, value }) => [type, value]));
  return `${p["year"]}-${p["month"]}-${p["day"]}T${p["hour"]}:${p["minute"]}:${p["second"]}`;
}

export function nextWorkday(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

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

export type SenderInfo = Pick<WebhookPayload, "sender_name" | "sender_phone" | "sender_email" | "submitted_at">;

function resolveIds(entry: EntryPayload): { clientId: number; productId?: number } {
  if (!entry.spoed) return { clientId: CLIENT.DUMMY, productId: PRODUCT.DUMMY };

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
  const colliInstructie = formatColliInstructie(entry.colli_omschrijvingen);
  if (colliInstructie) instructieParts.push(entry.spoed ? `${colliInstructie} SPOED` : colliInstructie);

  const contact = sender.sender_name ? `${sender.sender_name} (via Postapp)` : "via Postapp";
  const door = sender.sender_name ? ` door ${sender.sender_name}` : "";
  const moment = sender.submitted_at ? new Date(sender.submitted_at) : new Date();
  const notes = `Aangemeld via postapp${door} (${formatNlDatetime(moment)})`;
  const ids = resolveIds(entry);

  return {
    clientId: ids.clientId,
    ...(ids.productId !== undefined && { productId: ids.productId }),
    contact,
    reference: "",
    referenceYour: entry.spoed ? "Spoed" : "",
    notes,
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
    moment: toAmsterdamIso(),
    gewenstVan: `${nextWorkday()}T00:00:00`,
    gewenstTot: `${nextWorkday()}T23:59:59`,
    instructies: instructieParts.join(" | "),
    trackTrace: "",
    goederen,
  };
}

export function entryPhotos(entry: EntryPayload): string[] {
  return entry.photos.map((p) => p.base64);
}
