import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSoapEnvelope,
  extractCustomLinkResponse,
  parseStoreResults,
  sendSoap,
} from "../soap-client.js";

// ---------------------------------------------------------------------------
// buildSoapEnvelope
// ---------------------------------------------------------------------------

describe("buildSoapEnvelope", () => {
  it("bevat gebruikersnaam en wachtwoord", () => {
    const envelope = buildSoapEnvelope("<xml/>", "user123", "pass456");
    expect(envelope).toContain("<UserName");
    expect(envelope).toContain("user123");
    expect(envelope).toContain("pass456");
  });

  it("escapet speciale tekens in credentials", () => {
    const envelope = buildSoapEnvelope("<xml/>", "user&<>", "p@ss'\"");
    expect(envelope).toContain("user&amp;&lt;&gt;");
    expect(envelope).toContain("p@ss&apos;&quot;");
  });

  it("escapet de Custom Link XML in ARequest", () => {
    const envelope = buildSoapEnvelope("<CustomLinkXml/>", "u", "p");
    expect(envelope).toContain("&lt;CustomLinkXml/&gt;");
  });
});

// ---------------------------------------------------------------------------
// sendSoap
// ---------------------------------------------------------------------------

describe("sendSoap", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POST naar de opgegeven URL met juiste headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<response/>",
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendSoap("<envelope/>", "http://example.com/soap");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://example.com/soap");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["Content-Type"]).toContain("text/xml");
  });

  it("gooit een fout bij HTTP 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }));

    await expect(sendSoap("<envelope/>", "http://example.com/soap")).rejects.toThrow(
      "SOAP HTTP 500"
    );
  });
});

// ---------------------------------------------------------------------------
// extractCustomLinkResponse
// ---------------------------------------------------------------------------

describe("extractCustomLinkResponse", () => {
  it("extraheert en unescapet de return-tag", () => {
    const soap = `<soap:Body><return>&lt;Result&gt;OK&lt;/Result&gt;</return></soap:Body>`;
    expect(extractCustomLinkResponse(soap)).toBe("<Result>OK</Result>");
  });

  it("valt terug op ExecuteRequestResult", () => {
    const soap = `<ExecuteRequestResult>inhoud</ExecuteRequestResult>`;
    expect(extractCustomLinkResponse(soap)).toBe("inhoud");
  });

  it("geeft de ruwe response terug als geen tag gevonden", () => {
    const soap = "<onbekend>data</onbekend>";
    expect(extractCustomLinkResponse(soap)).toBe(soap);
  });
});

// ---------------------------------------------------------------------------
// parseStoreResults
// ---------------------------------------------------------------------------

describe("parseStoreResults", () => {
  const sampleResponse = `
    <EoStoreResultList>
      <EoStoreResult Type="TEoStoreResult">
        <Id>12345</Id>
        <IdOld>-1000</IdOld>
        <StoreResult>srInserted</StoreResult>
        <StoreDescription></StoreDescription>
      </EoStoreResult>
    </EoStoreResultList>`;

  it("parseert een enkel resultaat correct", () => {
    const results = parseStoreResults(sampleResponse);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "12345",
      idOud: "-1000",
      resultaat: "srInserted",
      omschrijving: "",
    });
  });

  it("geeft lege array terug bij ontbrekende StoreResult-tags", () => {
    expect(parseStoreResults("<empty/>")).toEqual([]);
  });

  it("parseert meerdere resultaten", () => {
    const multi = `
      <EoStoreResult><Id>1</Id><IdOld>-1000</IdOld><StoreResult>srInserted</StoreResult><StoreDescription/></EoStoreResult>
      <EoStoreResult><Id>2</Id><IdOld>-1000</IdOld><StoreResult>srUpdated</StoreResult><StoreDescription/></EoStoreResult>`;
    const results = parseStoreResults(multi);
    expect(results).toHaveLength(2);
    expect(results[1]?.resultaat).toBe("srUpdated");
  });
});
