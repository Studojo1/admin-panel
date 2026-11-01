// Port of cc-backend analytics.py (the admin Overview, Funnel, Drop-offs,
// Dropouts, Q&A, Career Paths and Scores tabs), reading the careercoach
// database directly. Same JSON and the same numbers as the Python, with one
// deliberate change: week labels use "-" where the original used an en dash.
import { type Query, withCareerCoach } from "./db.server";
import { fetchSummaryForEmails } from "./main-platform.server";
import { Counter, isoformat, maxBy, maybeParse, or, pyInt, pyRound, pySlice, pyStrip, truthy, us } from "./py";

const US_PER_MIN = 60_000_000;
const HOUR = 60 * US_PER_MIN;
const DAY = 24 * HOUR;
const IST_MIN = 330;
const IST = IST_MIN * US_PER_MIN;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const nowUs = () => Date.now() * 1000;
const tsParam = (u: number) => new Date(Math.floor(u / 1000)).toISOString();
const createdUs = (col = "created_at") => `(extract(epoch FROM ${col})*1000000)::bigint`;
const floorTo = (v: number, step: number) => Math.floor(v / step) * step;
// IST wall-clock fields of a "local" microsecond value (instant + 5:30).
const fields = (local: number) => {
  const d = new Date(local / 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), h: d.getUTCHours(), wd: (d.getUTCDay() + 6) % 7 };
};
const istIso = (local: number) => isoformat(local - IST, IST_MIN);

async function count(q: Query, text: string, params: unknown[] = []): Promise<number> {
  const [r] = await q<{ c: string | number | null }>(text, params);
  return Number(r?.c ?? 0) || 0;
}

// ── Overview ────────────────────────────────────────────────────────────────

