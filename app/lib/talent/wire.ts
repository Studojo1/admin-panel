// What /api/talent sends the page (talent.server.ts builds it, client.ts reads it).
import type { Candidate, Claim, GraphIn, Hit, Skill, Term } from "./model";

export interface WireResult extends Omit<Candidate, "claims"> {
  skills: Skill[];
  roles: Claim[];
  outcomes: Claim[];
  projects: Claim[];
  credentials: Claim[];
  /** Skills said on the call, as the sentences they are. */
  saidSkills: string[];
  /** Results the call heard that carry a number, of all it heard. */
  numbered: { n: number; of: number };
  hits: Hit[];
  matched: number;
  score: number;
}

export interface TalentEnvelope {
  env: string;
  /** The student tables are in this database. */
  live: boolean;
  /** Students searched (internal accounts left out unless asked). */
  pool: number;
  /** Of them, took the Stu call. */
  called: number;
  /** Of them, let hiring managers on Studojo find them. */
  optedIn: number;
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
