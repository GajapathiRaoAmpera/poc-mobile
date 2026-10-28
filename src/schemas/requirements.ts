/** Mirrors poc-backend app/modules/agents/requirements/schema.py (requirements/1.0). */

export type Priority = "MUST" | "SHOULD" | "COULD" | "WONT";

export interface Requirement {
  id: string;
  type: "functional" | "non_functional";
  title: string;
  description: string;
  priority: Priority;
  acceptance_criteria: string[];
  source: "stated" | "inferred" | "assumption";
}

export interface OpenQuestion {
  id: string;
  question: string;
  why_it_matters: string;
  blocking: boolean;
  answer: string | null;
}

export interface RequirementsContent {
  summary: string;
  goals: string[];
  personas: { name: string; description: string }[];
  requirements: Requirement[];
  assumptions: string[];
  open_questions: OpenQuestion[];
  risks: { description: string; likelihood: "low" | "medium" | "high"; mitigation: string }[];
  dependencies: string[];
}