export function buildOverviewStats() {
  return withCareerCoach(async (q) => {
    const totalStudents = await count(q, "SELECT count(id) AS c FROM students");
    const now = nowUs();
    const nowLocal = now + IST;
    const todayMidnight = floorTo(nowLocal, DAY);
    const activeSince = (since: number) =>
      count(q, "SELECT count(DISTINCT student_id) AS c FROM messages WHERE created_at >= $1", [tsParam(since)]);
    const activeToday = await activeSince(todayMidnight - IST);
    const activeWeek = await activeSince(now - 7 * DAY);
    const activeMonth = await activeSince(now - 30 * DAY);
    const activeLastHour = await activeSince(now - HOUR);

    const recent = await q(`SELECT student_id, ${createdUs()} AS t FROM messages WHERE created_at >= $1`, [
      tsParam(now - 24 * HOUR),
    ]);
    const hourly = new Map<number, Set<string | null>>();
    for (const r of recent) {
      if (r.t === null) continue;
      const b = floorTo(Number(r.t) + IST, HOUR);
      if (!hourly.has(b)) hourly.set(b, new Set());
      hourly.get(b)!.add(r.student_id);
    }
    const cur = floorTo(nowLocal, HOUR);
    const perHour = [];
    for (let i = 0; i < 24; i++) {
      const b = cur - i * HOUR;
      const h = fields(b).h;
      perHour.push({
        hour: istIso(b),
        label: `${((h + 11) % 12) + 1} ${h < 12 ? "am" : "pm"}`,
        active_users: hourly.get(b)?.size ?? 0,
      });
    }

    const long = await q(`SELECT student_id, ${createdUs()} AS t FROM messages WHERE created_at >= $1`, [
      tsParam(now - 370 * DAY),
    ]);
    const daily = new Map<number, Set<string | null>>();
    const weekly = new Map<number, Set<string | null>>();
    const monthly = new Map<number, Set<string | null>>();
    const put = (m: Map<number, Set<string | null>>, k: number, sid: string | null) => {
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(sid);
    };
    for (const r of long) {
      if (r.t === null) continue;
      const day = floorTo(Number(r.t) + IST, DAY);
      const f = fields(day);
      put(daily, day, r.student_id);
      put(weekly, day - f.wd * DAY, r.student_id);
      put(monthly, Date.UTC(f.y, f.m, 1) * 1000, r.student_id);
    }

    const thisWeek = todayMidnight - fields(todayMidnight).wd * DAY;
    const perWeek = [];
    for (let i = 0; i < 12; i++) {
      const b = thisWeek - i * 7 * DAY;
      const fb = fields(b);
      const fe = fields(b + 6 * DAY);
      const label =
        fb.m === fe.m ? `${MONTHS[fb.m]} ${fb.day}-${fe.day}` : `${MONTHS[fb.m]} ${fb.day}-${MONTHS[fe.m]} ${fe.day}`;
      perWeek.push({ hour: istIso(b), label, active_users: weekly.get(b)?.size ?? 0 });
    }

    const perMonth = [];
    const ft = fields(todayMidnight);
    let my = ft.y;
    let mm = ft.m;
    for (let i = 0; i < 12; i++) {
      const b = Date.UTC(my, mm, 1) * 1000;
      perMonth.push({ hour: istIso(b), label: `${MONTHS[mm]} ${my}`, active_users: monthly.get(b)?.size ?? 0 });
      mm -= 1;
      if (mm < 0) {
        mm = 11;
        my -= 1;
      }
    }

    const perDay = [];
    for (let i = 0; i < 30; i++) {
      const b = todayMidnight - i * DAY;
      const f = fields(b);
      perDay.push({ hour: istIso(b), label: `${f.day} ${MONTHS[f.m]}`, active_users: daily.get(b)?.size ?? 0 });
    }

    const totalConversations = await count(q, "SELECT count(id) AS c FROM conversations");
    const [avgRow] = await q(
      "SELECT avg(cnt)::text AS a FROM (SELECT count(id) AS cnt FROM messages GROUP BY conversation_id) s",
    );
    const dnaTotal = await count(q, "SELECT count(id) AS c FROM career_dna");
    const dnaInaccurate = await count(q, "SELECT count(id) AS c FROM career_dna WHERE dna_accurate = false");
    const toolClicks = await count(
      q,
      "SELECT count(id) AS c FROM analytics_events WHERE event_type IN ('tool_click_resume_maker', 'tool_click_outreach_dojo')",
    );
    const accuracy = dnaTotal > 0 ? ((dnaTotal - dnaInaccurate) / dnaTotal) * 100 : 0.0;

    return {
      students: {
        total: totalStudents,
        active_last_hour: activeLastHour,
        active_today: activeToday,
        active_this_week: activeWeek,
        active_this_month: activeMonth,
      },
      active_per_hour: perHour.reverse(),
      active_per_day: perDay.reverse(),
      active_per_week: perWeek.reverse(),
      active_per_month: perMonth.reverse(),
      conversations: {
        total: totalConversations,
        avg_messages_per_session: avgRow?.a ? pyRound(avgRow.a, 1) : 0.0,
      },
      dna: {
        total_generated: dnaTotal,
        accuracy_rate: pyRound(accuracy, 1),
        inaccuracy_count: dnaInaccurate,
      },
      tools: { total_clicks: toolClicks },
      generated_at: isoformat(nowUs(), 0),
    };
  });
}

// ── Funnel ──────────────────────────────────────────────────────────────────

async function distinctStudentsFor(q: Query, eventTypes: string[]): Promise<Set<string>> {
  const rows = await q(
    "SELECT DISTINCT student_id FROM analytics_events WHERE event_type = ANY($1) AND student_id IS NOT NULL",
    [eventTypes],
  );
  return new Set(rows.map((r) => r.student_id));
}

