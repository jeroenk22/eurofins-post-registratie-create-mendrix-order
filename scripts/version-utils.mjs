/**
 * Testbare hulpfuncties voor versieberekening bij build-time.
 * Alle functies ontvangen dependencies via parameters zodat ze zonder vi.mock testbaar zijn.
 */

export function getPrNumber(env = process.env) {
  // GitHub Actions: GITHUB_REF bevat refs/pull/<nr>/merge of /head
  const ghRef = env.GITHUB_REF ?? "";
  const fromRef =
    ghRef.match(/^refs\/pull\/(\d+)\/merge$/)?.[1] ??
    ghRef.match(/^refs\/pull\/(\d+)\/head$/)?.[1];
  if (fromRef) return fromRef;

  // Expliciete PR env vars (Netlify: PULL_REQUEST, CircleCI: CI_PULL_REQUEST, etc.)
  const pr =
    env.GITHUB_PR_NUMBER ??
    env.PR_NUMBER ??
    env.PULL_REQUEST ??
    env.NETLIFY_PULL_REQUEST;
  if (pr && pr !== "false") return pr;

  return "0";
}

export function getCommitCount(execSyncFn) {
  try {
    const count = execSyncFn("git rev-list --count HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return count || undefined;
  } catch {
    return undefined;
  }
}

export function getCommitIdentifier(execSyncFn, env = process.env) {
  const commitCount = getCommitCount(execSyncFn);
  if (commitCount) return commitCount;

  // Fallback: eerste 7 tekens van commit hash via Netlify COMMIT_REF
  const commitRef = env.COMMIT_REF ?? env.SOURCE_VERSION ?? env.GIT_COMMIT;
  if (!commitRef) return undefined;
  return commitRef.toString().trim().slice(0, 7) || undefined;
}

/** @param {string | undefined} [envVersion] */
export function buildVersion(year, pr, identifier, envVersion = undefined) {
  if (envVersion) return envVersion;
  if (identifier && pr !== "0") return `${year}.${pr}.${identifier}`;
  if (identifier) return `${year}.${identifier}`;
  if (pr !== "0") return `${year}.${pr}`;
  return "";
}
