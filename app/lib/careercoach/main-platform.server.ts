// Port of cc-backend main_platform_db.py: a student's main platform account
// (sign-in method, logins, tool usage), joined by email. Fails soft like the
// original: empty results, so the coach data still shows.
import { withMainPlatform } from "./db.server";
import { isoformat, us } from "./py";

// The original showed an em dash for an unknown provider; the archive uses "-".
const UNKNOWN = "-";

function providerLabel(p: string | null): string {
  const labels: Record<string, string> = {
    credential: "Email + password",
    google: "Google",
    github: "GitHub",
    phone: "Phone (OTP)",
  };
  if (p && Object.prototype.hasOwnProperty.call(labels, p)) return labels[p];
  return p || UNKNOWN;
}

const naive = (v: unknown) => isoformat(us(v), null);
const cleanEmails = (emails: (string | null)[]) =>
  [...new Set(emails.filter((e): e is string => !!e && !!e.trim()).map((e) => e.trim().toLowerCase()))].sort();

export async function fetchActivityForEmail(email: string | null): Promise<Record<string, any> | null> {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  try {
    return await withMainPlatform(async (q) => {
      const [u] = await q(
        `SELECT id, name, email, (extract(epoch FROM created_at)*1000000)::bigint AS created_us,
                last_login_method, role, email_verified
           FROM "user" WHERE lower(email) = $1 LIMIT 1`,
        [e],
      );
      if (!u) return { found: false, email: e };
      const uid = u.id;
      const accounts = await q(
        `SELECT provider_id, (extract(epoch FROM created_at)*1000000)::bigint AS created_us
           FROM account WHERE user_id = $1 ORDER BY created_at ASC`,
        [uid],
      );
      const sessions = await q(
        `SELECT (extract(epoch FROM created_at)*1000000)::bigint AS created_us, ip_address, user_agent
           FROM session WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [uid],
      );
      const resumes = await q(
        `SELECT id::text AS id, name, (extract(epoch FROM created_at)*1000000)::bigint AS created_us
           FROM resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [uid],
      );
      const internships = await q(
        `SELECT id::text AS id, status, (extract(epoch FROM created_at)*1000000)::bigint AS created_us
           FROM internship_applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [uid],
      );
      const careers = await q(
        `SELECT id::text AS id, status, payment_status, amount,
                (extract(epoch FROM created_at)*1000000)::bigint AS created_us
           FROM career_applications WHERE lower(email) = $1 ORDER BY created_at DESC LIMIT 50`,
        [e],
      );
      let profile: Record<string, any> | null = null;
      try {
        await q("SAVEPOINT profile");
        [profile] = await q(
          `SELECT referral_source, college, year_of_study, course FROM user_profile WHERE user_id = $1 LIMIT 1`,
          [uid],
        );
        await q("RELEASE SAVEPOINT profile");
      } catch {
        await q("ROLLBACK TO SAVEPOINT profile");
        profile = null;
      }
      return {
        found: true,
        email: e,
        user: {
          id: uid,
          name: u.name,
          email: u.email,
          email_verified: u.email_verified,
          role: u.role,
          created_at: naive(u.created_us),
          last_login_method: u.last_login_method ? providerLabel(u.last_login_method) : null,
        },
        signup_methods: accounts.map((a) => ({
          method: providerLabel(a.provider_id),
          provider_id: a.provider_id,
          linked_at: naive(a.created_us),
        })),
        logins: sessions.map((s) => ({ at: naive(s.created_us), ip: s.ip_address, user_agent: s.user_agent })),
        tools: {
          resume_maker: {
            used: resumes.length > 0,
            count: resumes.length,
            items: resumes.map((r) => ({ id: r.id, name: r.name, created_at: naive(r.created_us) })),
          },
          internship_applications: {
            used: internships.length > 0,
            count: internships.length,
            items: internships.map((i) => ({ id: i.id, status: i.status, created_at: naive(i.created_us) })),
          },
          career_applications: {
            used: careers.length > 0,
            count: careers.length,
            items: careers.map((c) => ({
              id: c.id,
              status: c.status,
              payment_status: c.payment_status,
              amount: c.amount,
              created_at: naive(c.created_us),
            })),
          },
        },
        profile: profile
          ? {
              referral_source: profile.referral_source,
              college: profile.college,
              year_of_study: profile.year_of_study,
              course: profile.course,
            }
          : null,
      };
    });
  } catch (err) {
    console.warn(`[careercoach] main platform activity failed: ${(err as Error).message}`);
    return null;
  }
}

/** {email_lower: summary} for the students table. */
export async function fetchSummaryForEmails(emails: (string | null)[]): Promise<Record<string, any>> {
  const clean = cleanEmails(emails);
  if (!clean.length) return {};
  try {
    return await withMainPlatform(async (q) => {
      const users = await q(
        `SELECT id, name, lower(email) AS email, (extract(epoch FROM created_at)*1000000)::bigint AS created_us,
                last_login_method
           FROM "user" WHERE lower(email) = ANY($1)`,
        [clean],
      );
      if (!users.length) return {};
      const ids = users.map((u) => u.id);
      const accounts = await q(`SELECT user_id, provider_id FROM account WHERE user_id = ANY($1)`, [ids]);
      const resumeCounts = await q(
        `SELECT user_id, COUNT(*)::int AS c FROM resumes WHERE user_id = ANY($1) GROUP BY user_id`,
        [ids],
      );
      const internCounts = await q(
        `SELECT user_id, COUNT(*)::int AS c FROM internship_applications WHERE user_id = ANY($1) GROUP BY user_id`,
        [ids],
      );
      const careerCounts = await q(
        `SELECT lower(email) AS email, COUNT(*)::int AS c FROM career_applications
          WHERE lower(email) = ANY($1) GROUP BY lower(email)`,
        [clean],
      );
      const methods = new Map<string, string[]>();
      for (const a of accounts) {
        if (!methods.has(a.user_id)) methods.set(a.user_id, []);
        methods.get(a.user_id)!.push(providerLabel(a.provider_id));
      }
      const resumeBy = new Map(resumeCounts.map((r) => [r.user_id, r.c]));
      const internBy = new Map(internCounts.map((r) => [r.user_id, r.c]));
      const careerBy = new Map(careerCounts.map((r) => [r.email, r.c]));
      const out: Record<string, any> = {};
      for (const u of users) {
        out[u.email] = {
          linked: true,
          login_name: u.name,
          signup_method:
            (methods.get(u.id) ?? []).join(", ") ||
            (u.last_login_method ? providerLabel(u.last_login_method) : UNKNOWN),
          signed_up_at: naive(u.created_us),
          resume_count: resumeBy.get(u.id) ?? 0,
          internship_count: internBy.get(u.id) ?? 0,
          career_app_count: careerBy.get(u.email) ?? 0,
        };
      }
      return out;
    });
  } catch (err) {
    console.warn(`[careercoach] main platform summary failed: ${(err as Error).message}`);
    return {};
  }
}

/** {email_lower: most recent login IP}. */
export async function fetchLatestIpForEmails(emails: (string | null)[]): Promise<Map<string, string>> {
  const clean = cleanEmails(emails);
  const out = new Map<string, string>();
  if (!clean.length) return out;
  try {
    const rows = await withMainPlatform((q) =>
      q(
        `SELECT lower(u.email) AS email, s.ip_address
           FROM "user" u JOIN session s ON s.user_id = u.id
          WHERE lower(u.email) = ANY($1) AND s.ip_address IS NOT NULL
          ORDER BY s.created_at DESC`,
        [clean],
      ),
    );
    for (const r of rows) if (!out.has(r.email)) out.set(r.email, r.ip_address);
    return out;
  } catch (err) {
    console.warn(`[careercoach] main platform login IPs failed: ${(err as Error).message}`);
    return new Map();
  }
}