export function buildFunnelReport() {
  return withCareerCoach(async (q) => {
    const totalStudents = await count(q, "SELECT count(id) AS c FROM students");
    const landed = await distinctStudentsFor(q, ["conversation_started"]);
    const landedCount = landed.size ? landed.size : totalStudents;
    const sentFirst = await distinctStudentsFor(q, [
      "state_greeting",
      "state_profiling",
      "state_career_analysis",
      "state_dna_review",
      "state_roadmap",
      "state_ongoing_support",
    ]);
    const profiling = await distinctStudentsFor(q, ["state_profiling"]);
    const uploadedResume = await distinctStudentsFor(q, ["resume_uploaded"]);
    const analysis = await distinctStudentsFor(q, ["state_career_analysis", "state_dna_review"]);
    const dnaReview = await distinctStudentsFor(q, ["state_dna_review"]);
    const roadmap = await distinctStudentsFor(q, ["state_roadmap"]);
    const ongoing = await distinctStudentsFor(q, ["state_ongoing_support"]);
    const checkin = await distinctStudentsFor(q, ["check_in_logged"]);
    const clickedResume = await distinctStudentsFor(q, ["tool_click_resume_maker"]);
    const clickedOutreach = await distinctStudentsFor(q, ["tool_click_outreach_dojo"]);
    const clickedTool = new Set([...clickedResume, ...clickedOutreach]);
    const explored = await distinctStudentsFor(q, ["new_path_exploration_started"]);

    const msgRows = await q("SELECT count(id)::int AS c FROM messages WHERE role = 'user' GROUP BY student_id");
    const msgCounts = msgRows.map((r) => r.c as number);
    const depth: Record<string, number> = { "1 msg": 0, "2-3 msgs": 0, "4-6 msgs": 0, "7-10 msgs": 0, "11+ msgs": 0 };
    for (const n of msgCounts) {
      if (n <= 1) depth["1 msg"]++;
      else if (n <= 3) depth["2-3 msgs"]++;
      else if (n <= 6) depth["4-6 msgs"]++;
      else if (n <= 10) depth["7-10 msgs"]++;
      else depth["11+ msgs"]++;
    }
    const avgMsgs = msgCounts.length ? pyRound(msgCounts.reduce((a, b) => a + b, 0) / msgCounts.length, 1) : 0.0;

    const base = landedCount || 1;
    const step = (stage: string, n: number, prev: number, note: string) => ({
      stage,
      count: n,
      conversion_rate: base ? pyRound((n / base) * 100, 1) : 0.0,
      step_conversion_rate: prev ? pyRound((n / prev) * 100, 1) : 0.0,
      dropped_from_prev: Math.max(prev - n, 0),
      note,
    });
    const nLanded = landedCount;
    const nFirst = sentFirst.size ? sentFirst.size : nLanded;
    const stages = [
      step("Landed on coach", nLanded, nLanded, "Opened the career coach"),
      step("Sent first message", nFirst, nLanded, "Engaged past the greeting"),
      step("Profiling", profiling.size, nFirst, "Started building their profile"),
      step("Career Analysis", analysis.size, profiling.size, "Profile complete, DNA generated"),
      step("DNA Review", dnaReview.size, analysis.size, "Saw their Career DNA"),
      step("Roadmap", roadmap.size, dnaReview.size, "Received their roadmap"),
      step("Ongoing Support", ongoing.size, roadmap.size, "Returned / kept working"),
    ];
    const biggest = maxBy(stages.slice(1), (s) => s.dropped_from_prev);
    return {
      funnel_stages: stages,
      biggest_drop_off: biggest ? biggest.stage : "None",
      biggest_drop_off_detail: biggest
        ? `${biggest.dropped_from_prev} of ${base} students drop before '${biggest.stage}'`
        : "",
      overall_completion_rate: base ? pyRound((roadmap.size / base) * 100, 1) : 0.0,
      side_actions: {
        uploaded_resume: uploadedResume.size,
        logged_check_in: checkin.size,
        clicked_resume_maker: clickedResume.size,
        clicked_outreach_dojo: clickedOutreach.size,
        clicked_any_tool: clickedTool.size,
        explored_new_path: explored.size,
      },
      profiling_depth: { buckets: depth, avg_user_messages: avgMsgs },
    };
  });
}

// ── Drop-offs ───────────────────────────────────────────────────────────────

