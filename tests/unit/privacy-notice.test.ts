import { describe, expect, it } from "vitest";
import { PRIVACY_NOTICE_MARKDOWN, PRIVACY_NOTICE_UPDATED, privacyNoticeIsDraft, privacyNoticePlaceholders } from "@/content/privacy-notice";

describe("privacy notice", () => {
  it("covers what UK GDPR Articles 13 and 14 require (ICO right to be informed)", () => {
    for (const heading of [
      "Who is responsible for your information", "What information the Hub holds", "Where the information comes from",
      "Why the information is used, and the lawful basis", "Sensitive information", "Who can see your information",
      "Transfers outside the UK", "How long information is kept", "Your rights", "Complaints", "Cookies", "Children",
      "Changes to this notice",
    ]) expect(PRIVACY_NOTICE_MARKDOWN, heading).toContain(`## ${heading}`);
    expect(PRIVACY_NOTICE_MARKDOWN).toMatch(/\*\*You have the right to object\*\*/);
    expect(PRIVACY_NOTICE_MARKDOWN).toMatch(/Information Commissioner/);
    expect(PRIVACY_NOTICE_UPDATED).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  });

  it("stays marked as a draft while any owner facts are unconfirmed", () => {
    expect(privacyNoticePlaceholders()).toBeGreaterThan(0);
    expect(privacyNoticeIsDraft()).toBe(true);
  });

  it("follows the house style: no em-dashes, no consent tick-box wording", () => {
    expect(PRIVACY_NOTICE_MARKDOWN).not.toContain("—");
    expect(PRIVACY_NOTICE_MARKDOWN).not.toMatch(/by (using|ticking).*you (consent|agree)/i);
  });
});
