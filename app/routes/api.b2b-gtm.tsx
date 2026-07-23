import type { Route } from "./+types/api.b2b-gtm";
import { requireAdmin } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

/**
 * B2B GTM Motion tracker API.
 *
 * This repo has no migration framework, so the tables are created idempotently
 * on first touch. Cheap after the first call and identical on staging and prod.
 * All timestamps are timestamptz: the app writes tz-aware values and naive
 * `timestamp` columns reject them.
 */
async function ensureTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS b2b_companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'cold_call_done',
      temperature TEXT,
      status TEXT,
      owner TEXT,
      whatsapp_group_made BOOLEAN NOT NULL DEFAULT FALSE,
      needs_brochure BOOLEAN NOT NULL DEFAULT FALSE,
      brochure_note TEXT,
      needs_leads BOOLEAN NOT NULL DEFAULT FALSE,
      leads_note TEXT,
      leads_change BOOLEAN NOT NULL DEFAULT FALSE,
      leads_change_note TEXT,
      needs_my_followup BOOLEAN NOT NULL DEFAULT FALSE,
      my_followup_note TEXT,
      next_action_at TIMESTAMPTZ,
      next_action_reason TEXT,
      they_reachout_on TEXT,
      deal_value NUMERIC,
      next_purchase_due TIMESTAMPTZ,
      blocker_type TEXT,
      blocker_note TEXT,
      lost_reason TEXT,
      lost_feedback TEXT,
      comeback_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS b2b_contacts (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES b2b_companies(id) ON DELETE CASCADE,
      name TEXT,
      phone TEXT,
      role TEXT,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      is_inactive BOOLEAN NOT NULL DEFAULT FALSE,
      left_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Additive columns for tables that predate them. Postgres supports
  // IF NOT EXISTS here, so this is safe to run on every request.
  await db.execute(sql`ALTER TABLE b2b_contacts ADD COLUMN IF NOT EXISTS is_inactive BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE b2b_contacts ADD COLUMN IF NOT EXISTS left_note TEXT`);

  // Append-only. A company's current state is a projection of its latest row here.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS b2b_call_logs (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES b2b_companies(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES b2b_contacts(id) ON DELETE SET NULL,
      called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      kind TEXT NOT NULL DEFAULT 'call',
      picked_up BOOLEAN NOT NULL DEFAULT FALSE,
      attendees TEXT,
      outcome TEXT,
      objection TEXT,
      temperature_at_time TEXT,
      note TEXT,
      next_action_at TIMESTAMPTZ,
      value_discussed NUMERIC,
      logged_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`ALTER TABLE b2b_call_logs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'call'`);
  await db.execute(sql`ALTER TABLE b2b_call_logs ADD COLUMN IF NOT EXISTS objection_note TEXT`);
  await db.execute(sql`ALTER TABLE b2b_call_logs ADD COLUMN IF NOT EXISTS attendees TEXT`);
  await db.execute(sql`ALTER TABLE b2b_companies ADD COLUMN IF NOT EXISTS needs_leads BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE b2b_companies ADD COLUMN IF NOT EXISTS leads_note TEXT`);
  await db.execute(sql`ALTER TABLE b2b_companies ADD COLUMN IF NOT EXISTS leads_change BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE b2b_companies ADD COLUMN IF NOT EXISTS leads_change_note TEXT`);
  await db.execute(sql`ALTER TABLE b2b_companies ADD COLUMN IF NOT EXISTS needs_my_followup BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE b2b_companies ADD COLUMN IF NOT EXISTS my_followup_note TEXT`);

  // The seed used to prefix imported notes with "Imported from Excel: ".
  // Strip it in place so the notes read exactly as they were written, without
  // forcing a re-import that would discard calls logged since.
  await db.execute(sql`
    UPDATE b2b_call_logs
    SET note = regexp_replace(note, '^Imported from Excel: ', '')
    WHERE note LIKE 'Imported from Excel: %'
  `);

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS b2b_companies_next_action_idx ON b2b_companies (next_action_at)`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS b2b_call_logs_company_idx ON b2b_call_logs (company_id, called_at DESC)`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS b2b_contacts_company_idx ON b2b_contacts (company_id)`
  );
}

/**
 * The 21 rows from "B2B GTM Motion - Sheet1.csv".
 *
 * Notes are preserved verbatim. Stage/blocker/lost-reason are INFERRED from the
 * note text and flagged for the user to correct in the UI. Free-text dates
 * ("20th", "call on 16") are deliberately not parsed into real timestamps —
 * they land in next_action_reason for manual triage rather than risk scheduling
 * a call on the wrong day.
 *
 * The sheet's green/yellow/blue cell colours (closed / needs-chasing /
 * team-handled) do not survive CSV export, so `owner` starts empty everywhere.
 */
const SEED_ROWS: Array<{
  contact: string;
  company: string;
  phone?: string;
  reachoutNote?: string;
  theyReachout?: string;
  temperature?: string;
  status?: string;
  notes?: string;
  stage: string;
  dealValue?: number;
  blockerType?: string;
  lostReason?: string;
  needsBrochure?: boolean;
  needsLeads?: boolean;
  leadsNote?: string;
}> = [
  {
    contact: "Vamsi",
    company: "ATA",
    phone: "9486215579",
    temperature: "cold",
    status: "awaiting_response",
    notes: "15-30 students B2B2C,",
    stage: "gtm_active",
  },
  {
    contact: "Anisha",
    company: "Sharpner tech",
    phone: "9871025029",
    temperature: "hot",
    status: "accepted",
    notes:
      "100 contacts on 4k, need to send invoice to test, she already used 10, will schedule demo call tomo (try to give her bob by thrusday)",
    stage: "negotiating",
    dealValue: 4000,
  },
  {
    contact: "Senthil",
    company: "Bluecode",
    phone: "6382215245",
    status: "declined",
    notes: "Doesnt have money.",
    stage: "feedback_pending",
    lostReason: "no_budget",
  },
  {
    contact: "Hiren",
    company: "Mahika",
    phone: "9820282701",
    status: "accepted",
    notes: "Accepted to sign PO for 10k (Phone numbers)",
    stage: "closed_won",
    dealValue: 10000,
  },
  {
    contact: "Vimal Singh",
    company: "Board infinity",
    phone: "9867025843",
    theyReachout: "He will reachout on 14th July",
    temperature: "cold",
    status: "awaiting_response",
    notes:
      "Not interested with the B2B, but call him later on to get feedback on why hes not interested",
    stage: "feedback_pending",
    lostReason: "not_in_space",
  },
  {
    contact: "Rohan sanija",
    company: "Polaris",
    phone: "9015113737",
    temperature: "warm",
    notes: "pricing for just intelignece and lead based pricing",
    stage: "blocked_pricing",
    blockerType: "pricing",
  },
  {
    contact: "Sudipta",
    company: "Newton school",
    phone: "8597376616",
    status: "declined",
    notes: "got annual plan of lusha and revspot",
    stage: "feedback_pending",
    lostReason: "competitor_contract",
  },
  {
    contact: "Rohit",
    company: "Mesa",
    temperature: "warm",
    status: "awaiting_response",
    stage: "gtm_active",
  },
  {
    contact: "Sahil",
    company: "Preplaced",
    phone: "8237372919",
    temperature: "warm",
    status: "awaiting_response",
    notes: "Happy with leads, asking for pricing",
    stage: "blocked_pricing",
    blockerType: "pricing",
  },
  {
    contact: "satish",
    company: "Palle",
    phone: "9740588499",
    reachoutNote: "20th",
    temperature: "neutral",
    status: "awaiting_response",
    notes: "Wants to try B2B tool, has not used B2C leads yet, BD team busy",
    stage: "blocked_timing",
    blockerType: "timing",
  },
  {
    contact: "Rajat or Raghav",
    company: "Unsaid talks",
    phone: "7303573374",
    temperature: "warm",
    status: "awaiting_response",
    notes: "Need to check capmign, D2c got 2 conatacts",
    stage: "gtm_active",
  },
  {
    contact: "Nikhil",
    company: "upspir",
    phone: "9818547905",
    reachoutNote: "16th",
    temperature: "hot",
    status: "awaiting_response",
    notes: "Need to send new updated leads",
    stage: "gtm_active",
    needsLeads: true,
    leadsNote: "New updated leads",
  },
  {
    contact: "Umar/Afsal (Jr)",
    company: "Brototype",
    phone: "9995591306 (Afsal)",
    reachoutNote: "call on 16",
    temperature: "neutral",
    status: "awaiting_response",
    notes:
      "Pitch b2b, deadline, told his students will use outreach, he hiring for coldcallers",
    stage: "gtm_active",
  },
  {
    contact: "Jatin miglani",
    company: "Ethans",
    phone: "9527354004",
    notes: "Pitch B2B, B2B2C, 2 weeks ago he said his team will get back to us",
    stage: "gtm_active",
  },
  {
    contact: "Akshee",
    company: "Kulture hire",
    phone: "8890074827",
    notes:
      "Did not B2B2C(liked product) Were not investing in placements, spoke more than a month and a half back",
    stage: "feedback_pending",
    lostReason: "not_in_space",
  },
  {
    contact: "Himanshu (founder)",
    company: "Fin X",
    phone: "9324845088",
    temperature: "warm",
    status: "awaiting_response",
    notes: "Will add tech team to grp, to get back with pricing",
    stage: "blocked_approval",
    blockerType: "approval",
  },
  {
    contact: "Adhithya",
    company: "Skillfyme",
    phone: "9074416276",
    notes:
      "She joined, she has to sedn 3 resumes, she has appolo she might buy next month, might have price objection, she liked the leads and platform (premade leads), she wants the 7 day free trials, she wants pricing as of 16th",
    stage: "blocked_pricing",
    blockerType: "pricing",
  },
  {
    contact: "Ankita",
    company: "Analytics lab",
    phone: "9910446413",
    reachoutNote: "Need to send brochure on 15th",
    notes: "She loved tool, need to share pricing",
    stage: "blocked_pricing",
    blockerType: "pricing",
    needsBrochure: true,
  },
  {
    contact: "Akshita",
    company: "FutureNSE",
    reachoutNote: "Ask jeremy to get back on the 16th",
    notes:
      "From mesa, jery batchmate, she handles placements, not done anything regarding this, full pitch for bob given and the leads have been sent, she liked the product, she'll get back",
    stage: "gtm_active",
  },
  {
    contact: "Aman",
    company: "Masai",
    phone: "8210251639",
    notes: "No whatsapp yet",
    stage: "cold_call_done",
  },
  {
    contact: "Bibek",
    company: "Presidency",
    phone: "7008972494",
    reachoutNote: "20th",
    stage: "gtm_active",
  },
];

async function seedIfEmpty(loggedBy: string) {
  const existing = await db.execute(sql`SELECT COUNT(*)::int AS n FROM b2b_companies`);
  const n = (existing.rows[0] as any)?.n ?? 0;
  if (n > 0) return { seeded: false, count: n };

  for (const row of SEED_ROWS) {
    const whatsappMade = row.stage !== "cold_call_done";
    const inserted = await db.execute(sql`
      INSERT INTO b2b_companies (
        name, stage, temperature, status, whatsapp_group_made,
        needs_brochure, needs_leads, leads_note, next_action_reason, they_reachout_on,
        deal_value, blocker_type, lost_reason, notes
      ) VALUES (
        ${row.company.trim()},
        ${row.stage},
        ${row.temperature ?? null},
        ${row.status ?? null},
        ${whatsappMade},
        ${row.needsBrochure ?? false},
        ${row.needsLeads ?? false},
        ${row.leadsNote ?? null},
        ${row.reachoutNote ?? null},
        ${row.theyReachout ?? null},
        ${row.dealValue ?? null},
        ${row.blockerType ?? null},
        ${row.lostReason ?? null},
        ${row.notes ?? null}
      )
      RETURNING id
    `);
    const companyId = (inserted.rows[0] as any).id as number;

    await db.execute(sql`
      INSERT INTO b2b_contacts (company_id, name, phone, is_primary)
      VALUES (${companyId}, ${row.contact.trim()}, ${row.phone ?? null}, TRUE)
    `);

    // Seed one synthetic log row so the timeline is never empty and the
    // imported context shows up as "where we left things off".
    if (row.notes) {
      await db.execute(sql`
        INSERT INTO b2b_call_logs (
          company_id, kind, picked_up, outcome, temperature_at_time, note, logged_by
        ) VALUES (
          ${companyId}, 'call', TRUE, NULL, ${row.temperature ?? null},
          ${row.notes}, ${loggedBy}
        )
      `);
    }
  }

  return { seeded: true, count: SEED_ROWS.length };
}

/**
 * Phone numbers and late additions from the updated sheet.
 *
 * seedIfEmpty() no-ops once companies exist, so this is the path for
 * corrections to an already-populated board. Idempotent: phones only fill a
 * blank, and companies/contacts are matched before insert. Notes are
 * deliberately NOT touched — the board's own notes are now the source of truth.
 */
const PHONE_BACKFILL: { company: string; contact: string; phone: string }[] = [
  { company: "ATA", contact: "Vamsi", phone: "9486215579" },
  { company: "Sharpner tech", contact: "Anisha", phone: "9871025029" },
  { company: "Bluecode", contact: "Senthil", phone: "6382215245" },
  { company: "Mahika", contact: "Hiren", phone: "9820282701" },
  { company: "Board infinity", contact: "Vimal Singh", phone: "9867025843" },
  { company: "Polaris", contact: "Rohan sanija", phone: "9015113737" },
  { company: "Newton school", contact: "Sudipta", phone: "8597376616" },
  { company: "Preplaced", contact: "Sahil", phone: "8237372919" },
  { company: "Palle", contact: "satish", phone: "9740588499" },
  { company: "Unsaid talks", contact: "Rajat or Raghav", phone: "7303573374" },
  { company: "upspir", contact: "Nikhil", phone: "9818547905" },
  { company: "Ethans", contact: "Jatin miglani", phone: "9527354004" },
  { company: "Kulture hire", contact: "Akshee", phone: "8890074827" },
  { company: "Eduleem", contact: "Shiladitya", phone: "9123623532" },
  { company: "Fin X", contact: "Himanshu (founder)", phone: "9324845088" },
  { company: "Skillfyme", contact: "Adhithya", phone: "9074416276" },
  { company: "Analytics lab", contact: "Ankita", phone: "9910446413" },
  { company: "Masai", contact: "Aman", phone: "8210251639" },
  { company: "Presidency", contact: "Bibek", phone: "7008972494" },
  { company: "Brototype", contact: "Umar/Afsal (Jr)", phone: "9995591306 (Afsal)" },
];

/** Companies on the sheet that aren't on the board yet. */
const NEW_COMPANIES: { company: string; contact: string; phone?: string }[] = [
  { company: "Eduleem", contact: "Shiladitya" },
];

/**
 * Extra people at companies that ALREADY exist. Kept separate from
 * NEW_COMPANIES on purpose: adding "Kulture hire / Kadhiravan" as a company
 * would fork the account and strand Akshee's history on the old row.
 */
const NEW_CONTACTS: { company: string; contact: string; phone?: string }[] = [
  { company: "Kulture hire", contact: "Kadhiravan" },
];

async function backfillFromSheet(loggedBy: string) {
  let phonesSet = 0;
  let contactsAdded = 0;
  let companiesAdded = 0;

  const findCompany = async (name: string) => {
    const r = await db.execute(
      sql`SELECT id FROM b2b_companies WHERE LOWER(TRIM(name)) = ${name.trim().toLowerCase()} LIMIT 1`
    );
    return r.rows.length ? ((r.rows[0] as any).id as number) : null;
  };

  // 1. Phones. Matched on the COMPANY, not the person: contacts get renamed
  //    and replaced (Akshee -> KD at Kulture Hire), and an earlier version of
  //    this matched on contact name, so a renamed contact silently created a
  //    duplicate row that carried the number while the card kept showing the
  //    original — the number looked missing. Fill the contact the card
  //    actually displays: the first ACTIVE one, else the first one at all.
  //    Never overwrite a number already present, so manual edits win.
  for (const row of PHONE_BACKFILL) {
    const companyId = await findCompany(row.company);
    if (!companyId) continue;

    const target = await db.execute(sql`
      SELECT id, phone FROM b2b_contacts
      WHERE company_id = ${companyId}
      ORDER BY is_inactive ASC, is_primary DESC, id ASC
      LIMIT 1
    `);

    if (target.rows.length) {
      const c = target.rows[0] as any;
      if (!c.phone || !String(c.phone).trim()) {
        await db.execute(sql`UPDATE b2b_contacts SET phone = ${row.phone} WHERE id = ${c.id}`);
        phonesSet++;
      }
    } else {
      // Company exists with no contact at all — create the one from the sheet.
      await db.execute(sql`
        INSERT INTO b2b_contacts (company_id, name, phone, is_primary)
        VALUES (${companyId}, ${row.contact.trim()}, ${row.phone}, TRUE)
      `);
      contactsAdded++;
    }
  }

  // 1b. Clean up duplicate contacts the old name-matching backfill created:
  //     a second row with the same phone as the sheet, no history attached,
  //     sitting behind the contact the card displays.
  for (const row of PHONE_BACKFILL) {
    const companyId = await findCompany(row.company);
    if (!companyId) continue;
    await db.execute(sql`
      DELETE FROM b2b_contacts
      WHERE company_id = ${companyId}
        AND phone = ${row.phone}
        AND is_primary = FALSE
        AND is_inactive = FALSE
        AND id NOT IN (SELECT contact_id FROM b2b_call_logs WHERE contact_id IS NOT NULL)
        AND id <> (
          SELECT id FROM b2b_contacts
          WHERE company_id = ${companyId}
          ORDER BY is_inactive ASC, is_primary DESC, id ASC
          LIMIT 1
        )
    `);
  }

  // 2. Companies not on the board yet.
  for (const row of NEW_COMPANIES) {
    if (await findCompany(row.company)) continue;
    const ins = await db.execute(sql`
      INSERT INTO b2b_companies (name, stage, whatsapp_group_made)
      VALUES (${row.company.trim()}, 'cold_call_done', FALSE)
      RETURNING id
    `);
    const companyId = (ins.rows[0] as any).id as number;
    await db.execute(sql`
      INSERT INTO b2b_contacts (company_id, name, phone, is_primary)
      VALUES (${companyId}, ${row.contact.trim()}, ${row.phone ?? null}, TRUE)
    `);
    companiesAdded++;
  }

  // 3. Extra contacts at existing companies.
  for (const row of NEW_CONTACTS) {
    const companyId = await findCompany(row.company);
    if (!companyId) continue;
    const dupe = await db.execute(sql`
      SELECT id FROM b2b_contacts
      WHERE company_id = ${companyId}
        AND LOWER(TRIM(name)) = ${row.contact.trim().toLowerCase()}
      LIMIT 1
    `);
    if (dupe.rows.length) continue;

    // Primary only if every existing contact has gone inactive.
    const active = await db.execute(
      sql`SELECT COUNT(*)::int AS n FROM b2b_contacts WHERE company_id = ${companyId} AND NOT is_inactive`
    );
    const isPrimary = ((active.rows[0] as any).n ?? 0) === 0;

    await db.execute(sql`
      INSERT INTO b2b_contacts (company_id, name, phone, is_primary)
      VALUES (${companyId}, ${row.contact.trim()}, ${row.phone ?? null}, ${isPrimary})
    `);
    await db.execute(sql`
      INSERT INTO b2b_call_logs (company_id, kind, picked_up, note, logged_by)
      VALUES (${companyId}, 'note', FALSE, ${"Added " + row.contact.trim() + " from the sheet."}, ${loggedBy})
    `);
    contactsAdded++;
  }

  return { phonesSet, contactsAdded, companiesAdded };
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTables();

  const url = new URL(request.url);

  // Everything the company detail page needs, in one round trip.
  const companyId = url.searchParams.get("company_id");
  if (companyId) {
    const id = parseInt(companyId);
    const [company, contacts, logs] = await Promise.all([
      db.execute(sql`SELECT * FROM b2b_companies WHERE id = ${id}`),
      db.execute(
        sql`SELECT * FROM b2b_contacts WHERE company_id = ${id} ORDER BY is_inactive ASC, is_primary DESC, id ASC`
      ),
      db.execute(sql`
        SELECT l.*, c.name AS contact_name
        FROM b2b_call_logs l
        LEFT JOIN b2b_contacts c ON c.id = l.contact_id
        WHERE l.company_id = ${id}
        ORDER BY l.called_at DESC
      `),
    ]);
    if (company.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({
      company: { ...(company.rows[0] as any), contacts: contacts.rows },
      logs: logs.rows,
      me: admin.email,
    });
  }

  const [companies, contacts, lastLogs, stats, objectionStats] = await Promise.all([
    db.execute(sql`SELECT * FROM b2b_companies ORDER BY next_action_at ASC NULLS LAST, name ASC`),
    // Inactive contacts must never win the primary slot the cards read from.
    db.execute(sql`SELECT * FROM b2b_contacts ORDER BY is_inactive ASC, is_primary DESC, id ASC`),
    // Latest log per company — the "where we left things off" projection.
    db.execute(sql`
      SELECT DISTINCT ON (company_id) *
      FROM b2b_call_logs
      ORDER BY company_id, called_at DESC
    `),
    db.execute(sql`
      SELECT
        -- Exited (parked) companies are out of the active pipeline: they don't
        -- count as a live company or as due work.
        COUNT(*) FILTER (WHERE stage <> 'exited')::int AS total,
        -- Overdue OR scheduled later today: a 3pm callback counts at 9am.
        -- Both sides compared in IST, since that's the working day.
        COUNT(*) FILTER (
          WHERE stage <> 'exited' AND (
            next_action_at <= NOW()
            OR (next_action_at AT TIME ZONE 'Asia/Kolkata')::date
               = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
          )
        )::int AS due_now,
        COUNT(*) FILTER (WHERE temperature = 'hot' AND stage <> 'exited')::int AS hot,
        COUNT(*) FILTER (WHERE stage LIKE 'blocked_%')::int AS blocked,
        COUNT(*) FILTER (WHERE stage = 'exited')::int AS exited,
        COUNT(*) FILTER (WHERE needs_brochure AND stage <> 'exited')::int AS brochures,
        COUNT(*) FILTER (WHERE needs_leads AND stage <> 'exited')::int AS leads_wanted,
        COUNT(*) FILTER (WHERE leads_change AND stage <> 'exited')::int AS leads_to_fix,
        COUNT(*) FILTER (WHERE stage IN ('closed_won','onboarding','using','renewal_due','expansion_pitch','repeat_buyer'))::int AS accounts,
        COUNT(*) FILTER (WHERE next_purchase_due IS NOT NULL AND next_purchase_due <= NOW() + INTERVAL '7 days')::int AS renewals_due,
        COALESCE(SUM(deal_value) FILTER (WHERE stage IN ('closed_won','onboarding','using','renewal_due','expansion_pitch','repeat_buyer')), 0) AS committed_value
      FROM b2b_companies
    `),
    // Why isn't BOB closing — a GROUP BY, not a guess.
    // "Other" groups by what was actually typed, so it never collapses into a
    // single unactionable row.
    db.execute(sql`
      SELECT
        objection,
        CASE WHEN objection = 'other' THEN objection_note ELSE NULL END AS detail,
        COUNT(*)::int AS n
      FROM b2b_call_logs
      WHERE objection IS NOT NULL
      GROUP BY objection, CASE WHEN objection = 'other' THEN objection_note ELSE NULL END
      ORDER BY n DESC
    `),
  ]);

  const contactsByCompany = new Map<number, any[]>();
  for (const c of contacts.rows as any[]) {
    const list = contactsByCompany.get(c.company_id) ?? [];
    list.push(c);
    contactsByCompany.set(c.company_id, list);
  }

  const lastLogByCompany = new Map<number, any>();
  for (const l of lastLogs.rows as any[]) {
    lastLogByCompany.set(l.company_id, l);
  }

  const enriched = (companies.rows as any[]).map((c) => ({
    ...c,
    contacts: contactsByCompany.get(c.id) ?? [],
    last_log: lastLogByCompany.get(c.id) ?? null,
  }));

  return Response.json({
    companies: enriched,
    stats: stats.rows[0],
    objection_stats: objectionStats.rows,
    me: admin.email,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTables();

  const url = new URL(request.url);
  const intent = url.searchParams.get("action");

  if (intent === "seed") {
    const result = await seedIfEmpty(admin.email);
    return Response.json(result);
  }

  // Corrections from an updated sheet, for a board that's already populated.
  if (intent === "backfill") {
    const result = await backfillFromSheet(admin.email);
    return Response.json(result);
  }

  const body = await request.json();

  if (request.method === "POST" && intent === "company") {
    const inserted = await db.execute(sql`
      INSERT INTO b2b_companies (
        name, stage, temperature, status, owner, whatsapp_group_made,
        needs_brochure, brochure_note, next_action_at, next_action_reason,
        they_reachout_on, notes
      ) VALUES (
        ${body.name},
        ${body.stage ?? "cold_call_done"},
        ${body.temperature ?? null},
        ${body.status ?? null},
        ${body.owner ?? null},
        ${body.whatsapp_group_made ?? false},
        ${body.needs_brochure ?? false},
        ${body.brochure_note ?? null},
        ${body.next_action_at ?? null},
        ${body.next_action_reason ?? null},
        ${body.they_reachout_on ?? null},
        ${body.notes ?? null}
      )
      RETURNING id
    `);
    const companyId = (inserted.rows[0] as any).id as number;

    if (body.contact_name || body.contact_phone) {
      await db.execute(sql`
        INSERT INTO b2b_contacts (company_id, name, phone, role, is_primary)
        VALUES (${companyId}, ${body.contact_name ?? null}, ${body.contact_phone ?? null}, ${
        body.contact_role ?? null
      }, TRUE)
      `);
    }

    return Response.json({ id: companyId });
  }

  /**
   * A dated note: something they said, feedback, or an action for us. Not a
   * call, so it carries no outcome and never touches stage or temperature.
   * The accumulation of these is the context.
   */
  if (request.method === "POST" && intent === "note") {
    // `stage` and `new_owner` are OPTIONAL: a plain note never moves the pipeline
    // (that would let jotting skew things). They're only sent when the user
    // explicitly flips "this note changes where they are" and confirms the move.
    const { company_id, note, next_action_at, next_action_reason, stage, new_owner } = body;

    if (!note?.trim()) {
      return Response.json({ error: "A note needs something in it." }, { status: 400 });
    }

    await db.execute(sql`
      INSERT INTO b2b_call_logs (company_id, kind, picked_up, note, next_action_at, logged_by)
      VALUES (${company_id}, 'note', FALSE, ${note.trim()}, ${next_action_at ?? null}, ${admin.email})
    `);

    // A handoff that comes with the note is part of the story — log it, reading
    // the old owner first so the comparison means something.
    if (new_owner !== undefined) {
      const cur = await db.execute(sql`SELECT owner FROM b2b_companies WHERE id = ${company_id}`);
      const before = (((cur.rows[0] as any)?.owner ?? "") as string).trim();
      const after = (new_owner ?? "").trim();
      if (before !== after) {
        const name = (o: string) => (o ? o : "Me");
        await db.execute(sql`
          INSERT INTO b2b_call_logs (company_id, kind, picked_up, note, logged_by)
          VALUES (${company_id}, 'handoff', FALSE, ${`Handed from ${name(before)} to ${name(after)}.`}, ${admin.email})
        `);
      }
    }

    const sets = [sql`updated_at = NOW()`];
    if (next_action_at) {
      sets.push(sql`next_action_at = ${next_action_at}`);
      sets.push(sql`next_action_reason = ${next_action_reason || note.trim().slice(0, 120)}`);
    }
    if (stage) sets.push(sql`stage = ${stage}`);
    if (new_owner !== undefined) sets.push(sql`owner = ${new_owner || null}`);

    await db.execute(
      sql`UPDATE b2b_companies SET ${sql.join(sets, sql`, `)} WHERE id = ${company_id}`
    );

    return Response.json({ ok: true });
  }

  /**
   * Park a company out of the active pipeline. NOT the same as closing it lost:
   * this is "not worth chasing right now". Requires a reason (enforced here, not
   * just in the form) so the Exit tab is never a bucket of unexplained rows.
   * Reversible via `reactivate`. Stored in lost_reason/lost_feedback columns,
   * which the objection stats never read (those group call-log objections).
   */
  if (request.method === "POST" && intent === "exit") {
    const { company_id, exit_reason, exit_feedback } = body;

    if (!exit_reason) {
      return Response.json(
        { error: "Say why you're removing them — the Exit tab needs a reason." },
        { status: 400 }
      );
    }
    if ((exit_reason === "other" || exit_reason === "bad_fit") && !exit_feedback?.trim()) {
      return Response.json(
        { error: "That reason needs a line of detail." },
        { status: 400 }
      );
    }

    await db.execute(sql`
      UPDATE b2b_companies
      SET stage = 'exited',
          lost_reason = ${exit_reason},
          lost_feedback = ${exit_feedback?.trim() || null},
          needs_my_followup = FALSE,
          next_action_at = NULL,
          next_action_reason = NULL,
          updated_at = NOW()
      WHERE id = ${company_id}
    `);

    await db.execute(sql`
      INSERT INTO b2b_call_logs (company_id, kind, picked_up, note, logged_by)
      VALUES (
        ${company_id}, 'note', FALSE,
        ${"Exited the pipeline — " + exit_reason + (exit_feedback?.trim() ? `: ${exit_feedback.trim()}` : "")},
        ${admin.email}
      )
    `);

    return Response.json({ ok: true });
  }

  /**
   * Bring a parked company back into the active pipeline. Lands at gtm_active,
   * unowned (mine again), and asks for a next action so it never re-enters as a
   * dead row. Clears the exit reason since it's no longer exited.
   */
  if (request.method === "POST" && intent === "reactivate") {
    const { company_id, next_action_at, next_action_reason } = body;

    await db.execute(sql`
      UPDATE b2b_companies
      SET stage = 'gtm_active',
          owner = NULL,
          lost_reason = NULL,
          lost_feedback = NULL,
          next_action_at = ${next_action_at ?? null},
          next_action_reason = ${next_action_reason || "Brought back into the pipeline"},
          updated_at = NOW()
      WHERE id = ${company_id}
    `);

    await db.execute(sql`
      INSERT INTO b2b_call_logs (company_id, kind, picked_up, note, next_action_at, logged_by)
      VALUES (
        ${company_id}, 'note', FALSE,
        'Brought back into the pipeline.',
        ${next_action_at ?? null}, ${admin.email}
      )
    `);

    return Response.json({ ok: true });
  }

  /**
   * The contact moved on and handed us to someone else (Akshee -> Kulture Hire).
   * This says NOTHING about interest, so it deliberately touches neither
   * `outcome` nor stage/temperature. The company and its whole timeline stay
   * exactly where they are; only who we call changes.
   */
  if (request.method === "POST" && intent === "contact_change") {
    const {
      company_id,
      old_contact_id,
      left_note,
      new_name,
      new_phone,
      new_role,
      note,
      next_action_at,
      next_action_reason,
    } = body;

    if (!new_name && !new_phone) {
      return Response.json(
        { error: "A replacement contact needs at least a name or a phone number." },
        { status: 400 }
      );
    }

    // Retire the old contact but keep the row: their history stays readable.
    if (old_contact_id) {
      await db.execute(sql`
        UPDATE b2b_contacts
        SET is_inactive = TRUE, is_primary = FALSE, left_note = ${left_note || null}
        WHERE id = ${old_contact_id}
      `);
    }

    const ins = await db.execute(sql`
      INSERT INTO b2b_contacts (company_id, name, phone, role, is_primary, is_inactive)
      VALUES (${company_id}, ${new_name ?? null}, ${new_phone ?? null}, ${
      new_role ?? null
    }, TRUE, FALSE)
      RETURNING id
    `);
    const newContactId = (ins.rows[0] as any).id as number;

    await db.execute(sql`
      INSERT INTO b2b_call_logs (
        company_id, contact_id, kind, picked_up, note, next_action_at, logged_by
      ) VALUES (
        ${company_id}, ${newContactId}, 'contact_change', TRUE,
        ${note || `Contact changed. Now speaking to ${new_name ?? new_phone}.`},
        ${next_action_at ?? null}, ${admin.email}
      )
    `);

    if (next_action_at) {
      await db.execute(sql`
        UPDATE b2b_companies
        SET next_action_at = ${next_action_at},
            next_action_reason = ${next_action_reason || "Re-engage the new contact"},
            updated_at = NOW()
        WHERE id = ${company_id}
      `);
    }

    return Response.json({ ok: true, contact_id: newContactId });
  }

  if (request.method === "POST" && intent === "contact") {
    await db.execute(sql`
      INSERT INTO b2b_contacts (company_id, name, phone, role, is_primary)
      VALUES (${body.company_id}, ${body.name ?? null}, ${body.phone ?? null}, ${
      body.role ?? null
    }, FALSE)
    `);
    return Response.json({ ok: true });
  }

  if (request.method === "PATCH" && intent === "company") {
    // Field-by-field so a partial edit never blanks the rest of the row.
    const f = body.fields ?? {};
    const sets = [];

    // Read the current owner BEFORE updating, so a handoff can be logged.
    let previousOwner: string | null = null;
    if ("owner" in f) {
      const cur = await db.execute(sql`SELECT owner FROM b2b_companies WHERE id = ${body.id}`);
      previousOwner = ((cur.rows[0] as any)?.owner ?? null) as string | null;
    }
    if ("stage" in f) sets.push(sql`stage = ${f.stage}`);
    if ("temperature" in f) sets.push(sql`temperature = ${f.temperature}`);
    if ("status" in f) sets.push(sql`status = ${f.status}`);
    if ("owner" in f) sets.push(sql`owner = ${f.owner || null}`);
    if ("whatsapp_group_made" in f) sets.push(sql`whatsapp_group_made = ${f.whatsapp_group_made}`);
    if ("needs_brochure" in f) sets.push(sql`needs_brochure = ${f.needs_brochure}`);
    if ("brochure_note" in f) sets.push(sql`brochure_note = ${f.brochure_note || null}`);
    if ("needs_my_followup" in f) sets.push(sql`needs_my_followup = ${f.needs_my_followup}`);
    if ("my_followup_note" in f) sets.push(sql`my_followup_note = ${f.my_followup_note || null}`);
    if ("needs_leads" in f) sets.push(sql`needs_leads = ${f.needs_leads}`);
    if ("leads_note" in f) sets.push(sql`leads_note = ${f.leads_note || null}`);
    if ("leads_change" in f) sets.push(sql`leads_change = ${f.leads_change}`);
    if ("leads_change_note" in f) sets.push(sql`leads_change_note = ${f.leads_change_note || null}`);
    if ("next_action_at" in f) sets.push(sql`next_action_at = ${f.next_action_at || null}`);
    if ("next_action_reason" in f) sets.push(sql`next_action_reason = ${f.next_action_reason || null}`);
    if ("they_reachout_on" in f) sets.push(sql`they_reachout_on = ${f.they_reachout_on || null}`);
    if ("deal_value" in f) sets.push(sql`deal_value = ${f.deal_value ?? null}`);
    if ("next_purchase_due" in f) sets.push(sql`next_purchase_due = ${f.next_purchase_due || null}`);
    if ("blocker_type" in f) sets.push(sql`blocker_type = ${f.blocker_type || null}`);
    if ("blocker_note" in f) sets.push(sql`blocker_note = ${f.blocker_note || null}`);
    if ("lost_reason" in f) sets.push(sql`lost_reason = ${f.lost_reason || null}`);
    if ("lost_feedback" in f) sets.push(sql`lost_feedback = ${f.lost_feedback || null}`);
    if ("comeback_at" in f) sets.push(sql`comeback_at = ${f.comeback_at || null}`);
    if ("notes" in f) sets.push(sql`notes = ${f.notes || null}`);
    if ("name" in f) sets.push(sql`name = ${f.name}`);

    if (sets.length === 0) return Response.json({ ok: true });
    sets.push(sql`updated_at = NOW()`);

    await db.execute(
      sql`UPDATE b2b_companies SET ${sql.join(sets, sql`, `)} WHERE id = ${body.id}`
    );

    // A handoff is part of the story: log it so the timeline shows who held
    // this and when. Only when the owner actually changed.
    if ("owner" in f) {
      const before = (previousOwner ?? "").trim();
      const after = (f.owner ?? "").trim();
      if (before !== after) {
        const name = (o: string) => (o ? o : "Me");
        await db.execute(sql`
          INSERT INTO b2b_call_logs (company_id, kind, picked_up, note, logged_by)
          VALUES (
            ${body.id}, 'handoff', FALSE,
            ${`Handed from ${name(before)} to ${name(after)}.`},
            ${admin.email}
          )
        `);
      }
    }

    return Response.json({ ok: true });
  }

  // The check-in. Writes an immutable log row, then projects it onto the company.
  if (request.method === "POST" && intent === "log") {
    const {
      company_id,
      contact_id,
      kind,
      picked_up,
      attendees,
      outcome,
      objection,
      objection_note,
      temperature_at_time,
      note,
      next_action_at,
      next_action_reason,
      value_discussed,
      // company-side consequences computed client-side from the shared rules
      stage,
      blocker_type,
      blocker_note,
      lost_reason,
      lost_feedback,
      comeback_at,
      next_purchase_due,
      // What they asked us for on the call (optional).
      needs_brochure,
      brochure_note,
      needs_leads,
      leads_note,
      leads_change,
      leads_change_note,
    } = body;

    // A "no" must always yield a reason and feedback. Enforced server-side too,
    // so the rule holds regardless of what the client sends.
    if (outcome === "closed_lost" && (!lost_reason || !lost_feedback)) {
      return Response.json(
        { error: "A lost deal needs a reason and feedback." },
        { status: 400 }
      );
    }

    // "Other" with no detail is an unactionable row in the stats. Enforced here
    // as well as in the form so the rule holds whatever the client sends.
    if (objection === "other" && !objection_note?.trim()) {
      return Response.json(
        { error: "Tell us what the objection actually was." },
        { status: 400 }
      );
    }

    await db.execute(sql`
      INSERT INTO b2b_call_logs (
        company_id, contact_id, kind, picked_up, attendees, outcome, objection, objection_note,
        temperature_at_time, note, next_action_at, value_discussed, logged_by
      ) VALUES (
        ${company_id},
        ${contact_id ?? null},
        ${kind === "meet" ? "meet" : "call"},
        ${picked_up ?? false},
        ${attendees?.trim() || null},
        ${outcome ?? null},
        ${objection ?? null},
        ${objection_note?.trim() || null},
        ${temperature_at_time ?? null},
        ${note ?? null},
        ${next_action_at ?? null},
        ${value_discussed ?? null},
        ${admin.email}
      )
    `);

    const sets = [
      sql`next_action_at = ${next_action_at ?? null}`,
      sql`next_action_reason = ${next_action_reason ?? null}`,
      sql`updated_at = NOW()`,
    ];
    if (stage) sets.push(sql`stage = ${stage}`);
    if (temperature_at_time) sets.push(sql`temperature = ${temperature_at_time}`);
    if (blocker_type !== undefined) sets.push(sql`blocker_type = ${blocker_type || null}`);
    if (blocker_note !== undefined) sets.push(sql`blocker_note = ${blocker_note || null}`);
    if (lost_reason !== undefined) sets.push(sql`lost_reason = ${lost_reason || null}`);
    if (lost_feedback !== undefined) sets.push(sql`lost_feedback = ${lost_feedback || null}`);
    if (comeback_at !== undefined) sets.push(sql`comeback_at = ${comeback_at || null}`);
    if (next_purchase_due !== undefined)
      sets.push(sql`next_purchase_due = ${next_purchase_due || null}`);
    if (value_discussed !== undefined && value_discussed !== null)
      sets.push(sql`deal_value = ${value_discussed}`);
    // Things they asked us for on the call — captured in the wizard so a request
    // isn't lost. Each flag has a paired note column.
    if (needs_brochure !== undefined) sets.push(sql`needs_brochure = ${needs_brochure}`);
    if (brochure_note !== undefined) sets.push(sql`brochure_note = ${brochure_note || null}`);
    if (needs_leads !== undefined) sets.push(sql`needs_leads = ${needs_leads}`);
    if (leads_note !== undefined) sets.push(sql`leads_note = ${leads_note || null}`);
    if (leads_change !== undefined) sets.push(sql`leads_change = ${leads_change}`);
    if (leads_change_note !== undefined)
      sets.push(sql`leads_change_note = ${leads_change_note || null}`);

    await db.execute(
      sql`UPDATE b2b_companies SET ${sql.join(sets, sql`, `)} WHERE id = ${company_id}`
    );

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