export function buildDropoffReport() {
  return withCareerCoach(async (q) => {
    // NOT IN on purpose: same semantics as the SQLAlchemy not_in() it replaces.
    const dropped = async (from: string, notIn: string[]) =>
      (
        await q(
          `SELECT DISTINCT student_id FROM analytics_events
            WHERE event_type = $1
              AND student_id NOT IN (SELECT DISTINCT student_id FROM analytics_events WHERE event_type = ANY($2))`,
          [from, notIn],
        )
      )
        .map((r) => r.student_id)
        .filter((s) => truthy(s));
    const greeting = await dropped("conversation_started", ["state_profiling"]);
    const profiling = await dropped("state_profiling", ["state_dna_review"]);
    const dna = await dropped("state_dna_review", ["state_roadmap"]);
    const roadmap = await dropped("state_roadmap", ["dashboard_viewed"]);
    const dashboard = await dropped("dashboard_viewed", ["tool_click_resume_maker", "tool_click_outreach_dojo"]);

    const avgMessages = async (ids: string[]) => {
      if (!ids.length) return 0.0;
      const [r] = await q(
        "SELECT avg(cnt)::text AS a FROM (SELECT count(id) AS cnt FROM messages WHERE student_id = ANY($1) GROUP BY student_id) s",
        [ids],
      );
      return r?.a == null ? 0.0 : pyRound(Number(r.a), 1);
    };
    const dropoffs = [
      { stage: "Dropped at Greeting", count: greeting.length, avg_messages_before_dropoff: await avgMessages(greeting) },
      { stage: "Dropped Mid-Profiling", count: profiling.length, avg_messages_before_dropoff: await avgMessages(profiling) },
      { stage: "Dropped at DNA Review", count: dna.length, avg_messages_before_dropoff: await avgMessages(dna) },
      { stage: "Dropped After Roadmap", count: roadmap.length, avg_messages_before_dropoff: await avgMessages(roadmap) },
      { stage: "Dropped at Dashboard", count: dashboard.length, avg_messages_before_dropoff: await avgMessages(dashboard) },
    ];
    return {
      dropoff_by_stage: dropoffs,
      highest_dropoff_stage: maxBy(dropoffs, (d) => d.count)!.stage,
      total_incomplete_journeys: dropoffs.reduce((a, d) => a + d.count, 0),
    };
  });
}

// ── Q&A ─────────────────────────────────────────────────────────────────────

export function buildQuestionAnalytics() {
  return withCareerCoach(async (q) => {
    const events = await q(
      "SELECT student_id, event_type, event_data FROM analytics_events WHERE event_type IN ('question_answered', 'question_dropped')",
    );
    const answered = new Counter<number>();
    const droppedC = new Counter<number>();
    const perStudent = new Counter<string>();
    for (const ev of events) {
      let data: any = ev.event_data;
      if (!truthy(data)) continue;
      if (typeof data === "string") {
        data = maybeParse(data);
        if (data === undefined) continue;
      }
      const raw = data?.question_index;
      if (raw === null || raw === undefined) continue;
      const idx = pyInt(raw);
      if (idx === undefined) continue;
      if (ev.event_type === "question_answered") {
        answered.add(idx);
        if (truthy(ev.student_id)) perStudent.add(ev.student_id);
      } else {
        droppedC.add(idx);
      }
    }
    const perf = [];
    for (let idx = 0; idx < 13; idx++) {
      const a = answered.get(idx);
      const d = droppedC.get(idx);
      const tot = a + d;
      perf.push({
        question_index: idx,
        answers_received: a,
        dropoffs: d,
        completion_rate: pyRound(tot > 0 ? (a / tot) * 100.0 : 0.0, 1),
      });
    }
    const values = perStudent.entries().map(([, v]) => v);
    const avg = values.length ? values.reduce((x, y) => x + y, 0) / values.length : 0.0;
    return {
      question_performance: perf,
      worst_performing_question: maxBy(perf, (p) => p.dropoffs)!.question_index,
      best_performing_question: maxBy(perf, (p) => p.completion_rate)!.question_index,
      average_questions_answered: pyRound(avg, 1),
    };
  });
}

// ── Career paths ────────────────────────────────────────────────────────────

