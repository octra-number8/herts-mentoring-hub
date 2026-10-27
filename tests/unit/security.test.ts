import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/safe-redirect";

describe("redirects after sign-in stay on the Hub", () => {
  it("keeps ordinary internal paths, with query and fragment", () => {
    expect(safeInternalPath("/academy")).toBe("/academy");
    expect(safeInternalPath("/academy/events/abc?tab=2#top")).toBe("/academy/events/abc?tab=2#top");
    expect(safeInternalPath("/reset-password")).toBe("/reset-password");
  });

  it("refuses anything a browser would send to another site", () => {
    for (const bad of [
      "//evil.example", "/\\evil.example", "/\\/evil.example", "/\t/evil.example", "/\n/evil.example",
      "https://evil.example", "javascript:alert(1)", "evil.example", "", " /academy",
    ]) {
      expect(safeInternalPath(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(42)).toBeNull();
  });

  it("never produces a value that resolves off-site", () => {
    for (const v of ["/%5Cevil.example", "/..//evil.example", "/./\\evil.example", "/a/../../evil.example"]) {
      const out = safeInternalPath(v);
      if (out) expect(new URL(out, "https://app.hertsmentors.com").origin).toBe("https://app.hertsmentors.com");
    }
  });
});

describe("record text placed in system emails", () => {
  it("cannot add a link or formatting", async () => {
    const { escapeMarkdown, renderMarkdown } = await import("@/lib/markdown");
    const html = renderMarkdown(`Dear ${escapeMarkdown("[Click here](https://evil.example) *now*")},`);
    expect(html).not.toContain("<a");
    expect(html).not.toContain("<em>");
    expect(html).toContain("[Click here](https://evil.example) *now*");
  });
});

describe("email attachments", () => {
  it("are accepted only from the campaign's own folder or scheduled reports", async () => {
    const { attachmentAllowed } = await import("@/server/email/attachments");
    const org = "org-1", camp = "camp-1";
    expect(attachmentAllowed(org, { bucket: "comms-attachments", path: `${org}/comms/${camp}/a.pdf`, filename: "a.pdf" }, camp)).toBe(true);
    expect(attachmentAllowed(org, { bucket: "documents", path: `${org}/reports/r/2026-10-27.xlsx`, filename: "r.xlsx" })).toBe(true);
    expect(attachmentAllowed(org, { bucket: "certificates", path: `${org}/p/x.pdf`, filename: "x.pdf" }, camp)).toBe(false);
    expect(attachmentAllowed(org, { bucket: "comms-attachments", path: `${org}/comms/other/a.pdf`, filename: "a.pdf" }, camp)).toBe(false);
    expect(attachmentAllowed(org, { bucket: "comms-attachments", path: `${org}/comms/${camp}/../../x`, filename: "x" }, camp)).toBe(false);
    expect(attachmentAllowed(org, { bucket: "documents", path: `${org}/reports/x.xlsx`, filename: "x" }, camp)).toBe(false);
    expect(attachmentAllowed(org, { bucket: "documents", path: `other/reports/x.xlsx`, filename: "x" })).toBe(false);
  });
});

describe("secret scanning rules", () => {
  // Fake values only. tests/fixtures/secret-scan/ is the one folder the scanner skips.
  const lines = (f: string) => readFileSync(`tests/fixtures/secret-scan/${f}`, "utf8").split("\n").filter(Boolean);

  it("find realistic secrets, including prefixed and lower-case names", async () => {
    const { secretRulesMatching: hits } = await import("../../security/secret-rules.mjs");
    for (const line of lines("should-match.txt")) expect(hits(line), line).not.toEqual([]);
  });

  it("ignore references, file names and public local defaults", async () => {
    const { secretRulesMatching: hits } = await import("../../security/secret-rules.mjs");
    for (const line of lines("should-not-match.txt")) expect(hits(line), line).toEqual([]);
  });
});
