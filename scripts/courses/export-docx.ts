/**
 * Exports the Academy courses to Word documents for authors to expand and review.
 *
 *   npx tsx scripts/courses/export-docx.ts [output folder]
 *
 * One .docx per course, laid out so edits can be brought back into the course
 * files: modules and lessons keep their numbered headings, quiz answers are
 * marked in a table, and scenario steps keep their step names.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LevelFormat, Packer, PageBreak, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import type { Block } from "../../src/server/academy/content";
import type { CourseDef, LessonDef, QuestionDef } from "./types";
import { e1 } from "./e1-lodge-mentor-essentials";
import { e2 } from "./e2-personal-mentor-course";
import { e6 } from "./e6-chair-and-beyond";

const NAVY = "003668", TEAL = "157A7C", SLATE = "3D4A57", SKY = "BFD6EA";
const PAGE_W = 9026; // A4 with 1" margins, in DXA
const FONT = "Arial";

const LABELS: Record<string, string> = {
  lodge_mentor: "Lodge Mentors", personal_mentor: "Personal Mentors", all: "Everyone",
  essential: "Essential", recommended: "Recommended", optional: "Optional",
  prepare: "Prepare", guide: "Guide", support: "Support", enlighten: "Enlighten",
  content: "Reading", video: "Video", scenario: "Scenario", reflection: "Private reflection", quiz: "Quiz", resource: "Resource",
  single: "One answer", multiple: "More than one answer", true_false: "True or false",
};
const label = (k: string) => LABELS[k] ?? k.replace(/_/g, " ");

/** **bold**, *italic* and [text](url) inside a line of markdown. */
function runs(text: string, base: { italics?: boolean; bold?: boolean; color?: string } = {}): TextRun[] {
  const out: TextRun[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), ...base, bold: true }));
    else if (t.startsWith("[")) {
      const [, txt, url] = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      out.push(new TextRun({ text: `${txt} (${url})`, ...base, color: TEAL }));
    } else out.push(new TextRun({ text: t.slice(1, -1), ...base, italics: true }));
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "B8C4CF" };
const borders = { top: border, bottom: border, left: border, right: border };

function table(rows: string[][], widths: number[], opts: { header?: boolean } = {}): Table {
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((cells, r) => new TableRow({
      tableHeader: opts.header && r === 0,
      children: cells.map((c, i) => new TableCell({
        borders,
        width: { size: widths[i], type: WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: opts.header && r === 0 ? { fill: "DDE9F5", type: ShadingType.CLEAR, color: "auto" } : undefined,
        children: c.split("\n").map((line) => new Paragraph({ children: runs(line, opts.header && r === 0 ? { bold: true } : {}) })),
      })),
    })),
  });
}

/** A shaded box: callouts, reflection prompts, development notes. */
function box(title: string, body: string[], fill: string, accent: string): Table {
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [PAGE_W],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: PAGE_W, type: WidthType.DXA },
      borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.SINGLE, size: 24, color: accent } },
      shading: { fill, type: ShadingType.CLEAR, color: "auto" },
      margins: { top: 100, bottom: 100, left: 160, right: 160 },
      children: [
        new Paragraph({ children: [new TextRun({ text: title, bold: true, color: accent })] }),
        ...body.map((b) => new Paragraph({ children: runs(b) })),
      ],
    })] })],
  });
}

const spacer = () => new Paragraph({ children: [] });