export function buildCareerPathAnalytics() {
  return withCareerCoach(async (q) => {
    const top = (col: string) =>
      q(
        `SELECT ${col} AS v, count(id)::int AS c FROM career_paths
          WHERE ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY count(id) DESC LIMIT 10`,
      );
    const roles = await top("target_role");
    const industries = await top("target_industry");
    const geo = await q(
      `SELECT target_geography AS v, count(id)::int AS c FROM career_paths
        WHERE target_geography IS NOT NULL AND target_geography != '' GROUP BY target_geography`,
    );
    const stream = await q(
      `SELECT stream AS v, count(id)::int AS c FROM student_education
        WHERE stream IS NOT NULL AND stream != '' GROUP BY stream`,
    );
    const grad = await q(
      `SELECT graduation_year AS v, count(id)::int AS c FROM student_education
        WHERE graduation_year IS NOT NULL GROUP BY graduation_year`,
    );
    const arch = await q(
      "SELECT student_profile_cluster AS cl, occurrence_count AS n FROM aggregate_learning WHERE pattern_type = 'archetype'",
    );
    const archCounts = new Counter<string>();
    for (const r of arch) {
      let cl: any = r.cl;
      if (!truthy(cl)) continue;
      if (typeof cl === "string") {
        cl = maybeParse(cl);
        if (cl === undefined) continue;
      }
      const a = cl?.archetype;
      if (truthy(a)) archCounts.add(a, truthy(r.n) ? r.n : 1);
    }
    return {
      top_target_roles: roles.map((r) => ({ role: r.v, count: r.c })),
      top_target_industries: industries.map((r) => ({ industry: r.v, count: r.c })),
      geography_distribution: geo.map((r) => ({ geography: r.v, count: r.c })),
      stream_distribution: stream.map((r) => ({ stream: r.v, count: r.c })),
      graduation_year_distribution: grad.map((r) => ({ year: String(r.v), count: r.c })),
      archetype_distribution: archCounts.entries().map(([archetype, c]) => ({ archetype, count: c })),
    };
  });
}

// ── Dropouts ────────────────────────────────────────────────────────────────

const STATE_ORDER = ["GREETING", "PROFILING", "CAREER_ANALYSIS", "DNA_REVIEW", "ROADMAP", "ONGOING_SUPPORT"];
type Msg = { role: string; content: string | null; state: string | null; t: number | null };

export function buildDropoutReport() {
  return withCareerCoach(async (q) => {
    const rows = await q(
      `SELECT student_id, role, content, state, ${createdUs()} AS t FROM messages
        WHERE created_at >= $1 ORDER BY created_at`,
      [tsParam(nowUs() - 90 * DAY)],
    );
    const byStudent = new Map<string, Msg[]>();
    const states = new Map<string, Set<string>>();
    for (const r of rows) {
      const sid = r.student_id;
      if (!truthy(sid)) continue;
      if (!byStudent.has(sid)) byStudent.set(sid, []);
      byStudent.get(sid)!.push({ role: r.role, content: r.content, state: r.state, t: us(r.t) });
      if (truthy(r.state)) {
        if (!states.has(sid)) states.set(sid, new Set());
        states.get(sid)!.add(r.state);
      }
    }
    const dnaIds = new Set((await q("SELECT DISTINCT student_id FROM career_dna")).map((r) => r.student_id));
    const convs = new Map(
      (await q("SELECT student_id, count(id)::int AS c FROM conversations GROUP BY student_id")).map((r) => [
        r.student_id,
        r.c as number,
      ]),
    );
    const info = new Map((await q("SELECT id, name, email FROM students")).map((r) => [r.id, r]));

    const droppers: any[] = [];
    const speed = { under_1min: 0, "1_3min": 0, "3_10min": 0, over_10min: 0 };
    const lastState = new Counter<string>();
    for (const [sid, msgs] of byStudent) {
      const st = states.get(sid) ?? new Set<string>();
      if (!st.has("PROFILING")) continue;
      if (dnaIds.has(sid)) continue;
      const content = msgs.filter((m) => pyStrip(m.content ?? "") !== "");
      if (!content.length) continue;
      const firstT = content[0].t;
      const lastT = content[content.length - 1].t;
      const mins = firstT && lastT ? pyRound((lastT - firstT) / 1_000_000 / 60.0, 1) : 0.0;
      const userMsgs = content.filter((m) => m.role === "user");
      let furthest = "PROFILING";
      for (const s of STATE_ORDER) if (st.has(s)) furthest = s;
      lastState.add(furthest);
      const bucket = mins < 1 ? "under_1min" : mins < 3 ? "1_3min" : mins < 10 ? "3_10min" : "over_10min";
      speed[bucket]++;
      const meta = info.get(sid);
      droppers.push({
        student_id: sid,
        name: meta?.name ?? null,
        email: meta?.email ?? null,
        furthest_state: furthest,
        total_messages: content.length,
        user_messages: userMsgs.length,
        minutes_in_chat: mins,
        drop_speed: bucket,
        returned: (convs.has(sid) ? convs.get(sid)! : 1) > 1,
        first_at: firstT ? isoformat(firstT, IST_MIN) : null,
        last_messages: content.slice(-4).map((m) => ({
          role: m.role === "assistant" ? "agent" : m.role,
          content: pySlice(m.content ?? "", 400),
          at: isoformat(m.t, 0),
        })),
      });
    }
    let returnedAndConverted = 0;
    for (const [sid, st] of states) {
      if (st.has("PROFILING") && dnaIds.has(sid) && (convs.has(sid) ? convs.get(sid)! : 1) > 1) returnedAndConverted++;
    }
    droppers.sort((a, b) => a.minutes_in_chat - b.minutes_in_chat);
    const n = droppers.length;
    return {
      total_dropped: n,
      avg_messages: n ? pyRound(droppers.reduce((a, d) => a + d.total_messages, 0) / n, 1) : 0,
      avg_minutes: n ? pyRound(droppers.reduce((a, d) => a + d.minutes_in_chat, 0) / n, 1) : 0,
      speed_distribution: speed,
      by_furthest_state: lastState.toObject(),
      returned_count: droppers.filter((d) => d.returned).length,
      returned_and_converted: returnedAndConverted,
      droppers,
    };
  });
}

