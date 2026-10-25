import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyMapping, checkMapping, headerSignature, matchTemplate, suggestMapping, type TemplateLike } from "@/server/imports/mapping";
import { diffPerson, matchRows, type ExistingPerson } from "@/server/imports/match";
import { parseCsv, parseDate, parseFile, parseXlsx, ParseError } from "@/server/imports/parse";
import { validateRow, validateRows } from "@/server/imports/validate";

const FIX = "tests/fixtures/imports";
const LODGES = new Map([[9001, "L1"], [9002, "L2"], [9003, "L3"], [9004, "L4"], [9005, "L5"]]);
const recent = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
const scenarioCsv = () => readFileSync(`${FIX}/scenario-11.csv`, "utf8").replaceAll("{P}", "U").replaceAll("{S}", "").replaceAll("{L}", "9001").replaceAll("{RECENT}", recent);

describe("parse", () => {
  it("parses CSV with a BOM, trims values and skips blank lines", () => {
    const t = parseCsv("﻿Membership No , Surname\n A1 , Smith \n\n,\nB2,Jones\n");
    expect(t.headers).toEqual(["Membership No", "Surname"]);
    expect(t.rows).toEqual([{ "Membership No": "A1", Surname: "Smith" }, { "Membership No": "B2", Surname: "Jones" }]);
  });

  it("refuses a file with no header row", () => {
    expect(() => parseCsv("")).toThrow(ParseError);
  });

  it("parses dd/mm/yyyy and ISO dates and rejects impossible ones", () => {
    expect(parseDate("05/09/2026")).toBe("2026-09-05");
    expect(parseDate("5.9.2026")).toBe("2026-09-05");
    expect(parseDate("2020-05-06")).toBe("2020-05-06");
    expect(parseDate("2020-05-06T00:00:00Z")).toBe("2020-05-06");
    expect(parseDate("")).toBeNull();
    expect(parseDate("31/02/2020")).toBe("invalid");
    expect(parseDate("13/13/2020")).toBe("invalid");
    expect(parseDate("next Tuesday")).toBe("invalid");
  });

  it("reads the first worksheet of an Excel file, finding the header row and converting dates", async () => {
    const t = await parseXlsx(readFileSync(`${FIX}/adelphi-sample.xlsx`));
    expect(t.headers).toContain("Reg No");
    expect(t.rows).toHaveLength(3);
    expect(t.rows[0]["Initiation Date"]).toBe("2025-07-03");
    expect(t.rows[0]["Lodge Number"]).toBe("9004");
    expect(t.rows[1]["Initiation Date"]).toBe("14/02/2010");
  });

  it("chooses the parser by file extension", async () => {
    await expect(parseFile("report.pdf", new Uint8Array())).rejects.toThrow(ParseError);
    const t = await parseFile("x.csv", new TextEncoder().encode("A,B\n1,2\n"));
    expect(t.rows).toEqual([{ A: "1", B: "2" }]);
  });
});

