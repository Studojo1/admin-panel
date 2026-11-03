// TICKET-REF (3 Nov 2026, the owner: "or bind it to the user, users first ticket or the name of the ticket like for the
// user"; app/lib/ticket-label.ts says what it is): every ticket with user_number, its place among that person's own
// tickets of the same source (their first is 1, by created_at then id). For Stu tickets this is the number the student
// sees in Stu and Settings, Help (career-agent support.server.ts MINE: user_id, source 'stu', the same order). A
// ticket with no user_id (a contact form visitor) is numbered among the tickets of its email.
import { sql } from "drizzle-orm";
import { likeAnywhere, type TicketSearch } from "./ticket-label";

export const numberedTickets = sql`
  SELECT t.*,
         row_number() OVER (
           PARTITION BY COALESCE(t.user_id::text, lower(t.user_email)), t.source
           ORDER BY t.created_at, t.id
         )::int AS user_number
    FROM tickets t
`;

/** The WHERE of a search (ticket-label.ts parseTicketSearch), over numberedTickets aliased t. */
export function searchWhere(s: TicketSearch) {
  if (s.kind === "id") return sql`t.id = ${s.id}`;
  if (s.kind === "number") return sql`t.user_number = ${s.number}`;
  const like = likeAnywhere(s.who);
  // ESCAPE '\\' reaches Postgres as one backslash: likeAnywhere escapes LIKE's wildcards with it.
  return sql`
    (t.user_email ILIKE ${like} ESCAPE '\\' OR t.user_name ILIKE ${like} ESCAPE '\\')
    ${s.number !== null ? sql`AND t.user_number = ${s.number}` : sql``}
  `;
}
