/**
 * Course recommendations for the My Learning dashboard. Pure logic so it can be
 * unit tested: essential before recommended before optional, courses matching
 * the learner's audiences, stage, interests and roles first.
 */

export type RecCourse = {
  id: string; slug: string; title: string; summary: string; level: string; principle: string | null;
  audiences: string[]; masonic_stages: string[]; topics: string[]; estimated_minutes: number | null; is_placeholder_content: boolean;
};
export type RecPathway = { id: string; title: string; audience: string; courses: { course_id: string; requirement: string; position: number }[] };
export type RecProfile = { audiences: string[]; masonic_stage: string | null; interests: string[] } | null;
export type Recommendation = RecCourse & { reason: string; score: number };

/** Audiences implied by the learner's Hub roles. */
export function audiencesForRoles(roles: string[]): string[] {
  const out = new Set<string>();
  if (roles.includes("lodge_mentor")) out.add("lodge_mentor");
  if (roles.includes("personal_mentor")) out.add("personal_mentor");
  if (roles.some((r) => ["prov_grand_mentor", "deputy_prov_grand_mentor", "apgmen", "prov_team", "learning_lead"].includes(r))) out.add("provincial_team");
  if (roles.includes("learner")) out.add("newer_brother");
  return [...out];
}

const LEVEL_WEIGHT: Record<string, number> = { essential: 300, recommended: 200, optional: 100 };

export function recommendCourses(input: {
  courses: RecCourse[]; pathways: RecPathway[]; profile: RecProfile; roles: string[]; excludeCourseIds: Set<string>; limit?: number;
}): Recommendation[] {
  const audiences = new Set([...(input.profile?.audiences ?? []), ...audiencesForRoles(input.roles)]);
  const stage = input.profile?.masonic_stage ?? null;
  const interests = new Set((input.profile?.interests ?? []).map((i) => i.toLowerCase()));

  const pathwayInfo = new Map<string, { title: string; requirement: string; position: number }>();
  for (const p of input.pathways) {
    if (!audiences.has(p.audience)) continue;
    for (const pc of p.courses) {
      const prev = pathwayInfo.get(pc.course_id);
      if (!prev || (prev.requirement !== "essential" && pc.requirement === "essential")) {
        pathwayInfo.set(pc.course_id, { title: p.title, requirement: pc.requirement, position: pc.position });
      }
    }
  }

  const out: Recommendation[] = [];
  for (const c of input.courses) {
    if (input.excludeCourseIds.has(c.id)) continue;
    const audienceMatch = c.audiences.some((a) => audiences.has(a)) || c.audiences.includes("all");
    const stageMatch = !!stage && c.masonic_stages.includes(stage);
    const interestMatch = c.topics.some((t) => interests.has(t.toLowerCase()));
    const path = pathwayInfo.get(c.id);
    if (!audienceMatch && !stageMatch && !interestMatch && !path) continue;

    const level = path?.requirement === "essential" ? "essential" : c.level;
    let score = LEVEL_WEIGHT[level] ?? 100;
    if (path) score += 40 - Math.min(path.position, 39);
    if (audienceMatch) score += 30;
    if (stageMatch) score += 20;
    if (interestMatch) score += 10;

    const reason = path
      ? `${path.requirement === "essential" ? "Essential" : "Optional"} in the ${path.title}`
      : stageMatch ? "Suited to your stage"
      : audienceMatch ? "Suited to your role"
      : "Matches your interests";
    out.push({ ...c, reason, score });
  }
  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, input.limit ?? 6);
}
