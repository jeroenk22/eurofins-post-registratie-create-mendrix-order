import { execSync } from "child_process";
import type { Config, EntryPayload, FotoResultaat, OrderData, OrderResultaat } from "./types.js";
import { buildCustomLinkXml } from "./customlink-xml.js";
import { uploadPhotoDossier } from "./dossier-client.js";
import { entryPhotos, entryToOrder, type SenderInfo } from "./payload-mapper.js";
import {
  buildSoapEnvelope,
  extractCustomLinkResponse,
  parseStoreResults,
  sendSoap,
} from "./soap-client.js";
import type { SheetsLogEntry } from "./types.js";
import { appendToSheets } from "./sheets-logger.js";

// Dependency injection — maakt de service volledig testbaar zonder netwerkoproepen
export interface OrderServiceDeps {
  doSendSoap: typeof sendSoap;
  doUploadPhoto: typeof uploadPhotoDossier;
}

const defaultDeps: OrderServiceDeps = {
  doSendSoap: sendSoap,
  doUploadPhoto: uploadPhotoDossier,
};

async function execute(
  entry: EntryPayload,
  orderData: OrderData,
  config: Config,
  deps: OrderServiceDeps
): Promise<OrderResultaat> {
  // Stap 1: order aanmaken via SOAP Custom Link
  let orderId: string;
  try {
    const clXml    = buildCustomLinkXml(orderData);
    const envelope = buildSoapEnvelope(clXml, config.soapUser, config.soapPass);
    console.log(`[order-service] Entry ${entry.entry_number}: SOAP verzoek versturen naar ${config.soapUrl}`);
    const rawResp  = await deps.doSendSoap(envelope, config.soapUrl);
    console.log(`[order-service] Entry ${entry.entry_number}: SOAP antwoord ontvangen (${rawResp.length} bytes)`);
    const clResp   = extractCustomLinkResponse(rawResp);
    const results  = parseStoreResults(clResp);

    if (results.length === 0) {
      console.warn(`[order-service] Entry ${entry.entry_number}: geen StoreResult in respons:`, clResp.slice(0, 500));
      return { succes: false, fout: "Geen StoreResult ontvangen", clResponse: clResp };
    }

    const eerste = results[0]!;
    console.log(`[order-service] Entry ${entry.entry_number}: StoreResult = ${eerste.resultaat}, id = ${eerste.id}`);
    const ok = ["srInserted", "srUpdated"].includes(eerste.resultaat);

    if (!ok) {
      return { succes: false, resultaat: eerste.resultaat, omschrijving: eerste.omschrijving };
    }

    orderId = eerste.id;
  } catch (err) {
    const e = err as Error & { cause?: unknown; errors?: unknown[] };
    const causeStr = e.cause
      ? (e.cause as Error & { errors?: unknown[] }).errors
        ? (e.cause as { errors: unknown[] }).errors.map(String).join(" | ")
        : String(e.cause)
      : "";
    console.error(`[order-service] Entry ${entry.entry_number}: SOAP fout:`, e.message, causeStr ? `| cause: ${causeStr}` : "");
    return { succes: false, fout: `SOAP fout: ${e.message}` };
  }

  // Stap 2: foto's uploaden naar het dossier van de nieuwe order
  const fotos = entryPhotos(entry);
  console.log(`[order-service] Entry ${entry.entry_number}: orderId=${orderId}, ${fotos.length} foto(s) uploaden`);
  const fotoResultaten: FotoResultaat[] = await Promise.all(
    fotos.map(async (foto, i): Promise<FotoResultaat> => {
      const base64Data = foto.replace(/^data:[^;]+;base64,/, "");
      const buffer     = Buffer.from(base64Data, "base64");
      const extMatch   = foto.match(/^data:image\/(\w+);base64,/);
      const ext        = extMatch?.[1]?.replace("jpeg", "jpg") ?? "jpg";
      const filename   = `foto_${i + 1}.${ext}`;

      try {
        await deps.doUploadPhoto(
          config.apiUrl,
          config.apiToken,
          config.dossierDomain,
          orderId,
          filename,
          buffer
        );
        return { filename, succes: true };
      } catch (err) {
        return { filename, succes: false, fout: (err as Error).message };
      }
    })
  );

  return {
    succes: true,
    orderId,
    resultaat: "srInserted",
    ...(fotoResultaten.length > 0 && { fotos: fotoResultaten }),
  };
}

