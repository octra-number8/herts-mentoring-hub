import { describe, expect, it } from "vitest";
import {
  addMonths, aggregate, bandCounts, cohortRetention, compare, median, monthsDiff, previousQuarter, quarterLabel, quarterRange, suggestNarrative,
} from "@/server/reports/analysis";

describe("date helpers", () => {
  it("counts whole months", () => {
    expect(monthsDiff("2024-01-15", "2024-07-14")).toBe(5);
    expect(monthsDiff("2024-01-15", "2024-07-15")).toBe(6);
  });
  it("adds months, clamping to the end of the month", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2023-05-10", 12)).toBe("2024-05-10");
  });
  it("labels and bounds quarters", () => {
    expect(quarterLabel("2026-10-25")).toBe("2026 Q4");
    expect(quarterRange(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(previousQuarter("2026-10-25")).toEqual({ year: 2026, quarter: 3 });
    expect(previousQuarter("2026-02-01")).toEqual({ year: 2025, quarter: 4 });
  });
});

describe("cohort retention", () => {
  const today = "2026-10-25";
  it("only counts people whose 12/24/36-month point has passed", () => {
    const initiates = [
      { person_id: "a", initiated_on: "2022-01-10", cohort: "2022" },
      { person_id: "b", initiated_on: "2022-03-10", cohort: "2022" },
      { person_id: "c", initiated_on: "2026-01-10", cohort: "2026" },
    ];
    const m = new Map([
      ["a", [{ joined_on: "2022-01-10", left_on: null }]],
      ["b", [{ joined_on: "2022-03-10", left_on: "2023-06-01" }]],
      ["c", [{ joined_on: "2026-01-10", left_on: null }]],
    ]);
    const [c22, c26] = cohortRetention(initiates, m, today);
    expect(c22).toMatchObject({ cohort: "2022", initiated: 2, eligible_12: 2, remain_12: 2, pct_12: 100, remain_24: 1, pct_24: 50, remain_36: 1, pct_36: 50 });
    expect(String(c22.note)).toContain("small numbers");
    expect(c26).toMatchObject({ eligible_12: 0, remain_12: null, pct_12: null });
    expect(String(c26.note)).toContain("12m: not yet reached");
  });
  it("counts a move to another Lodge as remaining", () => {
    const m = new Map([["a", [{ joined_on: "2020-01-01", left_on: "2020-06-01" }, { joined_on: "2020-05-01", left_on: null }]]]);
    const [r] = cohortRetention([{ person_id: "a", initiated_on: "2020-01-01", cohort: "2020" }], m, today);
    expect(r.pct_36).toBe(100);
  });
});

describe("distributions and aggregation", () => {
  it("bands intervals without ranking", () => {
    expect(bandCounts([3, 8, 8, 30, null]).map((b) => b.count)).toEqual([1, 2, 0, 0, 0, 1]);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("groups with count, sum and average", () => {
    const rows = [{ area: "North", n: 2 }, { area: "North", n: 4 }, { area: null, n: 1 }];
    expect(aggregate(rows, "area", "count")).toEqual([{ group: "North", value: 2 }, { group: "Not recorded", value: 1 }]);
    expect(aggregate(rows, "area", "sum", "n")[0]).toEqual({ group: "North", value: 6 });
    expect(aggregate(rows, "area", "avg", "n")[0]).toEqual({ group: "North", value: 3 });
  });
});

describe("quarterly narrative", () => {
  it("drafts neutral sentences with comparisons and no ranking or judgement", () => {
    const n = suggestNarrative({
      lodges: { active: 40, with_lodge_mentor: 36, unconfirmed_lodge_mentor: 2, allocated: 38 },
      membership: { initiations: 12, passings: 9, raisings: 7, joinings: 1, departures: { resigned: 2, deceased: 1 } },
      activity: { contacts: 50 }, support: { opened: 4, closed: 3, open_at_end: 5 },
      previous: { activity: { contacts: 40 }, membership: { initiations: 12 } },
    }, "Quarter 3 2026");
    expect(n.summary).toContain("up from 40 in the previous quarter");
    expect(n.membership).toContain("the same as the previous quarter");
    expect(n.lodges).toContain("4 Lodges did not have a Lodge Mentor recorded");
    expect(n.membership).toContain("3 departures");
    const all = Object.values(n).join(" ");
    expect(all).not.toMatch(/—|failing|disengaged|worst|best|rank/i);
    expect(compare(3, undefined)).toBe("");
  });
});
