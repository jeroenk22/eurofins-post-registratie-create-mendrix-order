import { createSign } from "crypto";
import { fetchWithTimeout } from "./http-utils.js";
import type { SheetsLogEntry } from "./types.js";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function createJwt(sa: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud:   "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
  })).toString("base64url");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  return `${header}.${payload}.${sign.sign(sa.private_key, "base64url")}`;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  createJwt(sa),
    }),
  }, 15_000);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return ((await res.json()) as { access_token: string }).access_token;
}

function toRow(entry: SheetsLogEntry): unknown[] {
  return [
    entry.datum,
    entry.tijd,
    entry.entryNr,
    entry.aangemeldDoor,
    entry.ontvanger,
    entry.recipientType,
    entry.spoed ? "TRUE" : "FALSE",
    entry.land,
    entry.clientId,
    entry.productId ?? "",
    entry.orderId,
    entry.soapResultaat,
    entry.soapOmschrijving,
    entry.fotosAangevraagd,
    entry.fotosOk,
    entry.fotosMislukt,
    entry.succes ? "TRUE" : "FALSE",
    entry.fout,
    entry.soapEndpoint,
    entry.apiEndpoint,
    entry.clientIp,
    entry.submittedAt,
  ];
}

async function appendRows(rows: unknown[][]): Promise<void> {
  const saJson  = process.env["GOOGLE_SERVICE_ACCOUNT"];
  const sheetId = process.env["GOOGLE_SPREADSHEET_ID"];
  if (!saJson || !sheetId) return;  // Logging optioneel — stil overslaan als env vars ontbreken

  const tab = process.env["NETLIFY_DEV"] === "true" ? "DEVELOPMENT" : "PRODUCTION";

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(saJson) as ServiceAccount;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT bevat geen geldige JSON");
  }

  const token = await getAccessToken(sa);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: rows }),
  }, 30_000);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}

export async function appendToSheets(entry: SheetsLogEntry): Promise<void> {
  await appendRows([toRow(entry)]);
}

export async function appendManyToSheets(entries: SheetsLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await appendRows(entries.map(toRow));
}
