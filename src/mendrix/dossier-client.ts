async function fetchAccessToken(apiUrl: string, apiToken: string): Promise<string> {
  const base = apiUrl.replace(/\/$/, "");
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
  const accessToken = await fetchAccessToken(apiUrl, apiToken);

  const base = apiUrl.replace(/\/$/, "");
  const url = `${base}/dossier/dossiers/${domain}/${orderId}/contents/${encodeURIComponent(filename)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Authorization: `Bearer ${accessToken}`,
      },
      body: buffer,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Dossier upload HTTP ${res.status} voor ${filename}: ${body.slice(0, 300)}`);
  }
}
