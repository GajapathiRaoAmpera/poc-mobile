/** Mirrors poc-backend app/modules/projects/spec_schema.py. All fields optional. */
export interface SpecData {
  basics?: { name?: string; description?: string };
  problem?: { business_problem?: string; target_users?: string[]; goals?: string[]; expected_outcomes?: string[] };
  requirements?: { functional?: string[]; non_functional?: string[]; expected_scale?: string };
  constraints?: {
    preferred_technologies?: string[];
    deployment_preference?: string;
    budget?: { min?: number; max?: number; currency?: string };
    target_delivery_date?: string;
    team_assumptions?: string;
    compliance?: string[];
    existing_integrations?: string[];
    /** ISO date; reschedules the plan. */
    start_date?: string;
    /** Headcount per rate-card role (1-20 each). */
    team_size?: Record<string, number>;
  };
}

export interface SpecOut {
  revision: number;
  data: SpecData;
  created_at: string | null;
  created_by: string | null;
}