function getApiVersion(): string {
  const env = process.env.API_VERSION?.trim();
  if (env) return env;

  const year = new Date().getFullYear();
  const pr = getPrNumber() ?? "0";
  const commits = getCommitCount() ?? "0";
  if (pr === "0" && commits === "0") return "";
  return `${year}.${pr}.${commits}`;
}

function getPrNumber(): string | undefined {
  const ghRef = process.env.GITHUB_REF ?? "";
  const fromRef = ghRef.match(/^refs\/pull\/(\d+)\/merge$/)?.[1]
    ?? ghRef.match(/^refs\/pull\/(\d+)\/head$/)?.[1];
  if (fromRef) return fromRef;

  const githubPr = process.env.GITHUB_PR_NUMBER ?? process.env.PR_NUMBER;
  if (githubPr) return githubPr.toString();

  return undefined;
}

function getCommitCount(): string | undefined {
  try {
    const output = execSync("git rev-list --count HEAD", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output || undefined;
  } catch {
    return undefined;
  }
}

function buildLogEntry(
  entry: EntryPayload,
  orderData: OrderData,
  sender: SenderInfo,
  config: Config,
  result: OrderResultaat,
  tijdstip: Date,
  clientIp: string
): SheetsLogEntry {
  const fmt = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(tijdstip).map(({ type, value }) => [type, value]));

  const fotosOk       = result.fotos?.filter(f =>  f.succes).length ?? 0;
  const fotosMislukt  = result.fotos?.filter(f => !f.succes).length ?? 0;
  const fotoFouten    = result.fotos?.filter(f => !f.succes).map(f => f.fout).join("; ") ?? "";

  return {
    datum:            `${p["year"]}-${p["month"]}-${p["day"]}`,
    tijd:             `${p["hour"]}:${p["minute"]}:${p["second"]}`,
    entryNr:          entry.entry_number,
    aangemeldDoor:    sender.sender_name ?? "",
    ontvanger:        entry.recipient,
    recipientType:    entry.recipient_type ?? "",
    spoed:            entry.spoed,
    land:             entry.land ?? "NL",
    clientId:         orderData.clientId,
    productId:        orderData.productId,
    orderId:          result.orderId ?? "",
    soapResultaat:    result.resultaat ?? "",
    soapOmschrijving: result.omschrijving ?? "",
    fotosAangevraagd: entry.photos.length,
    fotosOk,
    fotosMislukt,
    succes:           result.succes,
    fout:             result.fout ?? fotoFouten,
    soapEndpoint:     config.soapUrl,
    apiEndpoint:      config.apiUrl,
    clientIp,
    submittedAt:      sender.submitted_at ?? "",
    appVersion:       sender.app_version ?? "",
    apiVersion:       getApiVersion(),
  };
}

export async function processEntry(
  entry: EntryPayload,
  sender: SenderInfo,
  config: Config,
  deps: OrderServiceDeps = defaultDeps,
  clientIp = "",
  onLog?: (logEntry: SheetsLogEntry) => void
): Promise<OrderResultaat> {
  const tijdstip = new Date(); // verwerkingstijdstip (niet submitted_at)

  console.log(`[order-service] Entry ${entry.entry_number}: spoed=${entry.spoed} (${typeof entry.spoed}), recipient_type=${entry.recipient_type}, land=${entry.land}`);
  const orderData = entryToOrder(entry, sender);
  console.log(`[order-service] Entry ${entry.entry_number}: order aanmaken voor "${entry.recipient}" → clientId=${orderData.clientId}, productId=${orderData.productId}, referenceYour="${orderData.referenceYour}"`);

  const result = await execute(entry, orderData, config, deps);
  const logEntry = buildLogEntry(entry, orderData, sender, config, result, tijdstip, clientIp);

  if (onLog) {
    onLog(logEntry);
  } else {
    appendToSheets(logEntry).catch(err => console.warn("[sheets] Log mislukt:", (err as Error).message));
  }

  return result;
}
