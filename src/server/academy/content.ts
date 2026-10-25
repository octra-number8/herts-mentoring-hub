/**
 * Lesson content model shared by the learner player and the authoring tools.
 * Pure functions only (no server imports) so they can be unit tested and used
 * from client components.
 */
import { z } from "zod";

export const BLOCK_TYPES = ["text", "callout", "image", "video", "principles", "resource"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_LABELS: Record<BlockType, string> = {
  text: "Text", callout: "Callout", image: "Image", video: "Video", principles: "The four principles", resource: "Downloadable resource",
};

const httpsUrl = z.string().trim().url("Enter a full web address").refine((u) => u.startsWith("https://"), "The address must start with https://");

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), markdown: z.string().max(20000) }),
  z.object({ type: z.literal("callout"), text: z.string().max(2000), tone: z.enum(["info", "tip", "important"]).default("info") }),
  z.object({ type: z.literal("image"), path: z.string().min(1, "Upload the image before saving"), alt: z.string().max(300).default(""), caption: z.string().max(300).optional() }),
  z.object({ type: z.literal("video"), url: httpsUrl, title: z.string().trim().min(1, "Give the video a title").max(200) }),
  z.object({ type: z.literal("principles"), intro: z.string().max(500).optional() }),
  z.object({ type: z.literal("resource"), title: z.string().trim().min(1, "Give the resource a title").max(200), url: httpsUrl.optional(), path: z.string().optional(), description: z.string().max(500).optional() }),
]);
export type Block = z.infer<typeof blockSchema>;

export type ScenarioChoice = { label: string; next: string; feedback?: string };
export type ScenarioNode = { text: string; choices: ScenarioChoice[] };
export type Scenario = { start: string; nodes: Record<string, ScenarioNode> };

export const scenarioSchema = z.object({
  start: z.string().min(1),
  nodes: z.record(z.string(), z.object({
    text: z.string().max(4000),
    choices: z.array(z.object({ label: z.string().max(500), next: z.string(), feedback: z.string().max(1000).optional() })).default([]),
  })),
});

export type LessonContent = { blocks: Block[]; scenario?: Scenario; prompt?: string };

/** Parse stored lesson content defensively: unknown or malformed blocks are dropped. */
export function parseContent(raw: unknown): LessonContent {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const blocks = Array.isArray(obj.blocks) ? obj.blocks.flatMap((b) => {
    const r = blockSchema.safeParse(b);
    return r.success ? [r.data] : [];
  }) : [];
  const sc = scenarioSchema.safeParse(obj.scenario);
  return {
    blocks,
    scenario: sc.success ? sc.data : undefined,
    prompt: typeof obj.prompt === "string" ? obj.prompt : undefined,
  };
}

/** Problems with a scenario that would leave a learner stuck. */
export function scenarioProblems(s: Scenario | undefined): string[] {
  if (!s) return ["The scenario has no steps yet."];
  const out: string[] = [];
  if (!s.nodes[s.start]) out.push(`The starting step "${s.start}" does not exist.`);
  for (const [id, n] of Object.entries(s.nodes)) {
    if (!n.text.trim()) out.push(`Step "${id}" has no text.`);
    for (const c of n.choices) {
      if (!c.label.trim()) out.push(`A choice in step "${id}" has no label.`);
      if (!s.nodes[c.next]) out.push(`A choice in step "${id}" leads to "${c.next}", which does not exist.`);
    }
  }
  if (!Object.values(s.nodes).some((n) => n.choices.length === 0)) out.push("No step ends the scenario (a step with no choices).");
  return out;
}

/** Turn a YouTube, Vimeo or https MP4 address into something safe to embed. */
export function videoEmbed(url: string): { kind: "youtube" | "vimeo" | "mp4"; src: string } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : u.pathname.startsWith("/shorts/") ? u.pathname.split("/")[2] : u.searchParams.get("v");
    return id && /^[\w-]{6,20}$/.test(id) ? { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return /^[\w-]{6,20}$/.test(id) ? { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean).find((p) => /^\d+$/.test(p));
    return id ? { kind: "vimeo", src: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (/\.mp4$/i.test(u.pathname)) return { kind: "mp4", src: u.toString() };
  return null;
}

export const PRINCIPLES = [
  { key: "prepare", label: "Prepare", text: "Helping a Brother know what to expect, so there are never any surprises." },
  { key: "guide", label: "Guide", text: "Walking alongside him, explaining what is happening and why." },
  { key: "support", label: "Support", text: "Being there when he needs help: How can we help?" },
  { key: "enlighten", label: "Enlighten", text: "Opening up the meaning and the wider life of Freemasonry over time." },
] as const;

export const AUDIENCES = [
  { value: "lodge_mentor", label: "Lodge Mentors" },
  { value: "personal_mentor", label: "Personal Mentors" },
  { value: "newer_brother", label: "Newer Brethren" },
  { value: "provincial_team", label: "Provincial team" },
  { value: "all", label: "Everyone" },
];
export const STAGES = [
  { value: "entered_apprentice", label: "Entered Apprentice" },
  { value: "fellow_craft", label: "Fellow Craft" },
  { value: "master_mason", label: "Master Mason" },
  { value: "established", label: "Established member" },
];
export const LEVELS = [
  { value: "essential", label: "Essential" },
  { value: "recommended", label: "Recommended" },
  { value: "optional", label: "Optional" },
];
export const PRINCIPLE_OPTIONS = PRINCIPLES.map((p) => ({ value: p.key, label: p.label }));
export const LESSON_KINDS = [
  { value: "content", label: "Reading" },
  { value: "video", label: "Video" },
  { value: "scenario", label: "Scenario" },
  { value: "reflection", label: "Reflection" },
  { value: "quiz", label: "Knowledge check" },
  { value: "resource", label: "Resource" },
];
export const lessonKindLabel = (k: string) => LESSON_KINDS.find((x) => x.value === k)?.label ?? k;
export const audienceLabel = (k: string) => AUDIENCES.find((x) => x.value === k)?.label ?? k;

export const minutesLabel = (m?: number | null) => {
  if (!m) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
};

export const PROVIDERS = [
  { value: "solomon", label: "Solomon (UGLE)" },
  { value: "ugle", label: "UGLE, other" },
  { value: "other_province", label: "Another Province" },
  { value: "other", label: "Other" },
];
