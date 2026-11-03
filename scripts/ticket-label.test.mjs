// node --test scripts/ticket-label.test.mjs
// TICKET-REF (3 Nov 2026, the owner: "or bind it to the user, users first ticket or the name of the ticket like for
// the user"): the Tickets page names and numbers a ticket as the student sees it in Stu and Settings, Help ("Your
// ticket 2: Delete my account"), and finds it by email or name plus that number, or by the internal id.
// Imports the TypeScript source directly: Node 22.18+ strips the types itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TICKET_NAME_MAX, likeAnywhere, parseTicketSearch, ticketName } from "../app/lib/ticket-label.ts";

const read = (p) => readFileSync(new URL(`../app/${p}`, import.meta.url), "utf8");

// The same vectors as career-agent tests/ticket-ref.test.ts: a ticket's name here is the name the student sees.
const NAME_VECTORS = [
  [{ summary: "Paid, plan not showing; checked Settings, Plan", firstMessage: "I paid", category: "billing" }, "Paid, plan not showing; checked Settings, Plan"],
  [{ summary: null, firstMessage: "\n  app crashes on startup.\nIt shows a white screen", category: "bug" }, "App crashes on startup"],
  [{ summary: "Delete my account", firstMessage: "Please delete my Studojo account and everything you keep about me.", category: "data_deletion" }, "Delete my account"],
  [{ summary: "  ", firstMessage: "", category: "data_deletion" }, "Deleting my data"],
  [{ summary: null, firstMessage: null, category: "nonsense" }, "Something else"],
  [{ summary: "Sign in fails \u2014 Google says error", firstMessage: "x", category: "sign_in" }, "Sign in fails, Google says error"],
  [{ summary: "a", firstMessage: "Credits   gone\tafter top up...", category: "billing" }, "Credits gone after top up"],
  [
    { summary: null, firstMessage: "I tried to link WhatsApp three times today and every time it says the code expired", category: "whatsapp" },
    "I tried to link WhatsApp three times today and every time…",
  ],
  [{ summary: null, firstMessage: "Supercalifragilisticexpialidocious".repeat(3), category: "other" }, `${"Supercalifragilisticexpialidocious".repeat(3).slice(0, TICKET_NAME_MAX - 1)}…`],
];

test("a ticket's name: the summary, else the first line of its first message, else the category (as Stu shows it)", () => {
  for (const [input, want] of NAME_VECTORS) assert.equal(ticketName(input), want, JSON.stringify(input));
  for (const [input] of NAME_VECTORS) assert.ok(ticketName(input).length <= TICKET_NAME_MAX);
});

test("search: email or name plus their number, everyone's ticket N, or the internal id", () => {
  assert.deepEqual(parseTicketSearch("asha@example.com 2"), { kind: "person", who: "asha@example.com", number: 2 });
  assert.deepEqual(parseTicketSearch("  Asha   Rao  ticket 3 "), { kind: "person", who: "Asha Rao", number: 3 });
  assert.deepEqual(parseTicketSearch("Asha #4"), { kind: "person", who: "Asha", number: 4 });
  assert.deepEqual(parseTicketSearch("asha, 5"), { kind: "person", who: "asha", number: 5 });
  assert.deepEqual(parseTicketSearch("asha@example.com"), { kind: "person", who: "asha@example.com", number: null });
  assert.deepEqual(parseTicketSearch("user123"), { kind: "person", who: "user123", number: null }, "digits in a name are the name");
  assert.deepEqual(parseTicketSearch("ticket 2"), { kind: "number", number: 2 });
  assert.deepEqual(parseTicketSearch("#49"), { kind: "id", id: 49 });
  assert.deepEqual(parseTicketSearch("49"), { kind: "id", id: 49 });
  assert.deepEqual(parseTicketSearch("id 49"), { kind: "id", id: 49 });
  assert.equal(parseTicketSearch("   "), null);
  assert.equal(parseTicketSearch(null), null);
  assert.equal(parseTicketSearch("#99999999999"), null, "past int4");
  assert.equal(likeAnywhere("a_b%c\\d"), "%a\\_b\\%c\\\\d%");
});

test("the list and the detail number tickets as Stu does and stay admin only", () => {
  const numbered = read("lib/ticket-number.server.ts");
  assert.match(numbered, /row_number\(\) OVER \(\s*PARTITION BY COALESCE\(t\.user_id::text, lower\(t\.user_email\)\), t\.source\s*ORDER BY t\.created_at, t\.id\s*\)::int AS user_number/);
  const list = read("routes/api.tickets.tsx");
  assert.match(list, /WITH numbered AS \(\$\{numberedTickets\}\)/);
  assert.match(list, /FROM numbered t/);
  assert.match(list, /ORDER BY m\.created_at ASC, m\.id ASC LIMIT 1/, "the first message, as Stu names it");
  assert.match(list, /ticketName\(\{ summary: r\.context\?\.summary, firstMessage: r\.first_message, category: r\.category \}\)/);
  assert.match(numbered, /ILIKE \$\{like\} ESCAPE/);
  assert.match(list, /requireAdmin\(request\)/);
  const one = read("routes/api.tickets.$id.tsx");
  assert.match(one, /FROM numbered WHERE id = \$\{id\}/);
  assert.match(one, /requireAdmin\(request\)/);
  const page = read("routes/tickets.tsx");
  assert.match(page, /ticket \{t\.user_number\}/);
  assert.match(page, /Ticket \{t\.user_number\}: \{t\.name\}/);
  assert.match(page, /params\.set\("q", search\)/);
  assert.match(read("routes/tickets.$id.tsx"), /ticket \{detail\.user_number\}: \{detail\.name\}/);
});
