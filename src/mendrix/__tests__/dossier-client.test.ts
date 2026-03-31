import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadPhotoDossier } from "../dossier-client.js";

afterEach(() => vi.unstubAllGlobals());

describe("uploadPhotoDossier", () => {
  const args = {
    apiUrl: "http://api.example.com/",
    apiToken: "token123",
    domain: "orders",
    orderId: "42",
    filename: "foto_1.jpg",
    buffer: Buffer.from("fake-image-data"),
  };

  it("POST naar het juiste dossier-endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", mockFetch);

    await uploadPhotoDossier(
      args.apiUrl, args.apiToken, args.domain, args.orderId, args.filename, args.buffer
    );

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.example.com/dossier/dossiers/orders/42/contents/foto_1.jpg");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer token123");
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/octet-stream");
    expect(options.method).toBe("POST");
  });

  it("encodeert spaties in bestandsnaam", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", mockFetch);

    await uploadPhotoDossier(
      args.apiUrl, args.apiToken, args.domain, args.orderId, "mijn foto.jpg", args.buffer
    );

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("mijn%20foto.jpg");
  });

  it("gooit een fout bij HTTP 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }));

    await expect(
      uploadPhotoDossier(args.apiUrl, args.apiToken, args.domain, args.orderId, args.filename, args.buffer)
    ).rejects.toThrow("Dossier upload HTTP 401");
  });

  it("verwijdert trailing slash uit apiUrl", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", mockFetch);

    await uploadPhotoDossier(
      "http://api.example.com/", args.apiToken, args.domain, args.orderId, args.filename, args.buffer
    );

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).not.toContain("//dossier");
  });
});