describe("mapping", () => {
  it("suggests a mapping from common Hermes and Adelphi column names", () => {
    const hermes = suggestMapping(["Membership No", "Title", "Forename", "Surname", "Email", "Lodge No", "Primary", "Status", "Date Initiated", "Date Passed", "Date Raised"]);
    expect(hermes).toMatchObject({ "Membership No": "membership_number", Forename: "first_name", Surname: "last_name", "Lodge No": "lodge_number", "Date Initiated": "initiated_on", "Date Raised": "raised_on" });
    const adelphi = suggestMapping(["Reg No", "Rank", "First Name", "Last Name", "E-mail", "Lodge Number", "Mother Lodge", "Initiation Date"]);
    expect(adelphi).toMatchObject({ "Reg No": "membership_number", Rank: "title", "E-mail": "email", "Mother Lodge": "is_primary", "Initiation Date": "initiated_on" });
  });

  it("identifies a saved template by its header signature regardless of order and case", () => {
    const templates: TemplateLike[] = [
      { id: "t1", name: "Hermes", mapping: { "Membership No": "membership_number", Surname: "last_name" }, header_signature: headerSignature(["Membership No", "Surname", "Forename"]) },
      { id: "t2", name: "Other", mapping: { Ref: "membership_number" }, header_signature: ["ref"] },
    ];
    expect(matchTemplate(["forename", "SURNAME", "Membership  No"], templates)?.id).toBe("t1");
    expect(matchTemplate(["Ref", "Extra column"], templates)?.id).toBe("t2");
    expect(matchTemplate(["Nothing", "Matches"], templates)).toBeNull();
  });

  it("reports missing required fields and double mappings", () => {
    const problems = checkMapping({ A: "first_name", B: "first_name" }, ["A", "B"]);
    expect(problems.join(" ")).toMatch(/More than one column/);
    expect(problems.join(" ")).toMatch(/Last name/);
    expect(problems.join(" ")).toMatch(/Lodge number/);
    expect(checkMapping({ F: "first_name", L: "last_name", N: "lodge_number" }, ["F", "L", "N"])).toEqual([]);
  });

  it("applies a mapping and ignores unmapped or unknown targets", () => {
    expect(applyMapping([{ A: " x ", B: "y", C: "z" }], { A: "first_name", B: "not_a_field" })).toEqual([{ first_name: "x" }]);
  });
});

describe("validate", () => {
  it("normalises a good row", () => {
    const r = validateRow({ membership_number: " AB 12 ", first_name: "JOHN", last_name: "o'neill", email: "J@Example.TEST", lodge_number: "9001", initiated_on: "01/02/2020", is_primary: "No", status: "Current" }, 1, LODGES);
    expect(r.errors).toEqual([]);
    expect(r.data).toMatchObject({ membership_number: "AB12", first_name: "John", last_name: "O'Neill", email: "j@example.test", lodge_id: "L1", lodge_number: 9001, is_primary: false, status: "active", initiated_on: "2020-02-01" });
  });

  it("does not invent a status when the report has none", () => {
    expect(validateRow({ first_name: "A", last_name: "B", lodge_number: "9001" }, 1, LODGES).data.status).toBeNull();
  });

  it("lists every problem with an invalid row", () => {
    const r = validateRow({ first_name: "Ansel", last_name: "", email: "ansel@example", lodge_number: "99999", is_primary: "Maybe", initiated_on: "31/02/2020", status: "Wandering" }, 7, LODGES);
    const all = r.errors.join(" ");
    expect(all).toMatch(/Last name is missing/);
    expect(all).toMatch(/not a valid address/);
    expect(all).toMatch(/Lodge No. 99999 is not a Lodge/);
    expect(all).toMatch(/Primary Lodge value/);
    expect(all).toMatch(/Initiated date/);
    expect(all).toMatch(/Status "Wandering"/);
  });

  it("checks degree date order and future dates", () => {
    expect(validateRow({ first_name: "A", last_name: "B", lodge_number: "9001", initiated_on: "2020-05-01", passed_on: "2020-01-01" }, 1, LODGES).errors.join()).toMatch(/passing date is before/);
    expect(validateRow({ first_name: "A", last_name: "B", lodge_number: "9001", initiated_on: "2199-01-01" }, 1, LODGES).errors.join()).toMatch(/in the future/);
  });
});

