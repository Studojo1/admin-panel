// Port of cc-backend's per-student admin routes (main.py: students, career
// path drill-down, active students, locations, activity, transcripts, resume
// view) and the student dashboard (dashboard.py build_dashboard), reading the
// careercoach database directly.
//
// Not in the database, so different from the live service:
//  - Locations come from the ip_geo cache only. cc-backend looked up an IP it
//    had never seen at ip-api.com; the archive cannot, so such a student shows
//    no location.
//  - Resume files live on the cc-backend-data volume, not in the database.
//    The students table reports resume_on_file false; resume-view and the
//    download ask the service while it runs (see careercoach/service.server.ts).
import { type Query, withCareerCoach } from "./db.server";
import { fetchActivityForEmail, fetchLatestIpForEmails, fetchSummaryForEmails } from "./main-platform.server";
import { Counter, isoformat, maybeParse, or, pyInt, pySlice, pyStrip, truthy, us } from "./py";

export class NotFound extends Error {}

const T = (col: string) => `(extract(epoch FROM ${col})*1000000)::bigint`;
const iso = (v: unknown) => isoformat(us(v), 0);

async function getStudent(q: Query, id: string) {
  const [s] = await q(
    `SELECT *, ${T("created_at")} AS created_us, ${T("last_seen")} AS last_seen_us FROM students WHERE id = $1`,
    [id],
  );
  return s ?? null;
}

// ip -> {country, region, city} from the cache, the way resolve_ips() used it.
async function cachedGeos(q: Query, ips: string[]) {
  const out = new Map<string, { country: any; region: any; city: any }>();
  const uniq = [...new Set(ips.filter(Boolean))];
  if (!uniq.length) return out;
  for (const r of await q("SELECT ip, country, region, city FROM ip_geo WHERE ip = ANY($1)", [uniq])) {
    if (truthy(r.country)) out.set(r.ip, { country: r.country, region: r.region, city: r.city });
  }
  return out;
}

// ── Locations ───────────────────────────────────────────────────────────────

export function buildLocations() {
  return withCareerCoach(async (q) => {
    const emails = (await q("SELECT email FROM students WHERE email IS NOT NULL"))
      .map((r) => r.email as string)
      .filter((e) => truthy(e));
    if (!emails.length) return { countries: [], cities: [], located: 0, total_with_email: 0 };
    const ipByEmail = await fetchLatestIpForEmails(emails);
    const geos = await cachedGeos(q, [...ipByEmail.values()]);
    const countries = new Counter<string>();
    const cities = new Counter<string>();
    let located = 0;
    for (const ip of ipByEmail.values()) {
      const g = geos.get(ip);
      if (!g) continue;
      located++;
      if (truthy(g.country)) countries.add(g.country);
      if (truthy(g.city)) {
        const label = g.city + (truthy(g.region) && g.region !== g.city ? `, ${g.region}` : "");
        cities.add(label);
      }
    }
    return {
      countries: countries.mostCommon(10).map(([name, count]) => ({ name, count })),
      cities: cities.mostCommon(12).map(([name, count]) => ({ name, count })),
      located,
      total_with_email: emails.length,
    };
  });
}

// ── Students table ──────────────────────────────────────────────────────────

