import type { StoreResult } from "./types.js";
import { fetchWithTimeout } from "./http-utils.js";
import { xmlEscape, xmlUnescape } from "./xml-utils.js";

export function buildSoapEnvelope(
  customLinkXml: string,
  user: string,
  password: string
): string {
  return `<?xml version="1.0"?>
<soap-env:Envelope
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:urn="urn:UCoSoapDispatcherCustomLink-ICustomLinkSoap">
    <soap-env:Header xmlns:NS-1="urn:UCoSoapDispatcherBase">
        <NS-1:TAuthenticationHeader xsi:type="urn:TAuthenticationHeader"
            xmlns:urn="urn:UCoSoapDispatcherBase">
            <UserName xsi:type="xsd:string">${xmlEscape(user)}</UserName>
            <Password xsi:type="xsd:string">${xmlEscape(password)}</Password>
        </NS-1:TAuthenticationHeader>
    </soap-env:Header>
    <soap-env:Body>
        <urn:ExecuteRequest soap-env:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
            <ARequest xsi:type="xsd:string">${xmlEscape(customLinkXml)}</ARequest>
        </urn:ExecuteRequest>
    </soap-env:Body>
</soap-env:Envelope>`;
}

export async function sendSoap(envelope: string, soapUrl: string, timeoutMs = 30_000): Promise<string> {
  const res = await fetchWithTimeout(soapUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"urn:UCoSoapDispatcherCustomLink-ICustomLinkSoap#ExecuteRequest"',
    },
    body: envelope,
  }, timeoutMs);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SOAP HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  return res.text();
}

export function extractCustomLinkResponse(soapResponse: string): string {
  for (const tag of ["return", "ExecuteRequestResult", "AResult"]) {
    const m = soapResponse.match(new RegExp(`<[^>]*${tag}[^>]*>(.*?)<\\/[^>]*${tag}>`, "s"));
    if (m?.[1] !== undefined) return xmlUnescape(m[1]);
  }
  return soapResponse;
}

export function parseStoreResults(clResponse: string): StoreResult[] {
  const results: StoreResult[] = [];
  const re = /<EoStoreResult[^>]*>(.*?)<\/EoStoreResult>/gs;
  let m: RegExpExecArray | null;

  while ((m = re.exec(clResponse)) !== null) {
    const blok = m[1]!;
    const get = (tag: string): string =>
      blok.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1]?.trim() ?? "";

    results.push({
      id: get("Id"),
      idOud: get("IdOld"),
      resultaat: get("StoreResult"),
      omschrijving: get("StoreDescription"),
    });
  }

  return results;
}
