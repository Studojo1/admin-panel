// What /api/talent sends the page (talent.server.ts builds it, client.ts reads it).
import type { Candidate, Claim, GraphIn, Hit, Skill, Term } from "./model";

export interface WireResult extends Omit<Candidate, "claims"> {
  skills: Skill[];
  roles: Claim[];
  outcomes: Claim[];
  projects: Claim[];
  credentials: Claim[];
  /** Skills said on the call, as the sentences they are. */
  said: string[];
  hits: Hit[];
  matched: number;
  score: number;
}

export interface TalentEnvelope {
  env: string;
  /** The candidate tables are in this database. */
  live: boolean;
  /** Students hiring managers may find (internal accounts left out unless asked). */
  pool: number;
  /** Internal accounts left out. */
  hidden: number;
  /** Students this search found; results holds the first 60. */
  total: number;
  terms: Term[];
  results: WireResult[];
  graph: GraphIn;
  cities: { key: string; label: string; n: number }[];
  grads: number[];
  ms: number;
}
