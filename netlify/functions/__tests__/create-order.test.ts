import { createHmac } from "crypto";
import type { HandlerContext, HandlerEvent, HandlerResponse } from "@netlify/functions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Alleen de netwerkcalls worden gemockt — mapping, XML en SOAP-parsing lopen echt
vi.mock("../../../src/mendrix/version.generated.js", () => ({ GENERATED_API_VERSION: "2026.16.159" }));
vi.mock("../../../src/mendrix/soap-client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/mendrix/soap-client.js")>()),
  sendSoap: vi.fn(),
}));
vi.mock("../../../src/mendrix/dossier-client.js", () => ({ uploadPhotoDossier: vi.fn() }));
vi.mock("../../../src/mendrix/sheets-logger.js", () => ({
  appendManyToSheets: vi.fn(),
  appendToSheets: vi.fn(),
}));

import { sendSoap } from "../../../src/mendrix/soap-client.js";
import { uploadPhotoDossier } from "../../../src/mendrix/dossier-client.js";
import { appendManyToSheets } from "../../../src/mendrix/sheets-logger.js";
import type { EntryPayload, OrderResultaat, SheetsLogEntry, WebhookPayload } from "../../../src/mendrix/types.js";
import { handler, verifySignature } from "../create-order.js";

const SECRET = "testsecret";
const BODY   = '{"test":1}';

