import type { Config, EntryPayload, FotoResultaat, OrderResultaat, WebhookPayload } from "./types.js";
import { buildCustomLinkXml } from "./customlink-xml.js";
import { uploadPhotoDossier } from "./dossier-client.js";
import { entryPhotos, entryToOrder } from "./payload-mapper.js";
import {
  buildSoapEnvelope,
  extractCustomLinkResponse,
  parseStoreResults,
  sendSoap,
} from "./soap-client.js";

type SenderInfo = Pick<WebhookPayload, "sender_name" | "sender_phone" | "sender_email">;

// Dependency injection — maakt de service volledig testbaar zonder netwerkoproepen
export interface OrderServiceDeps {
  doSendSoap: typeof sendSoap;
  doUploadPhoto: typeof uploadPhotoDossier;
}

const defaultDeps: OrderServiceDeps = {
  doSendSoap: sendSoap,
  doUploadPhoto: uploadPhotoDossier,
};

export async function processEntry(
  entry: EntryPayload,
  sender: SenderInfo,
  config: Config,
  deps: OrderServiceDeps = defaultDeps
): Promise<OrderResultaat> {
  console.log(`[order-service] Entry ${entry.entry_number}: spoed=${entry.spoed} (${typeof entry.spoed}), recipient_type=${entry.recipient_type}, land=${entry.land}`);
  const orderData = entryToOrder(entry, sender, config.clientId);
  console.log(`[order-service] Entry ${entry.entry_number}: order aanmaken voor "${entry.recipient}" → clientId=${orderData.clientId}, productId=${orderData.productId}, referenceYour="${orderData.referenceYour}"`);

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
    console.error(`[order-service] Entry ${entry.entry_number}: SOAP fout:`, (err as Error).message);
    return { succes: false, fout: `SOAP fout: ${(err as Error).message}` };
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
