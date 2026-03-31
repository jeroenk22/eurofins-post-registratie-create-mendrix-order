import type { Config } from "./types.js";

export function loadConfig(): Config {
  const vars = {
    MENDRIX_SOAP_URL:        process.env["MENDRIX_SOAP_URL"],
    MENDRIX_SOAP_USER:       process.env["MENDRIX_SOAP_USER"],
    MENDRIX_SOAP_PASS:       process.env["MENDRIX_SOAP_PASS"],
    MENDRIX_API_URL:         process.env["MENDRIX_API_URL"],
    MENDRIX_API_TOKEN:       process.env["MENDRIX_API_TOKEN"],
    MENDRIX_CLIENT_ID:       process.env["MENDRIX_CLIENT_ID"],
  };

  const missing = Object.entries(vars)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(`Ontbrekende environment variables: ${missing.join(", ")}`);
  }

  return {
    soapUrl:       vars.MENDRIX_SOAP_URL!,
    soapUser:      vars.MENDRIX_SOAP_USER!,
    soapPass:      vars.MENDRIX_SOAP_PASS!,
    apiUrl:        vars.MENDRIX_API_URL!,
    apiToken:      vars.MENDRIX_API_TOKEN!,
    clientId:      parseInt(vars.MENDRIX_CLIENT_ID!, 10),
    dossierDomain: process.env["MENDRIX_DOSSIER_DOMAIN"] ?? "orders",
  };
}