function makeSignature(timestamp: string, body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function nowTs(): string {
  return Math.floor(Date.now() / 1000).toString();
}

describe("verifySignature", () => {
  it("accepteert een geldige handtekening", () => {
    const ts  = nowTs();
    const sig = makeSignature(ts, BODY);
    expect(verifySignature(BODY, ts, sig, SECRET)).toBe(true);
  });

  it("weigert een verkeerd secret", () => {
    const ts  = nowTs();
    const sig = makeSignature(ts, BODY, "verkeerdsecret");
    expect(verifySignature(BODY, ts, sig, SECRET)).toBe(false);
  });

  it("weigert een gemanipuleerde body", () => {
    const ts  = nowTs();
    const sig = makeSignature(ts, BODY);
    expect(verifySignature('{"test":2}', ts, sig, SECRET)).toBe(false);
  });

  it("weigert een timestamp ouder dan 5 minuten", () => {
    const ts  = (Math.floor(Date.now() / 1000) - 301).toString();
    const sig = makeSignature(ts, BODY);
    expect(verifySignature(BODY, ts, sig, SECRET)).toBe(false);
  });

  it("weigert een timestamp meer dan 5 minuten in de toekomst", () => {
    const ts  = (Math.floor(Date.now() / 1000) + 301).toString();
    const sig = makeSignature(ts, BODY);
    expect(verifySignature(BODY, ts, sig, SECRET)).toBe(false);
  });

  it("accepteert een timestamp net binnen het venster (299 seconden oud)", () => {
    const ts  = (Math.floor(Date.now() / 1000) - 299).toString();
    const sig = makeSignature(ts, BODY);
    expect(verifySignature(BODY, ts, sig, SECRET)).toBe(true);
  });

  it("weigert een ongeldige (NaN) timestamp", () => {
    const sig = makeSignature("abc", BODY);
    expect(verifySignature(BODY, "abc", sig, SECRET)).toBe(false);
  });

  it("weigert een lege handtekening", () => {
    const ts = nowTs();
    expect(verifySignature(BODY, ts, "", SECRET)).toBe(false);
  });

  it("weigert een lege timestamp", () => {
    const sig = makeSignature("", BODY);
    expect(verifySignature(BODY, "", sig, SECRET)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------

const soapResponseOk = `
  <soap:Body>
    <return>&lt;EoStoreResultList&gt;
      &lt;EoStoreResult Type="TEoStoreResult"&gt;
        &lt;Id&gt;42&lt;/Id&gt;
        &lt;IdOld&gt;-1000&lt;/IdOld&gt;
        &lt;StoreResult&gt;srInserted&lt;/StoreResult&gt;
        &lt;StoreDescription&gt;&lt;/StoreDescription&gt;
      &lt;/EoStoreResult&gt;
    &lt;/EoStoreResultList&gt;</return>
  </soap:Body>`;

const HEADER_IP = "198.51.100.1";

function maakEntry(entry_number: number, extra: Partial<EntryPayload> = {}): EntryPayload {
  return {
    entry_number,
    shelf: "Schap 1",
    recipient: `Ontvanger ${entry_number} (Halle)`,
    recipient_type: "monsternemer",
    adres: "Dorpsstraat 1",
    postcode: "1234 AB",
    plaats: "Halle",
    land: "Nederland",
    colli: 1,
    colli_omschrijvingen: ["Doos"],
    spoed: true,
    photos: [{ filename: "foto.jpg", base64: "data:image/jpeg;base64,/9j/abc" }],
    ...extra,
  };
}

function maakPayload(entries: EntryPayload[], extra: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    submitted_at: "2026-09-15T08:00:00.000Z",
    app_version: "2026.51.169",
    sender_name: "Tester",
    sender_phone: null,
    sender_email: null,
    cc_email: null,
    entries,
    ...extra,
  };
}

async function roepHandlerAan(payload: unknown, headers: Record<string, string> = { "x-forwarded-for": HEADER_IP }) {
  const body = JSON.stringify(payload);
  const ts   = nowTs();
  const event = {
    httpMethod: "POST",
    headers: { ...headers, "x-timestamp": ts, "x-signature": makeSignature(ts, body) },
    body,
  } as unknown as HandlerEvent;
  const response = await handler(event, {} as HandlerContext) as HandlerResponse;
  const { resultaten } = JSON.parse(response.body ?? "{}") as { resultaten: OrderResultaat[] };
  const logEntries = vi.mocked(appendManyToSheets).mock.calls[0]?.[0] ?? [];
  return { response, resultaten, logEntries };
}

function ipVanEntry(logEntries: SheetsLogEntry[], entryNr: number): string | undefined {
  return logEntries.find((le) => le.entryNr === entryNr)?.clientIp;
}

describe("handler", () => {
  beforeEach(() => {
    vi.stubEnv("WEBHOOK_SECRET", SECRET);
    vi.stubEnv("MENDRIX_SOAP_URL", "http://soap.example.com/");
    vi.stubEnv("MENDRIX_SOAP_USER", "user");
    vi.stubEnv("MENDRIX_SOAP_PASS", "pass");
    vi.stubEnv("MENDRIX_API_URL", "http://api.example.com/");
    vi.stubEnv("MENDRIX_API_TOKEN", "token");
    vi.mocked(sendSoap).mockReset().mockResolvedValue(soapResponseOk);
    vi.mocked(uploadPhotoDossier).mockReset().mockResolvedValue(undefined as never);
    vi.mocked(appendManyToSheets).mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("weigert een request met ongeldige handtekening", async () => {
    const event = {
      httpMethod: "POST",
      headers: { "x-timestamp": nowTs(), "x-signature": "fout" },
      body: JSON.stringify(maakPayload([maakEntry(1)])),
    } as unknown as HandlerEvent;
    const response = await handler(event, {} as HandlerContext) as HandlerResponse;
    expect(response.statusCode).toBe(401);
    expect(sendSoap).not.toHaveBeenCalled();
  });

  describe("één foute entry laat de aanmelding niet mislukken", () => {
    it("entry met null-adresvelden (15-9) wordt gewoon aangemaakt", async () => {
      const nullEntry = maakEntry(2, { recipient_type: null, adres: null, postcode: null, plaats: null, land: null });
      const { response, resultaten } = await roepHandlerAan(maakPayload([maakEntry(1), nullEntry, maakEntry(3)]));

      expect(response.statusCode).toBe(200);
      expect(resultaten.map((r) => r.succes)).toEqual([true, true, true]);
      expect(sendSoap).toHaveBeenCalledTimes(3);
    });

    it("mapping-fout in één entry: de andere entries slagen, volgorde blijft gelijk", async () => {
      const kapot = maakEntry(2, { recipient: null as unknown as string });
      const { response, resultaten, logEntries } = await roepHandlerAan(maakPayload([maakEntry(1), kapot, maakEntry(3)]));

      expect(response.statusCode).toBe(200);
      expect(resultaten).toHaveLength(3);
      expect(resultaten[0]).toMatchObject({ succes: true, orderId: "42" });
      expect(resultaten[1]?.succes).toBe(false);
      expect(resultaten[1]?.fout).toMatch(/^Mapping fout: /);
      expect(resultaten[2]).toMatchObject({ succes: true, orderId: "42" });
      expect(sendSoap).toHaveBeenCalledTimes(2);
      // Ook de mislukte entry staat in de log
      expect(logEntries).toHaveLength(3);
      expect(logEntries.find((le) => le.entryNr === 2)?.succes).toBe(false);
    });

    it("vangnet: onverwachte fout ná de mapping raakt alleen die entry", async () => {
      const kapot = maakEntry(2, { photos: null as unknown as EntryPayload["photos"] });
      const { response, resultaten } = await roepHandlerAan(maakPayload([maakEntry(1), kapot, maakEntry(3)]));

      expect(response.statusCode).toBe(200);
      expect(resultaten.map((r) => r.succes)).toEqual([true, false, true]);
      expect(resultaten[1]?.fout).toMatch(/^Onverwachte fout: /);
    });

    it("SOAP-fout in één entry: de andere entries slagen", async () => {
      vi.mocked(sendSoap)
        .mockResolvedValueOnce(soapResponseOk)
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce(soapResponseOk);
      const { response, resultaten } = await roepHandlerAan(maakPayload([maakEntry(1), maakEntry(2), maakEntry(3)]));

      expect(response.statusCode).toBe(200);
      expect(resultaten.filter((r) => r.succes)).toHaveLength(2);
    });

    it("geeft 500 als alle entries mislukken", async () => {
      const kapot = (nr: number) => maakEntry(nr, { recipient: null as unknown as string });
      const { response, resultaten } = await roepHandlerAan(maakPayload([kapot(1), kapot(2)]));

      expect(response.statusCode).toBe(500);
      expect(resultaten.every((r) => !r.succes)).toBe(true);
    });
  });

  describe("client-IP in de log", () => {
    it("gebruikt client_ip uit de body voor alle entries", async () => {
      const { logEntries } = await roepHandlerAan(maakPayload([maakEntry(1), maakEntry(2)], { client_ip: "203.0.113.7" }));
      expect(ipVanEntry(logEntries, 1)).toBe("203.0.113.7");
      expect(ipVanEntry(logEntries, 2)).toBe("203.0.113.7");
    });

    it("accepteert een IPv6-adres als client_ip", async () => {
      const { logEntries } = await roepHandlerAan(maakPayload([maakEntry(1)], { client_ip: "2001:db8::1" }));
      expect(ipVanEntry(logEntries, 1)).toBe("2001:db8::1");
    });

    it("zet een loopback client_ip om naar localhost", async () => {
      const { logEntries } = await roepHandlerAan(maakPayload([maakEntry(1)], { client_ip: "::1" }));
      expect(ipVanEntry(logEntries, 1)).toBe("localhost");
    });

    it.each([
      ["ontbreekt", undefined],
      ["is null", null],
      ["is een lege string", ""],
      ["is geen IP (formule)", "=HYPERLINK(\"http://x\")"],
      ["is geen IP (tekst)", "onbekend"],
      ["is geen string", 12345],
    ])("valt terug op x-forwarded-for als client_ip %s", async (_, client_ip) => {
      const payload = { ...maakPayload([maakEntry(1)]), client_ip };
      const { logEntries } = await roepHandlerAan(payload);
      expect(ipVanEntry(logEntries, 1)).toBe(HEADER_IP);
    });

    it("gebruikt het eerste adres uit x-forwarded-for als client_ip ontbreekt", async () => {
      const { logEntries } = await roepHandlerAan(maakPayload([maakEntry(1)]), { "x-forwarded-for": `${HEADER_IP}, 10.0.0.1` });
      expect(ipVanEntry(logEntries, 1)).toBe(HEADER_IP);
    });
  });
});
