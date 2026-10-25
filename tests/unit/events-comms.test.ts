import { describe, expect, it } from "vitest";
import { buildIcs, icsDate, icsEscape, icsFileName, icsFold } from "@/server/events/ics";
import { hashFeedToken, newFeedToken, tokenFromPath } from "@/server/events/feed-tokens";
import { cleanFilters, describeAudience, parseAudience, personalise, withoutPerson, withPerson } from "@/server/comms/audience";
import { monthGrid, parseMonth, shiftMonth, toLocalInput, ukDate } from "@/components/events/datetime";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("ICS", () => {
  it("formats UTC dates and escapes text", () => {
    expect(icsDate("2026-11-12T19:30:00.000Z")).toBe("20261112T193000Z");
    expect(icsEscape("a, b; c\\d\nnext")).toBe("a\\, b\\; c\\\\d\\nnext");
  });
  it("folds long lines at 75 octets", () => {
    const folded = icsFold(`SUMMARY:${"x".repeat(200)}`);
    for (const line of folded.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"x".repeat(200)}`);
  });
  it("builds a calendar with cancelled events marked", () => {
    const ics = buildIcs([{ id: "e1", title: "Workshop", starts_at: "2026-11-12T19:00:00Z", ends_at: "2026-11-12T21:00:00Z", status: "cancelled", location: "Hall, Room 1" }], { now: new Date("2026-10-01T00:00:00Z") });
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("UID:e1@mentoring-hub");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SUMMARY:Cancelled: Workshop");
    expect(ics).toContain("LOCATION:Hall\\, Room 1");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("makes safe file names", () => {
    expect(icsFileName("Mentoring: Skills & Practice!")).toBe("mentoring-skills-practice.ics");
    expect(icsFileName("???")).toBe("event.ics");
  });
});

describe("Feed tokens", () => {
  it("stores only a sha256 hash and accepts .ics suffixes", () => {
    const { token, hash } = newFeedToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashFeedToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
    expect(tokenFromPath(`${token}.ics`)).toBe(token);
    expect(tokenFromPath("../etc/passwd")).toBeNull();
    expect(tokenFromPath("short")).toBeNull();
  });
});

describe("Campaign audiences", () => {
  it("drops empty and invalid filters so the database never sees an empty list", () => {
    expect(cleanFilters({ lodge_ids: [], offices: ["lodge_mentor", "DROP TABLE"], event_statuses: ["attended"], area_ids: ["not-a-uuid"] }))
      .toEqual({ offices: ["lodge_mentor"] });
    expect(cleanFilters({ event_id: A, event_statuses: ["attended"] })).toEqual({ event_id: A, event_statuses: ["attended"] });
    expect(cleanFilters({ initiated_to: "2025-01-01" })).toEqual({ initiated_to: "2025-01-01", initiated_from: "1900-01-01" });
  });
  it("parses stored audiences and keeps include and exclude disjoint", () => {
    const a = parseAudience({ filters: { lodge_ids: [A] }, include: [A, B, "junk"], exclude: [B] });
    expect(a).toEqual({ filters: { lodge_ids: [A] }, include: [A], exclude: [B] });
    expect(withPerson(a, B, "include")).toEqual({ filters: { lodge_ids: [A] }, include: [A, B], exclude: [] });
    expect(withPerson(a, A, "exclude").include).toEqual([]);
    expect(withoutPerson(a, B).exclude).toEqual([]);
    expect(parseAudience(null)).toEqual({ filters: {}, include: [], exclude: [] });
  });
  it("describes the audience in plain English", () => {
    const d = describeAudience({ lodge_ids: [A] }, "allocated", { lodges: new Map([[A, "Example Lodge No. 1"]]) });
    expect(d).toEqual(["Lodges allocated to the sender", "Lodges: Example Lodge No. 1"]);
  });
  it("personalises like the sending job", () => {
    expect(personalise("Dear {{first_name}} ({{ name }})", "W Bro John Smith")).toBe("Dear John (W Bro John Smith)");
  });
});

describe("Calendar dates", () => {
  it("uses UK time for inputs and dates", () => {
    expect(toLocalInput("2026-07-01T18:00:00Z")).toBe("2026-07-01T19:00");
    expect(toLocalInput("2026-12-01T18:00:00Z")).toBe("2026-12-01T18:00");
    expect(ukDate("2026-07-01T23:30:00Z")).toBe("2026-07-02");
  });
  it("builds Monday-start month grids", () => {
    const g = monthGrid("2026-11");
    expect(g[0][0]).toBe("2026-10-26");
    expect(g.flat()).toContain("2026-11-30");
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(parseMonth("2026-13", "2026-10")).toBe("2026-10");
  });
});