export function buildStudents() {
  return withCareerCoach(async (q) => {
    const students = await q(
      `SELECT id, name, email, archetype, resume_maker_ready, has_active_outreach, discount_intent_email,
              ${T("created_at")} AS created_us, ${T("last_seen")} AS last_seen_us
         FROM students`,
    );
    const emails = students.map((s) => s.email).filter((e) => truthy(e));
    const summary = await fetchSummaryForEmails(emails);
    const locByEmail = new Map<string, any>();
    const ipByEmail = await fetchLatestIpForEmails(emails);
    const geos = await cachedGeos(q, [...ipByEmail.values()]);
    for (const [em, ip] of ipByEmail) {
      const g = geos.get(ip);
      if (g && (truthy(g.city) || truthy(g.country))) locByEmail.set(em, g);
    }

    const sessions = new Map<string, number>();
    for (const r of await q(
      `SELECT c.student_id, count(m.id)::int AS n FROM conversations c
         JOIN messages m ON m.conversation_id = c.id GROUP BY c.student_id, c.id`,
    )) {
      if (r.n > 0) sessions.set(r.student_id, (sessions.get(r.student_id) ?? 0) + 1);
    }
    const states = new Map<string, Set<string>>();
    for (const r of await q("SELECT DISTINCT student_id, state FROM messages")) {
      if (!truthy(r.state)) continue;
      if (!states.has(r.student_id)) states.set(r.student_id, new Set());
      states.get(r.student_id)!.add(r.state);
    }
    const dna = new Set((await q("SELECT DISTINCT student_id FROM career_dna")).map((r) => r.student_id));
    const lastState = new Map<string, string | null>();
    for (const r of await q(
      "SELECT DISTINCT ON (student_id) student_id, state FROM messages ORDER BY student_id, created_at DESC",
    )) {
      lastState.set(r.student_id, r.state);
    }
    const reached = (sid: string) => {
      const st = states.get(sid) ?? new Set<string>();
      if (st.has("ROADMAP")) return "Roadmap";
      if (dna.has(sid) || st.has("DNA_REVIEW") || st.has("CAREER_ANALYSIS")) return "Career Analysis";
      if (st.has("PROFILING")) return "Profiling";
      return "Greeting";
    };

    return students.map((s) => {
      const emailL = (s.email ?? "").trim().toLowerCase();
      const mp = truthy(s.email) ? (summary[emailL] ?? null) : null;
      const loc = truthy(s.email) ? (locByEmail.get(emailL) ?? null) : null;
      return {
        id: s.id,
        name: or(s.name, mp ? mp.login_name : null),
        login_name: mp ? mp.login_name : null,
        email: s.email,
        archetype: s.archetype,
        location: loc ? { city: loc.city, region: loc.region, country: loc.country } : null,
        session_count: sessions.get(s.id) ?? 0,
        reached_stage: reached(s.id),
        dashboard_ready: dna.has(s.id),
        last_seen: iso(s.last_seen_us),
        created_at: iso(s.created_us),
        has_resume: truthy(s.resume_maker_ready),
        resume_on_file: false,
        resume_filename: null,
        last_state: or(lastState.get(s.id) ?? null, "GREETING"),
        has_active_outreach: or(s.has_active_outreach, false),
        discount_intent_email: s.discount_intent_email,
        main_platform: mp,
      };
    });
  });
}

// ── Career path drill-down ──────────────────────────────────────────────────

export function buildCareerPathStudents(role: string | null, industry: string | null) {
  if (!role && !industry) return Promise.resolve([]);
  return withCareerCoach(async (q) => {
    const where: string[] = [];
    const params: string[] = [];
    if (role) {
      params.push(role);
      where.push(`target_role = $${params.length}`);
    }
    if (industry) {
      params.push(industry);
      where.push(`target_industry = $${params.length}`);
    }
    const paths = await q(
      `SELECT student_id, target_role, target_industry FROM career_paths WHERE ${where.join(" OR ")}`,
      params,
    );
    const ids = [...new Set(paths.map((p) => p.student_id))];
    if (!ids.length) return [];
    const map = new Map(
      (
        await q(`SELECT id, name, email, ${T("last_seen")} AS last_seen_us FROM students WHERE id = ANY($1)`, [ids])
      ).map((s) => [s.id, s]),
    );
    const out: any[] = [];
    const seen = new Set<string>();
    for (const p of paths) {
      if (seen.has(p.student_id)) continue;
      seen.add(p.student_id);
      const s = map.get(p.student_id);
      if (!s) continue;
      out.push({
        id: s.id,
        name: s.name,
        email: s.email,
        target_role: p.target_role,
        target_industry: p.target_industry,
        last_seen: iso(s.last_seen_us),
      });
    }
    return out;
  });
}

// ── Active students in a chart bucket ───────────────────────────────────────

// datetime.fromisoformat(): naive values are taken as UTC, like the original.
function parseBucket(bucket: string): number | null {
  const m = bucket.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?)?(Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", frac = "", tz] = m;
  let ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  if (Number.isNaN(ms)) return null;
  if (tz && tz !== "Z") {
    const sign = tz[0] === "-" ? -1 : 1;
    const digits = tz.slice(1).replace(":", "");
    ms -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000;
  }
  return ms * 1000 + Number(frac.padEnd(6, "0") || 0);
}

