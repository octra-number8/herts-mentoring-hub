// Writes failing Playwright tests and their first error lines as Markdown (for $GITHUB_STEP_SUMMARY).
import { existsSync, readFileSync } from "node:fs";
const file = "playwright-report/results.json";
if (!existsSync(file)) { console.log("### Browser tests\nNo results file: the suite did not run (check the step log)."); process.exit(0); }
const r = JSON.parse(readFileSync(file, "utf8"));
const fails = [];
const walk = (suite, path) => {
  for (const s of suite.suites ?? []) walk(s, [...path, s.title]);
  for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) {
    const last = t.results?.at(-1);
    if (t.status === "unexpected" || last?.status === "failed" || last?.status === "timedOut") {
      const err = (last?.errors?.[0]?.message ?? last?.error?.message ?? "").replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter(Boolean).slice(0, 4).join(" / ");
      fails.push(`- **${[...path, spec.title].filter(Boolean).join(" › ")}** (${spec.file}:${spec.line})\n  \`${err.slice(0, 400)}\``);
    }
  }
};
walk(r, []);
const s = r.stats ?? {};
console.log(`### Browser tests\nPassed ${s.expected ?? "?"}, failed ${s.unexpected ?? "?"}, flaky ${s.flaky ?? 0}\n\n${fails.join("\n") || "No failing tests recorded."}`);
