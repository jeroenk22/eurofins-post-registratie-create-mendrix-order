#!/usr/bin/env node
/**
 * Gegenereerd bij build-time — werkt zowel lokaal (via git) als op Netlify (via COMMIT_REF).
 * Schrijft src/mendrix/version.generated.ts zodat de Netlify Function runtime
 * geen git of build-env vars nodig heeft.
 */
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getPrNumber() {
  const ghRef = process.env.GITHUB_REF ?? "";
  const fromRef =
    ghRef.match(/^refs\/pull\/(\d+)\/merge$/)?.[1] ??
    ghRef.match(/^refs\/pull\/(\d+)\/head$/)?.[1];
  if (fromRef) return fromRef;

  const pr =
    process.env.GITHUB_PR_NUMBER ??
    process.env.PR_NUMBER ??
    process.env.PULL_REQUEST ??
    process.env.NETLIFY_PULL_REQUEST;
  if (pr && pr !== "false") return pr;

  return "0";
}

function getCommitCount() {
  try {
    const count = execSync("git rev-list --count HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return count || undefined;
  } catch {
    return undefined;
  }
}

const year = new Date().getFullYear();
const pr = getPrNumber();
const commits = getCommitCount();
const version = !commits && pr === "0" ? "" : `${year}.${pr}.${commits ?? "0"}`;

const outPath = join(__dirname, "../src/mendrix/version.generated.ts");
writeFileSync(
  outPath,
  `// Auto-generated bij build — niet handmatig aanpassen\nexport const GENERATED_API_VERSION = ${JSON.stringify(version)};\n`,
);
console.log(`[generate-version] apiVersion: ${version || "(leeg — geen git/PR info)"}`);
