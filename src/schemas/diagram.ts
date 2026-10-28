/** Mirrors poc-backend app/modules/diagrams (architecture/1.0, ops, diff). */

export const NODE_TYPES = [
  "client",
  "frontend",
  "backend",
  "service",
  "worker",
  "database",
  "cache",
  "queue",
  "storage",
  "external_api",
  "auth",
  "gateway",
  "monitoring",
  "cdn",
  "deployment",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export interface Position {
  x: number;
  y: number;
}

export interface DiagramNode {
  id: string;
  type: NodeType;
  label: string;
  description: string;
  technology: string;
  responsibilities: string[];
  config: Record<string, string>;
  requirement_ids: string[];
  position: Position;
  group: string | null;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  protocol: string | null;
  data: string | null;
  requirement_ids: string[];
}

export interface DiagramGroup {
  id: string;
  label: string;
}

export interface Decision {
  id: string;
  title: string;
  decision: string;
  alternatives: string[];
  rationale: string;
  requirement_ids: string[];
}

export interface DiagramNote {
  id: string;
  text: string;
  position: Position;
}

export interface ArchitectureContent {
  schema_version: "1.0";
  diagram_type: "system";
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  decisions: Decision[];
  notes: DiagramNote[];
  viewport: { x: number; y: number; zoom: number };
}

export type Op =
  | { op: "add_node"; node: DiagramNode }
  | { op: "update_node"; id: string; fields: Partial<DiagramNode> }
  | { op: "remove_node"; id: string }
  | { op: "add_edge"; edge: DiagramEdge }
  | { op: "update_edge"; id: string; fields: Partial<DiagramEdge> }
  | { op: "remove_edge"; id: string }
  | { op: "add_group"; group: DiagramGroup }
  | { op: "add_decision"; decision: Decision };

export interface Impact {
  added: string[];
  removed: string[];
  modified: string[];
  requirement_ids: string[];
  /** id -> human name; absent on change sets stored before labels existed. */
  labels?: Record<string, string>;
}

export interface ChangeSet {
  id: string;
  base_revision: number;
  run_id: string | null;
  instruction: string | null;
  status: "PROPOSED" | "APPLIED" | "REJECTED" | "INVALID" | "SUPERSEDED";
  ops: Op[];
  summary: string;
  impact: Impact;
  issues: import("./workflow").ValidationIssue[];
  ok: boolean;
  applied_revision: number | null;
  created_at: string;
  decided_at: string | null;
}

export interface DiffSection {
  added: string[];
  removed: string[];
  modified: { id: string; fields: Record<string, { from: unknown; to: unknown }> }[];
}

export interface DiagramDiff {
  nodes: DiffSection;
  edges: DiffSection;
  groups: DiffSection;
  decisions: DiffSection;
  notes: DiffSection;
  labels?: Record<string, string>;
}

export function emptyArchitecture(): ArchitectureContent {
  return {
    schema_version: "1.0",
    diagram_type: "system",
    nodes: [],
    edges: [],
    groups: [],
    decisions: [],
    notes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
