import { afterEach, describe, expect, it, vi } from "vitest";
import { appendManyToSheets, appendToSheets } from "../sheets-logger.js";
import type { SheetsLogEntry } from "../types.js";

// Mock crypto zodat we geen echte RSA-sleutel nodig hebben
vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return {
    ...actual,
    createSign: () => ({ update: () => {}, sign: () => "mock-signature" }),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const TEST_SA = JSON.stringify({
  client_email: "test@project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----",
});

const TOKEN_OK = {
  ok: true,
  json: async () => ({ access_token: "mock-token" }),
};

const SHEETS_OK = {
  ok: true,
  text: async () => "",
};

const ENTRY: SheetsLogEntry = {
  datum: "2026-04-01",
  tijd: "12:00:00",
  entryNr: 1,
  aangemeldDoor: "Test User",
  ontvanger: "Test BV",
  recipientType: "monsternemer",
  spoed: false,
  land: "Nederland",
  clientId: 1234,
  productId: 42,
  orderId: "99",
  soapResultaat: "srInserted",
  soapOmschrijving: "",
  fotosAangevraagd: 0,
  fotosOk: 0,
  fotosMislukt: 0,
  succes: true,
  fout: "",
  soapEndpoint: "https://soap.example.com",
  apiEndpoint: "https://api.example.com",
  clientIp: "127.0.0.1",
  submittedAt: "2026-04-01T10:00:00Z",
  appVersion: "2026.49.164",
  apiVersion: "1.0.0",
};

describe("appendManyToSheets", () => {
  it("doet niets als GOOGLE_SERVICE_ACCOUNT ontbreekt", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", "");
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    await appendManyToSheets([ENTRY]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("doet niets als GOOGLE_SPREADSHEET_ID ontbreekt", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "");
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    await appendManyToSheets([ENTRY]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("doet niets bij lege entries lijst", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    await appendManyToSheets([]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("haalt een access token op bij Google OAuth", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(SHEETS_OK);
    vi.stubGlobal("fetch", mockFetch);

    await appendManyToSheets([ENTRY]);

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(opts.method).toBe("POST");
  });

  it("stuurt rijen naar de PRODUCTION tab als NETLIFY_DEV niet 'true' is", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    vi.stubEnv("NETLIFY_DEV", "false");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(SHEETS_OK);
    vi.stubGlobal("fetch", mockFetch);

    await appendManyToSheets([ENTRY]);

    const [url] = mockFetch.mock.calls[1] as [string];
    expect(url).toContain("PRODUCTION");
    expect(url).toContain("sheet123");
  });

  it("stuurt rijen naar de DEVELOPMENT tab als NETLIFY_DEV=true", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    vi.stubEnv("NETLIFY_DEV", "true");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(SHEETS_OK);
    vi.stubGlobal("fetch", mockFetch);

    await appendManyToSheets([ENTRY]);

    const [url] = mockFetch.mock.calls[1] as [string];
    expect(url).toContain("DEVELOPMENT");
  });

  it("stuurt meerdere rijen in één API aanroep", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(SHEETS_OK);
    vi.stubGlobal("fetch", mockFetch);

    await appendManyToSheets([ENTRY, ENTRY]);

    expect(mockFetch).toHaveBeenCalledTimes(2); // 1x token + 1x append
    const [, opts] = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { values: unknown[][] };
    expect(body.values).toHaveLength(2);
  });

  it("stuurt Authorization header met Bearer token naar Sheets API", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(SHEETS_OK);
    vi.stubGlobal("fetch", mockFetch);

    await appendManyToSheets([ENTRY]);

    const [, opts] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer mock-token");
  });

  it("gooit een fout als Google token request mislukt", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 401, text: async () => "Unauthorized",
    }));

    await expect(appendManyToSheets([ENTRY])).rejects.toThrow("Google token HTTP 401");
  });

  it("gooit een fout als Sheets API mislukt", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" });
    vi.stubGlobal("fetch", mockFetch);

    await expect(appendManyToSheets([ENTRY])).rejects.toThrow("Sheets API HTTP 403");
  });

  it("gooit een fout bij ongeldig service account JSON", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", "dit-is-geen-json");
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    vi.stubGlobal("fetch", vi.fn());

    await expect(appendManyToSheets([ENTRY])).rejects.toThrow("GOOGLE_SERVICE_ACCOUNT bevat geen geldige JSON");
  });

  it("bevat api_version als laatste kolom in de rij", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(SHEETS_OK);
    vi.stubGlobal("fetch", mockFetch);

    await appendManyToSheets([ENTRY]);

    const [, opts] = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { values: unknown[][] };
    const row = body.values[0]!;
    expect(row[row.length - 1]).toBe("1.0.0");
  });

  it("bevat app_version als een-na-laatste kolom in de rij", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(SHEETS_OK);
    vi.stubGlobal("fetch", mockFetch);

    await appendManyToSheets([ENTRY]);

    const [, opts] = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { values: unknown[][] };
    const row = body.values[0]!;
    expect(row[row.length - 2]).toBe("2026.49.164");
  });

  it("schrijft lege string als app_version ontbreekt (backwards compat)", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(SHEETS_OK);
    vi.stubGlobal("fetch", mockFetch);

    const entryZonderVersion: SheetsLogEntry = { ...ENTRY, appVersion: "" };
    await appendManyToSheets([entryZonderVersion]);

    const [, opts] = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { values: unknown[][] };
    const row = body.values[0]!;
    expect(row[row.length - 2]).toBe("");
    expect(row[row.length - 1]).toBe("1.0.0");
  });

  it("schrijft lege string als api_version ontbreekt (backwards compat)", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(SHEETS_OK);
    vi.stubGlobal("fetch", mockFetch);

    const entryZonderApiVersion: SheetsLogEntry = { ...ENTRY, apiVersion: "" };
    await appendManyToSheets([entryZonderApiVersion]);

    const [, opts] = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { values: unknown[][] };
    const row = body.values[0]!;
    expect(row[row.length - 2]).toBe("2026.49.164");
    expect(row[row.length - 1]).toBe("");
  });
});

describe("appendToSheets", () => {
  it("roept de Sheets API aan met één rij", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT", TEST_SA);
    vi.stubEnv("GOOGLE_SPREADSHEET_ID", "sheet123");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(SHEETS_OK);
    vi.stubGlobal("fetch", mockFetch);

    await appendToSheets(ENTRY);

    const [, opts] = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { values: unknown[][] };
    expect(body.values).toHaveLength(1);
  });
});
