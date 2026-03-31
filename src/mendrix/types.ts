// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface Adres {
  naam?: string;
  locatie?: string;
  straat?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
  land?: string;
  landcode?: string;
}

export interface Goed {
  verpakking?: string;
  aantal?: number;
  gewicht?: number;
  volume?: number;
  volumegewicht?: number;
  laadmeters?: number;
  lengte?: number;
  breedte?: number;
  hoogte?: number;
  barcode?: string;
  identificatie?: string;
  opmerkingen?: string;
}

export interface OrderData {
  clientId: number;
  productId?: number;
  contact: string;
  reference: string;
  referenceYour: string;
  diversen: string;
  moment?: string;
  taakType: number;
  adres: Adres;
  gewenstVan: string;
  gewenstTot: string;
  instructies: string;
  trackTrace: string;
  goederen: Goed[];
}

// ---------------------------------------------------------------------------
// Inbound webhook payload (van Make.com / PWA)
// ---------------------------------------------------------------------------

export interface PhotoPayload {
  filename: string;
  base64: string;
  recipient?: string;
  spoed?: boolean;
}

export type RecipientType = "monsternemer" | "ap06" | "mestklant";

export interface EntryPayload {
  entry_number: number;
  shelf?: string;
  recipient: string;
  recipient_type?: RecipientType;
  adres?: string;
  postcode?: string;
  plaats?: string;
  land?: string;
  colli: number;
  colli_omschrijvingen: string[];
  spoed: boolean;
  photo_count?: number;
  photos: PhotoPayload[];
}

export interface WebhookPayload {
  submitted_at?: string;
  datetime_nl?: string;
  sender_name: string;
  sender_phone?: string;
  sender_email?: string;
  cc_email?: string;
  total_entries?: number;
  print_url?: string;
  entries: EntryPayload[];
}

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------

export interface StoreResult {
  id: string;
  idOud: string;
  resultaat: string;
  omschrijving: string;
}

export interface FotoResultaat {
  filename: string;
  succes: boolean;
  fout?: string;
}

export interface OrderResultaat {
  succes: boolean;
  orderId?: string;
  resultaat?: string;
  omschrijving?: string;
  fout?: string;
  clResponse?: string;
  fotos?: FotoResultaat[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface Config {
  soapUrl: string;
  soapUser: string;
  soapPass: string;
  apiUrl: string;
  apiToken: string;
  clientId: number;
  dossierDomain: string;
}
