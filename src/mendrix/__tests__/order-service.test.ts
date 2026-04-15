import { describe, expect, it, vi } from "vitest";
vi.mock("../version.generated.js", () => ({ GENERATED_API_VERSION: "2026.16.159" }));
import { processEntry } from "../order-service.js";
import type { Config, EntryPayload, WebhookPayload } from "../types.js";

const config: Config = {
  soapUrl:       "http://soap.example.com/",
  soapUser:      "user",
  soapPass:      "pass",
  apiUrl:        "http://api.example.com/",
  apiToken:      "token",
  dossierDomain: "orders",
};

const sender: Pick<WebhookPayload, "sender_name" | "sender_phone" | "sender_email" | "app_version"> = {
  sender_name:  "Jeroen",
  sender_phone: "0610451806",
  sender_email: "j@tron.nl",
  app_version:  "2026.49.164",
};

const entry: EntryPayload = {
  entry_number: 1,
  shelf: "Schap 1",
  recipient: "K306 - Koen Weghorst (Halle)",
  colli: 2,
  colli_omschrijvingen: ["Doos", "Emmer"],
  spoed: true,
  photo_count: 0,
  photos: [],
};

// Geslaagde SOAP response met orderId 42
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

describe("processEntry", () => {
  it("geeft succes en orderId terug bij correcte SOAP response", async () => {
    const deps = {
      doSendSoap: vi.fn().mockResolvedValue(soapResponseOk),
      doUploadPhoto: vi.fn().mockResolvedValue(undefined),
    };

    const result = await processEntry(entry, sender, config, deps);

    expect(result.succes).toBe(true);
    expect(result.orderId).toBe("42");
  });

  it("geeft fout terug als SOAP mislukt", async () => {
    const deps = {
      doSendSoap: vi.fn().mockRejectedValue(new Error("verbinding geweigerd")),
      doUploadPhoto: vi.fn(),
    };

    const result = await processEntry(entry, sender, config, deps);

    expect(result.succes).toBe(false);
    expect(result.fout).toContain("SOAP fout");
    expect(deps.doUploadPhoto).not.toHaveBeenCalled();
  });

  it("geeft fout terug als StoreResult niet srInserted/srUpdated is", async () => {
    const badSoap = soapResponseOk
      .replace("srInserted", "srError")
      .replace(
        "&lt;StoreDescription&gt;&lt;/StoreDescription&gt;",
        "&lt;StoreDescription&gt;Duplicate reference&lt;/StoreDescription&gt;"
      );

    const deps = {
      doSendSoap: vi.fn().mockResolvedValue(badSoap),
      doUploadPhoto: vi.fn(),
    };

    const result = await processEntry(entry, sender, config, deps);

    expect(result.succes).toBe(false);
    expect(result.resultaat).toBe("srError");
  });

  it("uploadt foto's na succesvolle order aanmaak", async () => {
    const entryMetFotos: EntryPayload = {
      ...entry,
      photos: [
        { filename: "a.jpg", base64: "data:image/jpeg;base64,/9j/abc" },
        { filename: "b.png", base64: "data:image/png;base64,iVBO" },
      ],
    };

    const deps = {
      doSendSoap: vi.fn().mockResolvedValue(soapResponseOk),
      doUploadPhoto: vi.fn().mockResolvedValue(undefined),
    };

    const result = await processEntry(entryMetFotos, sender, config, deps);

    expect(deps.doUploadPhoto).toHaveBeenCalledTimes(2);
    expect(deps.doUploadPhoto).toHaveBeenCalledWith(
      config.apiUrl, config.apiToken, config.dossierDomain, "42", "foto_1.jpg",
      expect.any(Buffer)
    );
    expect(result.fotos).toHaveLength(2);
    expect(result.fotos?.[0]?.succes).toBe(true);
  });

  it("foto fout blokkeert niet de order — geeft gedeeltelijk resultaat", async () => {
    const entryMetFoto: EntryPayload = {
      ...entry,
      photos: [{ filename: "a.jpg", base64: "data:image/jpeg;base64,/9j/abc" }],
    };

    const deps = {
      doSendSoap: vi.fn().mockResolvedValue(soapResponseOk),
      doUploadPhoto: vi.fn().mockRejectedValue(new Error("upload mislukt")),
    };

    const result = await processEntry(entryMetFoto, sender, config, deps);

    expect(result.succes).toBe(true);
    expect(result.orderId).toBe("42");
    expect(result.fotos?.[0]?.succes).toBe(false);
    expect(result.fotos?.[0]?.fout).toContain("upload mislukt");
  });

  it("geeft geen fotos-array terug als er geen foto's zijn", async () => {
    const deps = {
      doSendSoap: vi.fn().mockResolvedValue(soapResponseOk),
      doUploadPhoto: vi.fn(),
    };

    const result = await processEntry(entry, sender, config, deps);

    expect(result.fotos).toBeUndefined();
    expect(deps.doUploadPhoto).not.toHaveBeenCalled();
  });

  it("neemt app_version op in de log entry", async () => {
    const deps = {
      doSendSoap: vi.fn().mockResolvedValue(soapResponseOk),
      doUploadPhoto: vi.fn(),
    };

    process.env.API_VERSION = "2026.99.999";
    let logEntry: import("../types.js").SheetsLogEntry | undefined;
    await processEntry(entry, sender, config, deps, "", (le) => { logEntry = le; });

    expect(logEntry?.appVersion).toBe("2026.49.164");
    expect(logEntry?.apiVersion).toBe("2026.99.999");
    delete process.env.API_VERSION;
  });

  it("gebruikt gegenereerde apiVersion als API_VERSION env var ontbreekt", async () => {
    const deps = {
      doSendSoap: vi.fn().mockResolvedValue(soapResponseOk),
      doUploadPhoto: vi.fn(),
    };

    delete process.env.API_VERSION;
    let logEntry: import("../types.js").SheetsLogEntry | undefined;
    await processEntry(entry, sender, config, deps, "", (le) => { logEntry = le; });

    expect(logEntry?.apiVersion).toBe("2026.16.159");
  });

  it("zet appVersion op lege string als app_version ontbreekt in de webhook", async () => {
    const senderZonderVersion: Pick<WebhookPayload, "sender_name" | "sender_phone" | "sender_email"> = {
      sender_name:  "Jeroen",
      sender_phone: "0610451806",
      sender_email: "j@tron.nl",
    };
    const deps = {
      doSendSoap: vi.fn().mockResolvedValue(soapResponseOk),
      doUploadPhoto: vi.fn(),
    };

    let logEntry: import("../types.js").SheetsLogEntry | undefined;
    await processEntry(entry, senderZonderVersion, config, deps, "", (le) => { logEntry = le; });

    expect(logEntry?.appVersion).toBe("");
    expect(logEntry?.apiVersion).toBe("2026.16.159");
  });
});
