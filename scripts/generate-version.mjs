#!/usr/bin/env node
/**
 * Berekent de API-versie bij build-time en schrijft deze weg naar version.generated.ts.
 * Werkt zowel lokaal (via git) als op Netlify (via build env vars).
 * Logica staat in version-utils.mjs zodat die afzonderlijk testbaar is.
 */
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getPrNumber, getCommitIdentifier, buildVersion } from "./version-utils.mjs";

const envVersion = process.env.API_VERSION?.trim() || undefined;
const year = new Date().getFullYear();
const pr = envVersion ? "0" : getPrNumber();
const identifier = envVersion ? undefined : getCommitIdentifier(execSync);
const version = buildVersion(year, pr, identifier, envVersion);

const outPath = join(dirname(fileURLToPath(import.meta.url)), "../src/mendrix/version.generated.ts");
try {
  writeFileSync(
    outPath,
    `// Auto-generated bij build — niet handmatig aanpassen\nexport const GENERATED_API_VERSION = ${JSON.stringify(version)};\n`,
  );
} catch (err) {
  console.error(`[generate-version] Fout bij schrijven naar ${outPath}:`, err.message);
  process.exit(1);
}

console.log(`[generate-version] apiVersion: ${version || "(leeg — geen git/PR info)"}`);