export function buildActiveStudents(bucket: string, granularity: string) {
  const start = parseBucket(bucket);
  if (start === null) throw new BadRequest("bad bucket timestamp");
  const span = { hour: 3600e6, week: 7 * 86400e6, month: 31 * 86400e6 }[granularity] ?? 3600e6;
  const toTs = (u: number) => new Date(Math.floor(u / 1000)).toISOString();
  return withCareerCoach(async (q) => {
    const ids = (
      await q("SELECT DISTINCT student_id FROM messages WHERE created_at >= $1 AND created_at < $2", [
        toTs(start),
        toTs(start + span),
      ])
    )
      .map((r) => r.student_id)
      .filter((s) => truthy(s));
    const out: any[] = [];
    for (const sid of ids) {
      const s = await getStudent(q, sid);
      if (!s) {
        out.push({ id: sid, name: null, email: null, missing: true });
        continue;
      }
      const [last] = await q("SELECT state FROM messages WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1", [
        sid,
      ]);
      out.push({
        id: sid,
        name: s.name,
        email: s.email,
        archetype: s.archetype,
        last_state: or(last?.state ?? null, "GREETING"),
        missing: false,
      });
    }
    const key = (r: any) => (truthy(r.email) ? r.email : "zzz");
    out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    return { bucket, granularity, count: out.length, students: out };
  });
}

export class BadRequest extends Error {}

// ── One student: activity, transcripts, resume view ─────────────────────────

async function conversationsWithMessages(q: Query, studentId: string) {
  const convs = await q(
    `SELECT id, thread_type, career_path_id, ${T("created_at")} AS created_us
       FROM conversations WHERE student_id = $1 ORDER BY created_at DESC`,
    [studentId],
  );
  const msgs = await q(
    `SELECT conversation_id, role, content, state, ${T("created_at")} AS created_us
       FROM messages WHERE conversation_id = ANY($1) ORDER BY created_at ASC`,
    [convs.map((c) => c.id)],
  );
  const by = new Map<string, any[]>();
  for (const m of msgs) {
    if (!by.has(m.conversation_id)) by.set(m.conversation_id, []);
    by.get(m.conversation_id)!.push(m);
  }
  return convs.map((c): Record<string, any> => ({ ...c, messages: by.get(c.id) ?? [] }));
}

export function buildStudentActivity(studentId: string) {
  return withCareerCoach(async (q) => {
    const s = await getStudent(q, studentId);
    if (!s) throw new NotFound("Student not found");
    const events = (
      await q(
        `SELECT event_type, event_data, session_id, ${T("created_at")} AS created_us
           FROM analytics_events WHERE student_id = $1 ORDER BY created_at`,
        [studentId],
      )
    ).map((e) => ({ type: e.event_type, data: or(e.event_data, {}), session_id: e.session_id, at: iso(e.created_us) }));

    const statesSeen: { state: string; first_at: string | null }[] = [];
    const seen = new Set<string>();
    for (const m of await q(
      `SELECT state, ${T("created_at")} AS created_us FROM messages WHERE student_id = $1 ORDER BY created_at`,
      [studentId],
    )) {
      if (truthy(m.state) && !seen.has(m.state)) {
        seen.add(m.state);
        statesSeen.push({ state: m.state, first_at: iso(m.created_us) });
      }
    }
    const firstAt = (st: string) => statesSeen.find((x) => x.state === st)?.first_at ?? null;

    const dnas = await q(`SELECT ${T("generated_at")} AS gen_us FROM career_dna WHERE student_id = $1`, [studentId]);
    const [primary] = await q(
      "SELECT id FROM career_paths WHERE student_id = $1 AND is_primary = true AND is_archived = false",
      [studentId],
    );
    const genTimes = dnas.map((d) => d.gen_us).filter((v) => v !== null).map(Number);
    const dnaAt = genTimes.length ? isoformat(Math.min(...genTimes), 0) : null;
    const milestones = {
      career_analysis: {
        done: dnas.length > 0 || seen.has("CAREER_ANALYSIS") || seen.has("DNA_REVIEW"),
        at: firstAt("DNA_REVIEW") || firstAt("CAREER_ANALYSIS") || dnaAt,
      },
      roadmap: { done: seen.has("ROADMAP"), at: firstAt("ROADMAP") },
      dashboard_ready: {
        done: primary !== undefined && dnas.length > 0,
        at: firstAt("DNA_REVIEW") || firstAt("ROADMAP") || dnaAt,
      },
    };

    let sessionsReal = 0;
    for (const c of await conversationsWithMessages(q, studentId)) {
      if (c.messages.some((m: any) => pyStrip(m.content ?? "") !== "")) sessionsReal++;
    }

    const coach = {
      student_id: s.id,
      name: s.name,
      email: s.email,
      first_seen: iso(s.created_us),
      last_seen: iso(s.last_seen_us),
      session_count: sessionsReal,
      archetype: s.archetype,
      has_active_outreach: or(s.has_active_outreach, false),
      events,
      states_reached: statesSeen,
      milestones,
    };

    let mainPlatform: Record<string, any> = {};
    if (truthy(s.email)) mainPlatform = (await fetchActivityForEmail(s.email)) ?? {};

    let location = null;
    const logins: any[] = (truthy(mainPlatform) ? mainPlatform.logins : null) || [];
    const latestIp = logins.find((l) => truthy(l.ip))?.ip;
    if (latestIp) {
      const [g] = await q("SELECT country, region, city FROM ip_geo WHERE ip = $1", [latestIp]);
      if (g) location = { city: g.city, region: g.region, country: g.country, ip: latestIp };
    }
    return {
      coach,
      main_platform: mainPlatform,
      main_platform_linked: Boolean(truthy(mainPlatform) && truthy(mainPlatform.found)),
      location,
    };
  });
}