describe("match (Scenario 11 fixture)", () => {
  const people: ExistingPerson[] = [
    { id: "p3", membership_number: "U03", title: "Bro", first_name: "Piers", last_name: "Haldane", email: "piers.old@example.test", phone: null, status: "active", local_corrections: {}, lodge_ids: ["L1"], degrees: { initiation: ["2019-02-02"] } },
    { id: "p4", membership_number: "U04", title: "Bro", first_name: "Tobias", last_name: "Wrenfield", email: "tobias.wrenfield@example.test", phone: null, status: "active", local_corrections: {}, lodge_ids: ["L1"], degrees: { initiation: ["2020-05-06"] } },
    { id: "p5", membership_number: "U05", title: "Bro", first_name: "Corwin", last_name: "Ashcombe", email: null, phone: null, status: "active", local_corrections: {}, lodge_ids: ["L1"], degrees: { initiation: ["2018-11-11"] } },
    { id: "p6", membership_number: "U06", title: "Bro", first_name: "Dunstan", last_name: "Merriweather", email: null, phone: null, status: "active", local_corrections: {}, lodge_ids: ["L1"], degrees: {} },
    { id: "p8", membership_number: null, title: null, first_name: "Lucan", last_name: "Fenwhistle", email: null, phone: null, status: "active", local_corrections: {}, lodge_ids: [], degrees: {} },
    { id: "other", membership_number: "U99", title: null, first_name: "Someone", last_name: "Elsewhere", email: null, phone: null, status: "active", local_corrections: {}, lodge_ids: ["L2"], degrees: {} },
  ];
  const run = (isPartial: boolean) => {
    const t = parseCsv(scenarioCsv());
    const mapping = suggestMapping(t.headers);
    return matchRows(validateRows(applyMapping(t.rows, mapping), LODGES, t.rows), people, { isPartial });
  };

  it("classifies every row", () => {
    const { rows, stats } = run(false);
    const by = (no: number) => rows.find((r) => r.row_no === no)!;
    expect(by(1)).toMatchObject({ outcome: "new", decision: "accept" });
    expect(by(2)).toMatchObject({ outcome: "duplicate", decision: "pending", candidate_person_ids: ["p8"] });
    expect(by(3)).toMatchObject({ outcome: "update", decision: "accept", matched_person_id: "p3" });
    expect(by(3).diff.email).toEqual({ from: "piers.old@example.test", to: "piers.new@example.test" });
    expect(by(4)).toMatchObject({ outcome: "unchanged", decision: "skip", matched_person_id: "p4" });
    expect(by(5)).toMatchObject({ outcome: "duplicate", candidate_person_ids: ["p4"] });
    expect(by(6)).toMatchObject({ outcome: "conflict", matched_person_id: "p5", decision: "pending" });
    expect(by(6).data.notes?.[0]).toMatch(/belongs to Corwin Ashcombe/);
    expect(by(7)).toMatchObject({ outcome: "invalid", decision: "skip" });
    const removals = rows.filter((r) => r.outcome === "possible_removal");
    expect(removals.map((r) => r.matched_person_id)).toEqual(["p6"]);
    expect(removals[0].decision).toBe("pending");
    expect(stats).toMatchObject({ rows: 7, new: 1, update: 1, unchanged: 1, duplicate: 2, conflict: 1, invalid: 1, possible_removal: 1, is_partial: false });
  });

  it("never treats an omission in a partial report as a departure", () => {
    const { rows } = run(true);
    const removal = rows.find((r) => r.outcome === "possible_removal")!;
    expect(removal.decision).toBe("skip");
    expect(removal.data.notes?.[0]).toMatch(/never implies/);
  });

  it("flags a locally corrected field that the report would change", () => {
    const p: ExistingPerson = { ...people[0], local_corrections: { email: true } };
    const r = validateRow({ membership_number: "U03", first_name: "Piers", last_name: "Haldane", email: "piers.new@example.test", lodge_number: "9001" }, 1, LODGES);
    const { rows } = matchRows([r], [p], { isPartial: true });
    expect(rows[0].outcome).toBe("conflict");
    expect(rows[0].data.notes?.join()).toMatch(/corrected locally/);
  });

  it("diffs Lodge links and new degree dates", () => {
    const r = validateRow({ membership_number: "U04", first_name: "Tobias", last_name: "Wrenfield", lodge_number: "9002", initiated_on: "2020-05-06", passed_on: "2021-01-01" }, 1, LODGES);
    const diff = diffPerson(r.data, people[1], ["first_name", "last_name"]);
    expect(Object.keys(diff).sort()).toEqual(["lodge", "passed_on"]);
  });
});
