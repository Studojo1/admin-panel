// ACTIVES (14 Nov 2026): the "actives" section of /api/stu/overview, the Active users panel on /usage. The counting is
// actives.ts (pure, tested); this hands it the activity model, the people in scope and their pay and setup times.
import { type Filters, type StuData, activity, istDay, scopeUsers, stepAt, todayIst } from "./model";
import { type ActivesBody, activesBody } from "./actives";
import type { Refs } from "./overview";

export function activesSection(d: StuData, f: Filters, refs: Refs): ActivesBody & { rule: string } {
  const scope = new Set(scopeUsers(d, f));
  const body = activesBody(f, {
    act: activity(d),
    scope,
    joined: (u) => d.users[u].joined,
    paidAt: (u) => stepAt(d, d.users[u], "paid"),
    onboardedAt: (u) => stepAt(d, d.users[u], "onboarded"),
    countFromDay: d.countFrom != null ? istDay(d.countFrom) : null,
    today: todayIst(),
  }, (c) => refs.cell(c));
  return { ...body, rule: ACTIVES_HOW };
}

/** The one "how we count" line under the panel. */
export const ACTIVES_HOW =
  "Active: the student did something themselves that IST day, on the site, WhatsApp, iMessage or a call (opened the desk or a job, saved, applied, chatted, tapped a WhatsApp message). Rows our system makes do not count: outreach auto-adds, sequence emails, match states, digests sent. Team and test accounts are out. DAU is the range's last day, WAU the 7 days and MAU the 30 days to it; nothing before the count-from line is counted.";