// ── Scores ──────────────────────────────────────────────────────────────────

export function buildScoreMovementReport() {
  return withCareerCoach(async (q) => {
    const gaps = await q("SELECT student_id, readiness_history FROM gap_analysis WHERE updated_at >= $1", [
      tsParam(nowUs() - 90 * DAY),
    ]);
    const improved: any[] = [];
    for (const g of gaps) {
      let h: any = g.readiness_history;
      if (!truthy(h)) continue;
      if (typeof h === "string") {
        h = maybeParse(h);
        if (h === undefined) continue;
      }
      if (Array.isArray(h) && h.length >= 2) {
        const first = h[0]?.score ?? 0;
        const last = h[h.length - 1]?.score ?? 0;
        const improvement = last - first;
        if (improvement > 0) {
          improved.push({ student_id: g.student_id, improvement, from_score: first, to_score: last });
        }
      }
    }
    improved.sort((a, b) => b.improvement - a.improvement);
    const top = improved.slice(0, 5);
    if (top.length) {
      const ids = top.map((t) => t.student_id);
      const info = new Map(
        (await q("SELECT id, name, email FROM students WHERE id = ANY($1)", [ids])).map((r) => [r.id, r]),
      );
      const needName = ids
        .map((i) => info.get(i))
        .filter((m) => m && truthy(m.email) && !truthy(m.name))
        .map((m) => m!.email as string);
      let loginNames: Record<string, any> = {};
      if (needName.length) {
        const summary = await fetchSummaryForEmails(needName);
        loginNames = Object.fromEntries(Object.entries(summary).map(([e, v]) => [e, v?.login_name ?? null]));
      }
      for (const t of top) {
        const meta = info.get(t.student_id) ?? {};
        const email = meta.email ?? null;
        t.name = or(meta.name ?? null, truthy(email) ? (loginNames[String(email).trim().toLowerCase()] ?? null) : null);
        t.email = email;
      }
    }
    const totalImp = improved.reduce((a, x) => a + x.improvement, 0);
    const avgImp = improved.length ? totalImp / improved.length : 0.0;
    let avgSessions = 0.0;
    if (improved.length) {
      const rows = await q("SELECT session_count FROM students WHERE id = ANY($1)", [
        improved.map((x) => x.student_id),
      ]);
      const counts = rows.map((r) => r.session_count).filter((c) => c !== null) as number[];
      avgSessions = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0.0;
    }
    const actions = new Counter<string>();
    let totalActions = 0;
    for (const r of await q("SELECT event_data FROM analytics_events WHERE event_type = 'action_marked_complete'")) {
      let d: any = r.event_data;
      if (!truthy(d)) continue;
      if (typeof d === "string") {
        d = maybeParse(d);
        if (d === undefined) continue;
      }
      const action = d?.action;
      if (truthy(action)) {
        actions.add(action);
        totalActions++;
      }
    }
    const mc = actions.mostCommon(1);
    return {
      students_who_improved: improved.length,
      avg_readiness_improvement: pyRound(avgImp, 1),
      avg_sessions_to_first_improvement: pyRound(avgSessions, 1),
      total_actions_completed: totalActions,
      most_common_completed_action: mc.length ? mc[0][0] : "None",
      top_improvers: top,
    };
  });
}