/** Markdown as used in the course files: paragraphs, lists, quotes, tables and ### headings. */
function markdown(md: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!/^\|[\s:|-]+\|$/.test(lines[i])) rows.push(lines[i].slice(1, -1).split("|").map((c) => c.trim()));
        i++;
      }
      i--;
      const n = rows[0].length;
      const w = Array.from({ length: n }, (_, k) => k < n - 1 ? Math.floor(PAGE_W / n) : PAGE_W - Math.floor(PAGE_W / n) * (n - 1));
      out.push(table(rows, w, { header: true }), spacer());
    } else if (/^#{1,6} /.test(line)) {
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: runs(line.replace(/^#+ /, "")) }));
    } else if (line.startsWith("> ")) {
      out.push(new Paragraph({ indent: { left: 567 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: SKY, space: 8 } },
        children: runs(line.slice(2), { italics: true }) }));
    } else if (/^\s*- /.test(line)) {
      out.push(new Paragraph({ numbering: { reference: "bullets", level: /^\s{2,}/.test(line) ? 1 : 0 }, children: runs(line.replace(/^\s*- /, "")) }));
    } else if (/^\s*\d+\. /.test(line)) {
      // Keep the author's own numbers so the text matches the course exactly.
      const [, num, rest] = line.trim().match(/^(\d+)\. (.*)$/)!;
      out.push(new Paragraph({ indent: { left: 567, hanging: 340 }, children: [new TextRun(`${num}.\t`), ...runs(rest)] }));
    } else {
      out.push(new Paragraph({ children: runs(line) }));
    }
  }
  return out;
}

function block(b: Block): (Paragraph | Table)[] {
  switch (b.type) {
    case "text": return markdown(b.markdown);
    case "callout": {
      const t = b.tone === "important" ? ["Important", "FDF1E7", "B5541C"] : b.tone === "tip" ? ["Tip", "EEF8F8", TEAL] : ["Note", "F2F7FC", NAVY];
      return [box(t[0], b.text.split("\n"), t[1], t[2]), spacer()];
    }
    case "principles": return [box("Graphic: the four Hertfordshire principles (Prepare, Guide, Support, Enlighten)", b.intro ? [b.intro] : [], "F2F7FC", NAVY), spacer()];
    case "image": return [box("Image", [`${b.alt || "(no description)"}${b.caption ? `: ${b.caption}` : ""}`], "F2F7FC", SLATE), spacer()];
    case "video": return [box("Video", [`${b.title}: ${b.url}`], "F2F7FC", SLATE), spacer()];
    case "resource": return [box("Resource", [b.title, ...(b.description ? [b.description] : []), ...(b.url ? [b.url] : [])], "F2F7FC", SLATE), spacer()];
  }
}

function question(q: QuestionDef, n: number): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: `Question ${n} `, bold: true, color: NAVY }), new TextRun({ text: `(${label(q.kind)})`, color: SLATE })] }),
    new Paragraph({ children: runs(q.prompt) }),
    table([["", "Answer option", "Correct?"], ...q.options.map((o, i) => [String.fromCharCode(97 + i), o, q.correct.includes(i) ? "Yes" : ""])],
      [600, PAGE_W - 1800, 1200], { header: true }),
  ];
  const fb: string[] = [];
  if (q.feedbackCorrect) fb.push(`**If right:** ${q.feedbackCorrect}`);
  if (q.feedbackIncorrect) fb.push(`**If wrong:** ${q.feedbackIncorrect}`);
  if (q.explanation) fb.push(`**Explanation:** ${q.explanation}`);
  for (const f of fb) out.push(new Paragraph({ indent: { left: 340 }, children: runs(f) }));
  return out;
}

function lesson(l: LessonDef, num: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`Lesson ${num}: ${l.title}`)] }),
    new Paragraph({ children: [new TextRun({ text: `${label(l.kind)} · about ${l.minutes} minutes${l.isAssessment ? ` · counts towards completion, pass mark ${l.passMark ?? "course default"}%` : ""}`, color: SLATE, size: 20 })] }),
    ...l.blocks.flatMap(block),
  ];
  if (l.prompt) out.push(box("Reflection prompt (the learner's answer is private to them)", [l.prompt], "EEF8F8", TEAL), spacer());
  if (l.scenario) {
    const ids = Object.keys(l.scenario.nodes);
    out.push(new Paragraph({ children: runs(`**Branching scenario.** Starts at step ${l.scenario.start}. A step with no choices ends the scenario.`) }));
    for (const id of ids) {
      const node = l.scenario.nodes[id];
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: [new TextRun(`Step ${id}${node.choices.length ? "" : " (ending)"}`)] }),
        new Paragraph({ children: runs(node.text) }));
      if (node.choices.length) out.push(table([["Choice", "Goes to", "Feedback shown"], ...node.choices.map((c) => [c.label, c.next, c.feedback ?? ""])],
        [3800, 1100, PAGE_W - 4900], { header: true }));
    }
    out.push(spacer());
  }
  l.questions?.forEach((q, i) => out.push(...question(q, i + 1)));
  if (l.questions) out.push(spacer());
  out.push(box("Development notes", ["Ideas, extra detail, examples or questions for this lesson:", ""], "FAFAF7", "8A8F95"), spacer());
  return out;
}

