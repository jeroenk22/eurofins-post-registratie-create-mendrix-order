import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getPrNumber,
  getCommitCount,
  getCommitIdentifier,
  buildVersion,
} from "../version-utils.mjs";

const mockExecSync = vi.fn();

beforeEach(() => {
  vi.unstubAllEnvs();
  mockExecSync.mockReset();
});

// ---------------------------------------------------------------------------
// getPrNumber
// ---------------------------------------------------------------------------

describe("getPrNumber", () => {
  it("leest PR-nummer uit GITHUB_REF refs/pull/16/merge", () => {
    expect(getPrNumber({ GITHUB_REF: "refs/pull/16/merge" })).toBe("16");
  });

  it("leest PR-nummer uit GITHUB_REF refs/pull/16/head", () => {
    expect(getPrNumber({ GITHUB_REF: "refs/pull/16/head" })).toBe("16");
  });

  it("negeert GITHUB_REF als het geen PR-ref is", () => {
    expect(getPrNumber({ GITHUB_REF: "refs/heads/main" })).toBe("0");
  });

  it("gebruikt PULL_REQUEST env var", () => {
    expect(getPrNumber({ PULL_REQUEST: "42" })).toBe("42");
  });

  it("negeert NETLIFY_PULL_REQUEST=false", () => {
    expect(getPrNumber({ NETLIFY_PULL_REQUEST: "false" })).toBe("0");
  });

  it("gebruikt GITHUB_PR_NUMBER boven andere env vars", () => {
    expect(getPrNumber({ GITHUB_PR_NUMBER: "99", PULL_REQUEST: "42" })).toBe("99");
  });

  it("geeft 0 als geen env vars beschikbaar zijn", () => {
    expect(getPrNumber({})).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// getCommitCount
// ---------------------------------------------------------------------------

describe("getCommitCount", () => {
  it("geeft commit count terug als git beschikbaar is", () => {
    mockExecSync.mockReturnValue("159\n");
    expect(getCommitCount(mockExecSync)).toBe("159");
  });

  it("geeft undefined als git niet beschikbaar is", () => {
    mockExecSync.mockImplementation(() => { throw new Error("git not found"); });
    expect(getCommitCount(mockExecSync)).toBeUndefined();
  });

  it("geeft undefined als git lege string teruggeeft", () => {
    mockExecSync.mockReturnValue("   ");
    expect(getCommitCount(mockExecSync)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getCommitIdentifier
// ---------------------------------------------------------------------------

describe("getCommitIdentifier", () => {
  it("gebruikt commit count als git beschikbaar is", () => {
    mockExecSync.mockReturnValue("159");
    expect(getCommitIdentifier(mockExecSync, {})).toBe("159");
  });

  it("valt terug op COMMIT_REF hash als git niet beschikbaar is", () => {
    mockExecSync.mockImplementation(() => { throw new Error("no git"); });
    expect(getCommitIdentifier(mockExecSync, { COMMIT_REF: "abc1234567890" })).toBe("abc1234");
  });

  it("valt terug op SOURCE_VERSION als COMMIT_REF ontbreekt", () => {
    mockExecSync.mockImplementation(() => { throw new Error("no git"); });
    expect(getCommitIdentifier(mockExecSync, { SOURCE_VERSION: "def5678901234" })).toBe("def5678");
  });

  it("geeft undefined als git en alle env vars ontbreken", () => {
    mockExecSync.mockImplementation(() => { throw new Error("no git"); });
    expect(getCommitIdentifier(mockExecSync, {})).toBeUndefined();
  });

  it("geeft undefined als COMMIT_REF een lege string is", () => {
    mockExecSync.mockImplementation(() => { throw new Error("no git"); });
    expect(getCommitIdentifier(mockExecSync, { COMMIT_REF: "   " })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildVersion
// ---------------------------------------------------------------------------

describe("buildVersion", () => {
  it("geeft envVersion terug als die gezet is", () => {
    expect(buildVersion(2026, "0", undefined, "1.2.3")).toBe("1.2.3");
  });

  it("bouwt versie met PR en identifier: {jaar}.{pr}.{identifier}", () => {
    expect(buildVersion(2026, "16", "159")).toBe("2026.16.159");
  });

  it("bouwt versie zonder PR maar met identifier: {jaar}.{identifier}", () => {
    expect(buildVersion(2026, "0", "159")).toBe("2026.159");
  });

  it("bouwt versie met PR maar zonder identifier: {jaar}.{pr}", () => {
    expect(buildVersion(2026, "16", undefined)).toBe("2026.16");
  });

  it("geeft lege string als alles ontbreekt", () => {
    expect(buildVersion(2026, "0", undefined)).toBe("");
  });

  it("envVersion heeft prioriteit boven alle andere parameters", () => {
    expect(buildVersion(2026, "16", "999", "override")).toBe("override");
  });
});
