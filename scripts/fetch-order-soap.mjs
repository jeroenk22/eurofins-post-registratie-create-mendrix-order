import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import * as readline from "readline";

// Laad .env handmatig
try {
  const env = readFileSync(".env", "utf8");
  for (const line of env.split(/\r?\n/)) {
    if (line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) process.env[key] = val;
  }
} catch (e) {
  console.error(".env laden mislukt:", e.message);
}

const soapUrl  = process.env.MENDRIX_SOAP_URL;
const soapUser = process.env.MENDRIX_SOAP_USER;
const soapPass = process.env.MENDRIX_SOAP_PASS;

if (!soapUrl || !soapUser || !soapPass) {
  console.error("MENDRIX_SOAP_URL, MENDRIX_SOAP_USER of MENDRIX_SOAP_PASS ontbreekt in .env");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const orderId = (await ask("Order ID: ")).trim();
rl.close();

if (!orderId || isNaN(Number(orderId))) {
  console.error("Ongeldig Order ID");
  process.exit(1);
}

const xmlEscape = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const xmlUnescape = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const customLinkXml = `<?xml version="1.0" encoding="windows-1252"?>
<EoCustomLinkRequestOrdersNormal Type="TEoCustomLinkRequestOrdersNormal" xsi:noNamespaceSchemaLocation="GdxEoStructures.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Nested>False</Nested>
  <Filter Type="TEoFilterOrdersNormal">
    <KeysExplicitAsCsv>${orderId}</KeysExplicitAsCsv>
  </Filter>
</EoCustomLinkRequestOrdersNormal>`;

const envelope = `<?xml version="1.0"?>
<soap-env:Envelope
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:urn="urn:UCoSoapDispatcherCustomLink-ICustomLinkSoap">
    <soap-env:Header xmlns:NS-1="urn:UCoSoapDispatcherBase">
        <NS-1:TAuthenticationHeader xsi:type="urn:TAuthenticationHeader"
            xmlns:urn="urn:UCoSoapDispatcherBase">
            <UserName xsi:type="xsd:string">${xmlEscape(soapUser)}</UserName>
            <Password xsi:type="xsd:string">${xmlEscape(soapPass)}</Password>
        </NS-1:TAuthenticationHeader>
    </soap-env:Header>
    <soap-env:Body>
        <urn:ExecuteRequest soap-env:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
            <ARequest xsi:type="xsd:string">${xmlEscape(customLinkXml)}</ARequest>
        </urn:ExecuteRequest>
    </soap-env:Body>
</soap-env:Envelope>`;

console.log(`\nSOAP URL:  ${soapUrl}`);
console.log(`Order ID:  ${orderId}`);
console.log("Versturen...\n");

let rawResponse;
try {
  const res = await fetch(soapUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"urn:UCoSoapDispatcherCustomLink-ICustomLinkSoap#ExecuteRequest"',
    },
    body: envelope,
  });

  rawResponse = await res.text();

  if (!res.ok) {
    console.error(`SOAP HTTP ${res.status}:`);
    console.error(rawResponse.slice(0, 500));
    process.exit(1);
  }
} catch (e) {
  console.error("Netwerkfout:", e.message);
  process.exit(1);
}

// Extraheer de Custom Link response uit de SOAP wrapper
let clResponse = rawResponse;
for (const tag of ["return", "ExecuteRequestResult", "AResult"]) {
  const m = rawResponse.match(new RegExp(`<[^>]*${tag}[^>]*>(.*?)<\\/[^>]*${tag}>`, "s"));
  if (m?.[1] !== undefined) {
    clResponse = xmlUnescape(m[1]);
    break;
  }
}

const outputDir = join("scripts", "output");
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, `${orderId}.xml`);
writeFileSync(outputPath, clResponse, "utf8");
console.log(`Opgeslagen in: ${outputPath}`);
