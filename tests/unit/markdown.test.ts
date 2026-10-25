import { describe, expect, it } from "vitest";
import { stripMarkdown } from "@/lib/markdown";

describe("plain-text email bodies", () => {
  it("keep link addresses so text-only mail clients can follow them", () => {
    const text = stripMarkdown("Dear Bro Smith,\n\n[Accept your invitation](https://app.hertsmentors.com/invite/abc?x=1&y=2)");
    expect(text).toContain("Accept your invitation (https://app.hertsmentors.com/invite/abc?x=1&y=2)");
  });
});
