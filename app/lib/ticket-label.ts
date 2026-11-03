// TICKET-REF (3 Nov 2026, the owner: "change the ticketing numbering system to do something more encrypted", then "or
// bind it to the user, users first ticket or the name of the ticket like for the user"): a student never sees
// public.tickets.id any more (it counts every ticket anyone opened). Stu and Settings, Help show "Your ticket 2: Delete
// my account": the ticket's place among that person's own tickets (their first is 1, by created_at then id) and its
// name. This page shows the same number and name beside each ticket, so the team finds the one a student quotes, and
// keeps the internal id for itself.
//
// The rules match career-agent app/lib/support/support.ts (ticketName, CATEGORY_LABEL) and support.server.ts (MINE):
// scripts/ticket-label.test.mjs and career-agent tests/ticket-ref.test.ts hold the same vectors. Pure.

/** The category words a student sees (career-agent CATEGORY_LABEL): a ticket with no words of its own is named by them. */
export const STUDENT_CATEGORY_LABEL: Record<string, string> = {
  account: "My account",
  billing: "Billing and credits",
  bug: "Something is broken",
  sign_in: "Signing in",
  whatsapp: "WhatsApp linking",
  data_deletion: "Deleting my data",
  human: "Talk to a person",
  other: "Something else",
};

export const TICKET_NAME_MAX = 60;

const tidyName = (v: unknown): string =>
  typeof v === "string"
    ? v
        .replace(/\s*[‒-―]\s*/g, ", ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[\s.,;:]+$/, "")
    : "";

const firstLine = (v: unknown): string => (typeof v === "string" ? (v.split(/\r?\n/).find((l) => l.trim()) ?? "") : "");

/**
 * A ticket's name: its summary (context.summary) when there is one, else the first line of its first message, else
 * the category's label; tidied (no dashes, one space, no trailing full stop), its first letter a capital, at most
 * TICKET_NAME_MAX characters, cut at a word with "…".
 */
export function ticketName(o: { summary?: unknown; firstMessage?: unknown; category: string }): string {
  const label = STUDENT_CATEGORY_LABEL[o.category] ?? "Something else";
  const pick = [tidyName(o.summary), tidyName(firstLine(o.firstMessage))].find((s) => s.length >= 2) ?? label;
  const name = pick.charAt(0).toUpperCase() + pick.slice(1);
  if (name.length <= TICKET_NAME_MAX) return name;
  const cut = name.slice(0, TICKET_NAME_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space >= 20 ? cut.slice(0, space) : cut).replace(/[\s.,;:]+$/, "")}…`;
}

export type TicketSearch =
  | { kind: "id"; id: number }
  | { kind: "person"; who: string; number: number | null }
  | { kind: "number"; number: number };

const MAX_N = 2_147_483_647;
const num = (s: string): number | null => {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 && n <= MAX_N ? n : null;
};

/**
 * The Tickets page's search box:
 *   "asha@example.com 2", "Asha ticket 2", "Asha #2"  -> that person's ticket 2 (email or name, any part of it)
 *   "asha@example.com", "Asha"                        -> all of that person's tickets
 *   "ticket 2"                                        -> everyone's ticket 2
 *   "49", "#49", "id 49"                              -> the internal id
 * Null when there is nothing to search.
 */
export function parseTicketSearch(raw: unknown): TicketSearch | null {
  if (typeof raw !== "string") return null;
  const q = raw.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!q) return null;
  const id = /^(?:id\s*)?#?(\d+)$/i.exec(q);
  if (id) {
    const n = num(id[1]);
    return n ? { kind: "id", id: n } : null;
  }
  const only = /^ticket\s*#?(\d+)$/i.exec(q);
  if (only) {
    const n = num(only[1]);
    return n ? { kind: "number", number: n } : null;
  }
  const withN = /^(.*?)[\s,]+(?:ticket\s*)?#?(\d+)$/i.exec(q);
  if (withN && withN[1].trim()) {
    const n = num(withN[2]);
    if (n) return { kind: "person", who: withN[1].trim(), number: n };
  }
  return { kind: "person", who: q, number: null };
}

/** A LIKE pattern that matches the words anywhere, with LIKE's own wildcards taken literally (ESCAPE '\'). */
export function likeAnywhere(s: string): string {
  return `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