export function buildTranscripts(studentId: string) {
  return withCareerCoach(async (q) => {
    if (!(await getStudent(q, studentId))) throw new NotFound("Student not found");
    const out: any[] = [];
    for (const c of await conversationsWithMessages(q, studentId)) {
      const messages = c.messages
        .filter((m: any) => pyStrip(m.content ?? "") !== "")
        .map((m: any) => ({
          role: m.role === "assistant" ? "agent" : m.role,
          content: m.content,
          state: m.state,
          at: iso(m.created_us),
        }));
      if (!messages.length) continue;
      const firstUser = messages.find((m: any) => m.role === "user");
      out.push({
        conversation_id: c.id,
        thread_type: c.thread_type,
        career_path_id: c.career_path_id,
        created_at: iso(c.created_us),
        last_state: messages[messages.length - 1].state,
        message_count: messages.length,
        title: firstUser ? pySlice(pyStrip(firstUser.content).split("\n")[0], 60) : "Conversation",
        messages,
      });
    }
    const k = (r: any) => r.created_at || "";
    out.sort((a, b) => (k(a) < k(b) ? 1 : k(a) > k(b) ? -1 : 0));
    return { student_id: studentId, conversations: out };
  });
}

/** The parsed resume snapshot; fileOnDisk comes from the service (or false once it is gone). */
export function buildResumeView(studentId: string, fileOnDisk: boolean) {
  return withCareerCoach(async (q) => {
    const s = await getStudent(q, studentId);
    if (!s) throw new NotFound("Student not found");
    const snap: any = s.resume_snapshot;
    const has = truthy(snap);
    return {
      has_snapshot: has,
      file_on_disk: fileOnDisk,
      filename: has ? (snap.filename ?? null) : null,
      parser: has ? (snap.parser ?? null) : null,
      uploaded_at: has ? (snap.uploaded_at ?? null) : null,
      parsed: has ? (snap.parsed ?? null) : null,
      text: has ? (snap.text ?? null) : null,
    };
  });
}

// ── Student dashboard (dashboard.py build_dashboard + main.py get_dashboard) ─

const REPLY_BASE_MAX = { india_domestic: 12, international: 20 };

function readinessScore(profile: Record<string, any>, skills: Record<string, any>): number {
  let score = 0;
  if (profile.has_resume === true) score += 20;
  const role = profile.target_role;
  if (truthy(role) && pyStrip(role).split(/\s+/).filter(Boolean).length > 1 && !role.toLowerCase().includes("any")) score += 20;
  if (truthy(profile.target_industry)) score += 15;
  if (profile.applied_before === true || profile.has_done_outreach_before === true) score += 15;
  const confirmed = skills ? (skills.skills_confirmed ?? []) : [];
  if ((confirmed ?? []).length >= 3) score += 20;
  if (
    truthy(profile.degree) &&
    truthy(profile.stream) &&
    truthy(profile.graduation_year) &&
    truthy(profile.target_role) &&
    truthy(profile.target_industry)
  )
    score += 10;
  return Math.min(score, 100);
}

