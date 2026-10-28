import type { Channel } from "@/schemas/conversation";

/** Same copy as poc-frontend/src/components/agents/agent-chat-panel.tsx. */
export const AGENT: Record<Channel, { name: string; hint: string; empty: string; suggestions?: string[] }> = {
  intake: {
    name: "Project Orchestrator",
    hint: "Answer its questions or add anything it should know. It re-plans when you reply.",
    empty: "The Project Orchestrator will reply here.",
  },
  requirements: {
    name: "Requirements Agent",
    hint: "Answer its questions, ask why, or request changes. Approval stays with you.",
    empty: "Ask the Requirements Agent anything about these requirements.",
    suggestions: ["What is still unclear in these requirements?", "Which requirements are riskiest to build?", "Add a requirement for audit logging"],
  },
  architecture: {
    name: "Architecture Agent",
    hint: "Describe a change or ask about a decision. Proposed changes are reviewed in the web app.",
    empty: "Describe the architecture you want, or a change to it.",
    suggestions: ["Why this design over microservices?", "Add a cache in front of the API", "What are the single points of failure?"],
  },
  plan: {
    name: "Planning Agent",
    hint: "Ask about the schedule or request changes to tasks and milestones. Approval stays with you.",
    empty: "Ask the Planning Agent about the schedule, or describe a change.",
    suggestions: ["What is on the critical path?", "Can we finish two weeks earlier?", "Which tasks can run in parallel?"],
  },
  budget: {
    name: "Budget Agent",
    hint: "Ask how the cost was worked out or request changes. Approval stays with you.",
    empty: "Ask the Budget Agent about the estimate, or describe a change.",
    suggestions: ["How was the total worked out?", "What drives most of the cost?", "What would a leaner version cost?"],
  },
  code: {
    name: "Development Agent",
    hint: "Ask for files to be added, changed or removed. Every change is re-checked with shellcheck.",
    empty: "Describe a file or folder you want in the scaffold, or ask about one.",
    suggestions: ["Add a Dockerfile for the backend", "Add a CI workflow that runs the tests", "Explain the folder structure"],
  },
};

export const CHANNELS = Object.keys(AGENT) as Channel[];
