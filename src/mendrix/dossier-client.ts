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
  const url = `${base}/dossier/dossiers/${domain}/${orderId}/contents/${encodeURIComponent(filename)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Authorization: `Bearer ${apiToken}`,
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