function replyProbability(readiness: number, geography: string | null): number {
  const g = geography ? geography.toLowerCase() : "";
  const max = g.includes("india") || !geography ? REPLY_BASE_MAX.india_domestic : REPLY_BASE_MAX.international;
  let p = Math.trunc((readiness / 100) * max * 5);
  if (p > 65) p = 65;
  if (p < 5) p = 5;
  return p;
}

// gap_engine.py binds these onto GapAnalysis as properties computed from the
// stored gap lists: severity weighted for skills, saturating for the others.
function skillsGapScore(gaps: unknown): number {
  const items = Array.isArray(gaps) ? gaps : [];
  const n = (p: string) => items.filter((it) => (it || {}).priority === p).length;
  return Math.min(n("high") * 18 + n("medium") * 9 + n("low") * 3, 100);
}

function saturatingGapScore(gaps: unknown): number {
  const n = Array.isArray(gaps) ? gaps.length : 0;
  if (n <= 0) return 0;
  let score = 0;
  let step = 35;
  for (let i = 0; i < n; i++) {
    score += step;
    step = Math.max(4, Math.trunc(step * 0.55));
  }
  return Math.min(score, 85);
}

async function oneRow(q: Query, text: string, params: unknown[]) {
  const [r] = await q(text, params);
  return r ?? null;
}

