// What /api/talent sends the page (talent.server.ts builds it, client.ts reads it).
import type { Counts, Fam, Net } from "./families";
import type { Candidate, Claim, Hit, Skill, Term } from "./model";

/** TALENT-NET: where a student sits in the network, and why. */
export interface WirePlace {
  family: Fam;
  familyLabel: string;
  role: string;
  roleLabel: string;
  why: string;
  also: { family: Fam; familyLabel: string; role: string; roleLabel: string }[];
}

export interface WireResult extends Omit<Candidate, "claims" | "canon"> {
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
  place: WirePlace;
}

/** TALENT-FIND: one student a name search found, enough to choose them (never their email or phone). */
export interface WireFound {
  id: string;
  name: string;
  college: string | null;
  course: string | null;
  source: "call" | "old";
  optedIn: boolean;
  family: string;
  familyLabel: string;
  role: string;
  roleLabel: string;
}

export interface TalentEnvelope {
  env: string;
  /** The student tables are in this database. */
  live: boolean;
  /** Students searched (internal accounts left out unless asked). */
  pool: number;
  /** Internal accounts left out. */
  hidden: number;
  /** TALENT-NET: the top bar. Everyone searched, and what the search, filters and open family or role show. */
  counts: { all: Counts; shown: Counts };
  /** Students this search found (before the open family or role); results holds the first 60 of those shown. */
  total: number;
  terms: Term[];
  results: WireResult[];
  /** The network of everyone this search found: families, roles, counts. */
  net: Net;
  /** The open family and role these results were narrowed to ("" for none). */
  fam: string;
  role: string;
  cities: { key: string; label: string; n: number }[];
  grads: number[];
  ms: number;
}
