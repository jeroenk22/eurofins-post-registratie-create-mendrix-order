import { fetchWithTimeout } from "./http-utils.js";

async function fetchAccessToken(base: string, apiToken: string): Promise<string> {
  const res = await fetch(`${base}/account/login-api-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: apiToken }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mendrix login HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json() as { data: { items: Array<{ access: string }> } };
  const access = json.data?.items?.[0]?.access;
  if (!access) throw new Error("Geen access token in login response");
  return access;
}

export async function uploadPhotoDossier(
  apiUrl: string,
  apiToken: string,
  domain: string,
  orderId: string,
  filename: string,
  buffer: Buffer,
  timeoutMs = 30_000
): Promise<void> {
  const base = apiUrl.replace(/\/$/, "");
  const accessToken = await fetchAccessToken(base, apiToken);

  const url = `${base}/dossier/dossiers/${domain}/${orderId}/contents/${encodeURIComponent(filename)}`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      Authorization: `Bearer ${accessToken}`,
    },
    body: buffer,
  }, timeoutMs);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Dossier upload HTTP ${res.status} voor ${filename}: ${body.slice(0, 300)}`);
  }
}