async function detectedSoFar(q: Query, studentId: string, student: any, paths: any[]) {
  const education = await oneRow(q, "SELECT * FROM student_education WHERE student_id = $1", [studentId]);
  const confirmed: any[] = [];
  const tools: any[] = [];
  for (const p of paths) {
    const s = await oneRow(q, "SELECT * FROM student_skills WHERE student_id = $1 AND career_path_id = $2", [
      studentId,
      p.id,
    ]);
    if (s) {
      confirmed.push(...(s.skills_confirmed || []));
      tools.push(...(s.tools_and_tech || []));
    }
  }
  const dedupe = (xs: any[]) => {
    const seen = new Set<string>();
    return xs.filter((x) => {
      const k = JSON.stringify(x);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const complete = (p: any) => [p.target_role, p.target_industry, p.target_geography, p.job_type].filter(truthy).length;
  let best: any = null;
  for (const p of paths) if (best === null || complete(p) > complete(best)) best = p;
  const fieldsSet = [
    Boolean(best && truthy(best.target_role)),
    Boolean(best && truthy(best.target_industry)),
    Boolean(education && truthy(education.degree)),
    Boolean(education && truthy(education.graduation_year)),
  ];
  const pct = Math.round((fieldsSet.filter(Boolean).length / fieldsSet.length) * 100);
  return {
    degree: education ? education.degree : null,
    stream: education ? education.stream : null,
    institution: education ? education.institution : null,
    graduation_year: education ? education.graduation_year : null,
    target_role: best ? best.target_role : null,
    target_industry: best ? best.target_industry : null,
    target_geography: best ? best.target_geography : null,
    job_type: best ? best.job_type : null,
    direction_confidence_pct: pct,
    archetype: student.archetype ?? null,
    motivators: or(student.values_motivators, []),
    confidence_level: student.confidence_level ?? null,
    skills_confirmed: dedupe(confirmed).slice(0, 12),
    tools_and_tech: dedupe(tools).slice(0, 12),
    has_resume: truthy(student.resume_maker_ready),
  };
}

async function weeklyStreak(q: Query, studentId: string): Promise<number> {
  const rows = await q(
    `SELECT kind, ${T("logged_at")} AS at FROM check_ins WHERE student_id = $1 ORDER BY logged_at DESC LIMIT 60`,
    [studentId],
  );
  const weeklies = rows.filter((c) => c.kind === "weekly" && c.at !== null).map((c) => Number(c.at));
  if (!weeklies.length) return 0;
  let streak = 1;
  let prev = weeklies[0];
  for (const t of weeklies.slice(1)) {
    if ((prev - t) / 1_000_000 / 86400 <= 10) {
      streak++;
      prev = t;
    } else break;
  }
  return streak;
}

export function buildDashboard(studentId: string) {
  return withCareerCoach(async (q) => {
    const student = await getStudent(q, studentId);
    if (!student) throw new NotFound("Student not found");
    const paths = await q(
      "SELECT * FROM career_paths WHERE student_id = $1 AND is_archived = false ORDER BY created_at ASC",
      [studentId],
    );
    const active = paths.filter((p) => !truthy(p.is_archived));
    const primary = active.find((p) => truthy(p.is_primary));
    if (!primary) {
      return {
        ready: false,
        message: "Complete your career analysis first to see your dashboard.",
        detected_so_far: await detectedSoFar(q, studentId, student, paths),
      };
    }
    const dnas = await q("SELECT * FROM career_dna WHERE student_id = $1 ORDER BY generated_at DESC", [studentId]);
    const dna = dnas.find((d) => d.career_path_id === primary.id) ?? null;
    const gap = await oneRow(q, "SELECT * FROM gap_analysis WHERE student_id = $1 AND career_path_id = $2", [
      studentId,
      primary.id,
    ]);
    const skills = await oneRow(q, "SELECT * FROM student_skills WHERE student_id = $1 AND career_path_id = $2", [
      studentId,
      primary.id,
    ]);
    const education = await oneRow(q, "SELECT * FROM student_education WHERE student_id = $1", [studentId]);

    const profile: Record<string, any> = {
      id: student.id,
      name: student.name,
      email: student.email,
      phone: student.phone,
      location: student.location,
      linkedin_url: student.linkedin_url,
      session_count: student.session_count,
      archetype: student.archetype,
      resume_maker_ready: student.resume_maker_ready,
      degree: education ? education.degree : null,
      stream: education ? education.stream : null,
      institution: education ? education.institution : null,
      graduation_year: education ? education.graduation_year : null,
      target_role: primary.target_role,
      target_industry: primary.target_industry,
      target_companies: primary.target_companies,
      target_geography: primary.target_geography,
      job_type: primary.job_type,
      urgency_timeline: primary.urgency_timeline,
      applied_before: student.applied_before ?? null,
    };
    const skillsData = {
      skills_confirmed: skills ? skills.skills_confirmed : [],
      tools_and_tech: skills ? skills.tools_and_tech : [],
    };
    const readiness = readinessScore(profile, skillsData);
    const replyProb = replyProbability(readiness, profile.target_geography);

    let industryPct: any = readiness;
    const gapHistory = gap ? maybeParse(gap.readiness_history) : null;
    if (gap && truthy(gapHistory) && Array.isArray(gapHistory)) {
      const lastEntry = gapHistory[gapHistory.length - 1];
      industryPct = lastEntry && "score" in lastEntry ? lastEntry.score : industryPct;
    } else if (dna) {
      if (truthy(dna.industry_percentile_score)) industryPct = dna.industry_percentile_score;
      else if (truthy(dna.benchmark) && typeof dna.benchmark === "object" && !Array.isArray(dna.benchmark)) {
        industryPct = pyInt(or(dna.benchmark.industry_percentile, industryPct)) ?? industryPct;
      }
    }

    const card: Record<string, any> = {
      path_id: primary.id,
      path_name: primary.path_name,
      target_role: primary.target_role,
      target_industry: primary.target_industry,
      target_companies: or(primary.target_companies, []),
      target_geography: primary.target_geography,
      job_type: primary.job_type,
      industry_percentile_score: industryPct,
      readiness_score: industryPct,
      reply_probability: replyProb,
      skills_gap_score: gap ? skillsGapScore(maybeParse(gap.skills_gap)) : 0,
      industry_gap_score: gap ? saturatingGapScore(maybeParse(gap.industry_gap)) : 0,
      experience_gap_score: gap ? saturatingGapScore(maybeParse(gap.experience_gap)) : 0,
      priority_actions: dna ? or(dna.priority_actions, []) : [],
      skills_you_have: skills ? skills.skills_confirmed : [],
      skills_to_build: skills ? skills.skills_to_build : [],
      dna_id: dna ? dna.id : null,
      dna_accurate: dna ? dna.dna_accurate : true,
      level: dna ? dna.level : 1,
      dna_version: dna ? dna.dna_version : null,
      emotional_state: dna ? dna.emotional_state : null,
      benchmark: dna && truthy(dna.benchmark) ? dna.benchmark : { top_performer_skills: [], your_standing: "", gap_to_top: [] },
      job_board_reply_pct: dna ? (dna.job_board_reply_pct ?? null) : null,
      outreach_reply_pct: dna ? (dna.outreach_reply_pct ?? null) : null,
    };

    const alternatives: any[] = [];
    for (const p of active) {
      if (truthy(p.is_primary) || truthy(p.is_archived)) continue;
      const pGap = await oneRow(q, "SELECT * FROM gap_analysis WHERE student_id = $1 AND career_path_id = $2", [
        studentId,
        p.id,
      ]);
      const pSkills = await oneRow(q, "SELECT * FROM student_skills WHERE student_id = $1 AND career_path_id = $2", [
        studentId,
        p.id,
      ]);
      const pProfile = {
        ...profile,
        target_role: p.target_role,
        target_industry: p.target_industry,
        target_companies: p.target_companies,
        target_geography: p.target_geography,
        job_type: p.job_type,
        urgency_timeline: p.urgency_timeline,
      };
      const skillsGap = pGap ? maybeParse(pGap.skills_gap) : null;
      alternatives.push({
        path_id: p.id,
        path_name: p.path_name,
        target_role: p.target_role,
        target_industry: p.target_industry,
        is_exploring: p.is_exploring,
        readiness_score: readinessScore(pProfile, { skills_confirmed: pSkills ? pSkills.skills_confirmed : [] }),
        top_gap: pGap && truthy(skillsGap) ? (skillsGap as any[])[0] : null,
        can_promote_to_primary: true,
      });
    }

    const history: any[] = gap ? (truthy(gapHistory) ? (gapHistory as any[]) : []) : [];
    const dateKey = (e: any) => (truthy(e?.date) ? e.date : "");
    const sorted = [...history].sort((a, b) => (dateKey(a) < dateKey(b) ? -1 : dateKey(a) > dateKey(b) ? 1 : 0));
    const last10 = sorted.slice(-10);
    const firstScore = last10.length ? (last10[0] && "score" in last10[0] ? last10[0].score : 0) : industryPct;

    const hasResume = student.resume_maker_ready;
    const activeOutreach = Boolean(truthy(student.has_active_outreach));
    const applied = Boolean(truthy(profile.applied_before));
    const archetype = String(or(student.archetype, or(profile.archetype, ""))).toLowerCase();
    let cta: string | null;
    if (activeOutreach) cta = null;
    else if (archetype === "lost_one")
      cta = readiness < 45 ? "reports" : !truthy(hasResume) ? "resume_maker" : "outreach_dojo_getting_close";
    else if (archetype === "frustrated_applier") cta = !truthy(hasResume) ? "resume_maker" : "outreach_dojo";
    else if (archetype === "almost_there") cta = !truthy(hasResume) ? "resume_maker" : "outreach_dojo_first_move";
    else if (!truthy(hasResume)) cta = "resume_maker";
    else if (readiness < 35) cta = "outreach_dojo_not_ready";
    else if (readiness < 60) cta = "outreach_dojo_getting_close";
    else if (applied) cta = "outreach_dojo";
    else cta = "outreach_dojo_first_move";

    const data: Record<string, any> = {
      ready: true,
      student: {
        name: student.name,
        student_id: student.id,
        session_count: student.session_count,
        last_seen: student.last_seen_us !== null ? iso(student.last_seen_us) : isoformat(Date.now() * 1000, 0),
      },
      primary_path: card,
      alternative_paths: alternatives,
      score_history: {
        history: last10,
        improvement_total: industryPct - firstScore,
        first_score: firstScore,
        current_score: industryPct,
      },
      cta_tool: cta,
      resume_maker_ready: student.resume_maker_ready,
      streak_weeks: await weeklyStreak(q, studentId),
      streak_target: 4,
      detected_so_far: await detectedSoFar(q, studentId, student, paths),
    };

    // main.py get_dashboard: fill the primary card from the path's Career DNA.
    if (dna) {
      card.clarity_score = dna.clarity_score;
      card.one_line_summary = or(dna.one_line_summary, "Career DNA ready.");
      card.alternative_roles = [];
      card.urgency_timeline = "Exploring";
      card.skills_gap_items = or(dna.priority_actions, []);
      const r = or(card.readiness_score, or(dna.overall_readiness_score, 0));
      if (!truthy(card.skills_gap_score)) card.skills_gap_score = Math.max(0, Math.min(100, 100 - r + 10));
      if (!truthy(card.industry_gap_score)) card.industry_gap_score = Math.max(0, Math.min(100, 100 - r - 10));
      if (!truthy(card.experience_gap_score)) card.experience_gap_score = Math.max(0, Math.min(100, 100 - r));
    } else {
      card.clarity_score = 0;
      card.one_line_summary = "Complete your career analysis to unlock insights.";
      card.alternative_roles = [];
      card.urgency_timeline = "Exploring";
      card.skills_gap_items = [];
    }
    return data;
  });
}
