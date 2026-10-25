import { describe, expect, it } from "vitest";
import { progressionPrompt } from "@/lib/progression";
import { monthsAgo, progressionSettings, promptFilter } from "@/server/members/prompt";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("progression prompt filter", () => {
  it("clamps to the end of shorter months", () => {
    expect(monthsAgo(9, new Date(2026, 10, 30))).toBe("2026-02-28");
    expect(monthsAgo(9, new Date(2026, 9, 25))).toBe("2026-01-25");
    expect(monthsAgo(12, new Date(2026, 0, 31))).toBe("2025-01-31");
  });

  it("selects exactly the members for whom progressionPrompt suggests a conversation", () => {
    for (const today of [new Date(2026, 10, 30), new Date(2026, 9, 25), new Date(2026, 2, 31), new Date(2026, 0, 1)]) {
      const threshold = monthsAgo(9, today);
      // Walk initiation dates either side of the threshold.
      for (let offset = -40; offset <= 40; offset++) {
        const d = new Date(today);
        d.setMonth(d.getMonth() - 9);
        d.setDate(d.getDate() + offset);
        const initiated = iso(d);
        const months = (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth()) - (today.getDate() < d.getDate() ? 1 : 0);
        const prompted = months >= 9;
        expect(initiated <= threshold, `${initiated} vs ${threshold} on ${iso(today)}`).toBe(prompted);
      }
    }
  });

  it("builds a PostgREST filter for both degree intervals", () => {
    const f = promptFilter({ ea_to_fc_months: 9, fc_to_mm_months: 12 }, new Date(2026, 9, 25));
    expect(f).toBe("and(initiated_on.lte.2026-01-25,passed_on.is.null,raised_on.is.null),and(passed_on.lte.2025-10-25,raised_on.is.null)");
  });

  it("reads thresholds from organisation settings with safe defaults", () => {
    expect(progressionSettings({ progression: { ea_to_fc_months: 6, fc_to_mm_months: 7 } })).toEqual({ ea_to_fc_months: 6, fc_to_mm_months: 7 });
    expect(progressionSettings({})).toEqual({ ea_to_fc_months: 9, fc_to_mm_months: 9 });
    expect(progressionSettings(undefined)).toEqual({ ea_to_fc_months: 9, fc_to_mm_months: 9 });
  });

  it("never describes anyone as disengaged", () => {
    const p = progressionPrompt({ initiated_on: "2024-01-01", status: "active" });
    expect(p).toMatch(/conversation/);
    expect(p).not.toMatch(/disengag|fail/i);
  });
});
