import { createHmac, timingSafeEqual } from "crypto";
import type { Handler, HandlerEvent, HandlerResponse } from "@netlify/functions";
import { loadConfig } from "../../src/mendrix/config.js";
import { processEntry } from "../../src/mendrix/order-service.js";
import type { WebhookPayload } from "../../src/mendrix/types.js";

export function verifySignature(body: string, timestamp: string, signature: string, secret: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const secret = process.env["WEBHOOK_SECRET"];
  const timestamp = event.headers["x-timestamp"] ?? "";
  const signature = event.headers["x-signature"] ?? "";
  if (!secret || !verifySignature(event.body ?? "", timestamp, signature, secret)) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: (err as Error).message }) };
  }

  let webhooks: WebhookPayload[];
  try {
    const parsed = JSON.parse(event.body ?? "[]") as WebhookPayload | WebhookPayload[];
    webhooks = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Ongeldige JSON body" }) };
  }

  // Elke webhook bevat meerdere entries — elke entry wordt een aparte order
  const allEntries = webhooks.flatMap((webhook) =>
    webhook.entries.map((entry) => ({ entry, webhook }))
  );
  console.log(`[create-order] ${allEntries.length} entr${allEntries.length === 1 ? "y" : "ies"} ontvangen`);

  const resultaten = await Promise.all(
    allEntries.map(({ entry, webhook }) => processEntry(entry, webhook, config))
  );

  const statusCode = resultaten.some((r) => r.succes) ? 200 : 500;
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resultaten }),
  };
};
