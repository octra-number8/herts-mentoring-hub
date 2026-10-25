import type { Block, Scenario } from "../../src/server/academy/content";

export type QuestionDef = {
  kind: "single" | "multiple" | "true_false";
  prompt: string;
  options: string[];
  /** Indexes into options. */
  correct: number[];
  feedbackCorrect?: string;
  feedbackIncorrect?: string;
  explanation?: string;
};

export type LessonDef = {
  title: string;
  kind: "content" | "video" | "scenario" | "reflection" | "quiz" | "resource";
  minutes: number;
  blocks: Block[];
  prompt?: string;
  scenario?: Scenario;
  isAssessment?: boolean;
  passMark?: number;
  maxAttempts?: number;
  questions?: QuestionDef[];
};

export type CourseDef = {
  slug: string;
  title: string;
  summary: string;
  audiences: string[];
  stages: string[];
  topics: string[];
  level: "essential" | "recommended" | "optional";
  principle: "prepare" | "guide" | "support" | "enlighten";
  minutes: number;
  pathway?: string;
  passMark: number;
  /** The library document(s) the course is adapted from. */
  source: string;
  modules: { title: string; summary: string; lessons: LessonDef[] }[];
};
