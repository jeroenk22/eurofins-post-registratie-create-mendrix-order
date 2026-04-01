import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "../create-order.js";

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