function course(c: CourseDef): Document {
  const lessons = c.modules.reduce((n, m) => n + m.lessons.length, 0);
  const body: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(c.title)] }),
    new Paragraph({ children: [new TextRun({ text: "Hertfordshire Provincial Mentoring Academy · Working draft for development", color: SLATE })] }),
    spacer(),
    new Paragraph({ children: runs(c.summary, { italics: true }) }),
    spacer(),
    table([
      ["Who it is for", c.audiences.map(label).join(", ")],
      ["Level", label(c.level)],
      ["Principle", label(c.principle)],
      ["Length", `About ${c.minutes} minutes: ${c.modules.length} modules, ${lessons} lessons`],
      ["Pass mark", `${c.passMark}%`],
      ["Adapted from", c.source],
      ["Exported", new Date().toISOString().slice(0, 10)],
    ], [2400, PAGE_W - 2400]),
    spacer(),
    new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("How to work on this document")] }),
    ...[
      "Edit and add text freely. Use Track Changes and comments if more than one person is working on it.",
      "Keep the Module and Lesson headings so changes can be matched back to the course. To add a lesson, copy an existing lesson heading and give it a new number such as 2.3a.",
      "Quizzes: mark the right answers with Yes in the Correct? column. Each quiz needs at least one right answer per question.",
      "Scenarios: each step names the step its choices go to. Add a step by giving it a new name and pointing a choice at it.",
      "Use the Development notes box under each lesson for ideas you have not yet written up.",
      "House style (A3): no ceremony or ritual content, no em-dashes, Brother with a capital B, and check facts against the current Secretaries' Handbook.",
      "When it is ready, send it back and it will be loaded into the Hub as a new version for review.",
    ].map((t) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: runs(t) })),
  ];
  c.modules.forEach((m, mi) => {
    body.push(new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`Module ${mi + 1}: ${m.title}`)] }),
      new Paragraph({ children: runs(m.summary, { italics: true, color: SLATE }) }));
    m.lessons.forEach((l, li) => body.push(...lesson(l, `${mi + 1}.${li + 1}`)));
  });

  return new Document({
    creator: "Hertfordshire Provincial Mentoring Hub",
    title: c.title,
    styles: {
      default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { after: 100, line: 288 } } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", run: { size: 48, bold: true, color: NAVY, font: FONT }, paragraph: { spacing: { after: 120 } } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 34, bold: true, color: NAVY, font: FONT }, paragraph: { spacing: { before: 120, after: 120 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 27, bold: true, color: TEAL, font: FONT }, paragraph: { spacing: { before: 360, after: 60 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, color: NAVY, font: FONT }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
        { id: "Heading4", name: "Heading 4", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 22, bold: true, color: SLATE, font: FONT }, paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 3 } },
      ],
    },
    numbering: { config: [{ reference: "bullets", levels: [
      { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 284 } } } },
      { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1134, hanging: 284 } } } },
    ] }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: `${c.title} · Working draft · Page `, size: 18, color: SLATE }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: SLATE }),
      ] })] }) },
      children: body,
    }],
  });
}

async function main() {
  const dir = process.argv[2] ?? "course-exports";
  mkdirSync(dir, { recursive: true });
  for (const [code, c] of [["E1", e1], ["E2", e2], ["E6", e6]] as const) {
    const file = join(dir, `${code} ${c.title} - course draft for development.docx`);
    writeFileSync(file, await Packer.toBuffer(course(c)));
    console.log(file);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
