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
}> = [
  {
    contact: "Vamsi",
    company: "ATA",
    temperature: "cold",
    status: "awaiting_response",
    notes: "15-30 students B2B2C,",
    stage: "gtm_active",
  },
  {
    contact: "Anisha",
    company: "Sharpner tech",
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
    status: "declined",
    notes: "Doesnt have money.",
    stage: "feedback_pending",
    lostReason: "no_budget",
  },
  {
    contact: "Hiren",
    company: "Mahika",
    status: "accepted",
    notes: "Accepted to sign PO for 10k (Phone numbers)",
    stage: "closed_won",
    dealValue: 10000,
  },
  {
    contact: "Vimal Singh",
    company: "Board infinity",
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
    temperature: "warm",
    notes: "pricing for just intelignece and lead based pricing",
    stage: "blocked_pricing",
    blockerType: "pricing",
  },
  {
    contact: "Sudipta",
    company: "Newton school",
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
    temperature: "warm",
    status: "awaiting_response",
    notes: "Happy with leads, asking for pricing",
    stage: "blocked_pricing",
    blockerType: "pricing",
  },
  {
    contact: "satish",
    company: "Palle",
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
    temperature: "warm",
    status: "awaiting_response",
    notes: "Need to check capmign, D2c got 2 conatacts",
    stage: "gtm_active",
  },
  {
    contact: "Nikhil",
    company: "upspir",
    reachoutNote: "16th",
    temperature: "hot",
    status: "awaiting_response",
    notes: "Need to send new updated leads",
    stage: "gtm_active",
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
    temperature: "warm",
    status: "awaiting_response",
    notes: "Will add tech team to grp, to get back with pricing",
    stage: "blocked_approval",
    blockerType: "approval",
  },
  {
    contact: "Adhithya",
    company: "Skillfyme",
    notes:
      "She joined, she has to sedn 3 resumes, she has appolo she might buy next month, might have price objection, she liked the leads and platform (premade leads), she wants the 7 day free trials, she wants pricing as of 16th",
    stage: "blocked_pricing",
    blockerType: "pricing",
  },
  {
    contact: "Ankita",
    company: "Analytics lab",
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
    notes: "No whatsapp yet",
    stage: "cold_call_done",
  },
  {
    contact: "Bibek",
    company: "Presidency",
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
        needs_brochure, next_action_reason, they_reachout_on,
        deal_value, blocker_type, lost_reason, notes
      ) VALUES (
        ${row.company.trim()},
        ${row.stage},
        ${row.temperature ?? null},
        ${row.status ?? null},
        ${whatsappMade},
        ${row.needsBrochure ?? false},
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
          ${"Imported from Excel: " + row.notes}, ${loggedBy}
        )
      `);
    }
  }

  return { seeded: true, count: SEED_ROWS.length };
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
        COUNT(*)::int AS total,
        -- Overdue OR scheduled later today: a 3pm callback counts at 9am.
        -- Both sides compared in IST, since that's the working day.
        COUNT(*) FILTER (
          WHERE next_action_at <= NOW()
             OR (next_action_at AT TIME ZONE 'Asia/Kolkata')::date
                = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        )::int AS due_now,
        COUNT(*) FILTER (WHERE temperature = 'hot')::int AS hot,
        COUNT(*) FILTER (WHERE stage LIKE 'blocked_%')::int AS blocked,
        COUNT(*) FILTER (WHERE needs_brochure)::int AS brochures,
        COUNT(*) FILTER (WHERE stage IN ('closed_won','onboarding','using','renewal_due','expansion_pitch','repeat_buyer'))::int AS accounts,
        COUNT(*) FILTER (WHERE next_purchase_due IS NOT NULL AND next_purchase_due <= NOW() + INTERVAL '7 days')::int AS renewals_due,
        COALESCE(SUM(deal_value) FILTER (WHERE stage IN ('closed_won','onboarding','using','renewal_due','expansion_pitch','repeat_buyer')), 0) AS committed_value
      FROM b2b_companies
    `),
    // Why isn't BOB closing — a GROUP BY, not a guess.
    db.execute(sql`
      SELECT objection, COUNT(*)::int AS n
      FROM b2b_call_logs
      WHERE objection IS NOT NULL
      GROUP BY objection
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
    if ("stage" in f) sets.push(sql`stage = ${f.stage}`);
    if ("temperature" in f) sets.push(sql`temperature = ${f.temperature}`);
    if ("status" in f) sets.push(sql`status = ${f.status}`);
    if ("owner" in f) sets.push(sql`owner = ${f.owner || null}`);
    if ("whatsapp_group_made" in f) sets.push(sql`whatsapp_group_made = ${f.whatsapp_group_made}`);
    if ("needs_brochure" in f) sets.push(sql`needs_brochure = ${f.needs_brochure}`);
    if ("brochure_note" in f) sets.push(sql`brochure_note = ${f.brochure_note || null}`);
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
    return Response.json({ ok: true });
  }

  // The check-in. Writes an immutable log row, then projects it onto the company.
  if (request.method === "POST" && intent === "log") {
    const {
      company_id,
      contact_id,
      picked_up,
      outcome,
      objection,
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
    } = body;

    // A "no" must always yield a reason and feedback. Enforced server-side too,
    // so the rule holds regardless of what the client sends.
    if (outcome === "closed_lost" && (!lost_reason || !lost_feedback)) {
      return Response.json(
        { error: "A lost deal needs a reason and feedback." },
        { status: 400 }
      );
    }

    await db.execute(sql`
      INSERT INTO b2b_call_logs (
        company_id, contact_id, kind, picked_up, outcome, objection,
        temperature_at_time, note, next_action_at, value_discussed, logged_by
      ) VALUES (
        ${company_id},
        ${contact_id ?? null},
        'call',
        ${picked_up ?? false},
        ${outcome ?? null},
        ${objection ?? null},
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

    await db.execute(
      sql`UPDATE b2b_companies SET ${sql.join(sets, sql`, `)} WHERE id = ${company_id}`
    );

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
