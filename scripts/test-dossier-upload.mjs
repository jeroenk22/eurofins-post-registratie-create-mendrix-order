import { readFileSync } from "fs";

// Laad .env handmatig zonder dotenv
try {
  const env = readFileSync(".env", "utf8");
  for (const line of env.split(/\r?\n/)) {
    if (line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) process.env[key] = val;
  }
} catch (e) { console.error(".env laden mislukt:", e.message); };

const apiUrl   = process.env.MENDRIX_API_URL;
const apiToken = process.env.MENDRIX_API_TOKEN;
const domain   = process.env.MENDRIX_DOSSIER_DOMAIN ?? "orders";
import * as readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

const orderId  = await ask("Order ID: ");
const tekst    = await ask("Tekst in bestand: ");
rl.close();

const filename = "test-upload.txt";
const buffer   = Buffer.from(tekst + "\n");

if (!apiUrl || !apiToken) {
  console.error("MENDRIX_API_URL of MENDRIX_API_TOKEN ontbreekt in .env");
  process.exit(1);
}

console.log(`API URL:  ${apiUrl}`);
console.log(`Domain:   ${domain}`);
console.log(`Order ID: ${orderId}`);
console.log(`Bestand:  ${filename}`);
console.log("Inloggen...");

const loginRes = await fetch(`${apiUrl.replace(/\/$/, "")}/account/login-api-token`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: apiToken }),
});

if (!loginRes.ok) {
  const body = await loginRes.text();
  console.error(`Login mislukt HTTP ${loginRes.status}:`, body.slice(0, 300));
  process.exit(1);
}

const json        = await loginRes.json();
const accessToken = json.data?.items?.[0]?.access;

if (!accessToken) {
  console.error("Geen access token in login response:", JSON.stringify(json));
  process.exit(1);
}

console.log("Login geslaagd. Bestand uploaden...");

const uploadUrl = `${apiUrl.replace(/\/$/, "")}/dossier/dossiers/${domain}/${orderId}/contents/${encodeURIComponent(filename)}`;
console.log(`Upload URL: ${uploadUrl}`);

const uploadRes = await fetch(uploadUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/octet-stream",
    Authorization: `Bearer ${accessToken}`,
  },
  body: buffer,
});

if (!uploadRes.ok) {
  const body = await uploadRes.text();
  console.error(`Upload mislukt HTTP ${uploadRes.status}:`, body.slice(0, 300));
  process.exit(1);
}

console.log(`Upload geslaagd! HTTP ${uploadRes.status}`);
