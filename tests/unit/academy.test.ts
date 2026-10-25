import { describe, expect, it } from "vitest";
import { parseContent, scenarioProblems, videoEmbed } from "@/server/academy/content";
import { audiencesForRoles, recommendCourses, type RecCourse } from "@/server/academy/recommend";

describe("lesson content", () => {
  it("keeps valid blocks and drops malformed ones", () => {
    const c = parseContent({ blocks: [{ type: "text", markdown: "Hi" }, { type: "nope" }, { type: "image" }, { type: "principles" }], prompt: "Why?" });
    expect(c.blocks.map((b) => b.type)).toEqual(["text", "principles"]);
    expect(c.prompt).toBe("Why?");
    expect(parseContent(null).blocks).toEqual([]);
  });

  it("recognises YouTube, Vimeo and https MP4 only", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ kind: "youtube", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")?.kind).toBe("youtube");
    expect(videoEmbed("https://vimeo.com/123456")).toEqual({ kind: "vimeo", src: "https://player.vimeo.com/video/123456" });
    expect(videoEmbed("https://cdn.example.org/clip.mp4")?.kind).toBe("mp4");
    expect(videoEmbed("http://cdn.example.org/clip.mp4")).toBeNull();
    expect(videoEmbed("https://example.org/page")).toBeNull();
    expect(videoEmbed("javascript:alert(1)")).toBeNull();
  });

  it("finds scenario problems", () => {
    expect(scenarioProblems({ start: "a", nodes: { a: { text: "Start", choices: [{ label: "Go", next: "b" }] }, b: { text: "End", choices: [] } } })).toEqual([]);
    const p = scenarioProblems({ start: "x", nodes: { a: { text: "", choices: [{ label: "Go", next: "zz" }] } } });
    expect(p.join(" ")).toMatch(/starting step/);
    expect(p.join(" ")).toMatch(/does not exist/);
    expect(p.join(" ")).toMatch(/No step ends/);
  });
});

const course = (id: string, o: Partial<RecCourse> = {}): RecCourse => ({
  id, slug: id, title: id, summary: "", level: "optional", principle: null, audiences: [], masonic_stages: [], topics: [], estimated_minutes: 20, is_placeholder_content: false, ...o,
});

describe("recommendations", () => {
  it("maps roles to audiences", () => {
    expect(audiencesForRoles(["lodge_mentor"])).toEqual(["lodge_mentor"]);
    expect(audiencesForRoles(["learner"])).toEqual(["newer_brother"]);
  });

  it("puts essential before recommended before optional, and excludes enrolled courses", () => {
    const recs = recommendCourses({
      courses: [course("opt", { audiences: ["lodge_mentor"] }), course("ess", { audiences: ["lodge_mentor"], level: "essential" }),
        course("rec", { audiences: ["lodge_mentor"], level: "recommended" }), course("done", { audiences: ["lodge_mentor"], level: "essential" }), course("other", { audiences: ["personal_mentor"] })],
      pathways: [], profile: null, roles: ["lodge_mentor"], excludeCourseIds: new Set(["done"]),
    });
    expect(recs.map((r) => r.id)).toEqual(["ess", "rec", "opt"]);
  });

  it("treats pathway essentials as essential and uses profile stage and interests", () => {
    const recs = recommendCourses({
      courses: [course("p", { level: "optional" }), course("stage", { masonic_stages: ["fellow_craft"] }), course("topic", { topics: ["listening"] }), course("none")],
      pathways: [{ id: "pw", title: "Newer Brother pathway", audience: "newer_brother", courses: [{ course_id: "p", requirement: "essential", position: 0 }] }],
      profile: { audiences: [], masonic_stage: "fellow_craft", interests: ["Listening"] }, roles: ["learner"], excludeCourseIds: new Set(),
    });
    expect(recs[0]!.id).toBe("p");
    expect(recs[0]!.reason).toBe("Essential in the Newer Brother pathway");
    expect(recs.map((r) => r.id)).toEqual(["p", "stage", "topic"]);
  });
});
