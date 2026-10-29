// Small helpers for the Growth Fellowship admin pages (client safe).

/** wa.me link with the welcome message and their dashboard link, or null without a usable number. */
export function welcomeWhatsapp(name: string, whatsapp: string | null, link: string): string | null {
  const digits = (whatsapp || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const first = name.trim().split(/\s+/)[0] || "there";
  const text = `Hi ${first}, welcome to the Studojo Growth Fellowship! This is your own page, where your posts show up each week: ${link} . Please keep this link to yourself.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** wa.me link reminding a creator about this week's posts. */
export function nudgeWhatsapp(name: string, whatsapp: string | null, link: string, left: number): string | null {
  const digits = (whatsapp || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const first = name.trim().split(/\s+/)[0] || "there";
  const text = `Hi ${first}, a quick nudge: ${left === 1 ? "1 post is" : `${left} posts are`} waiting for you this week. They're ready to copy on your dashboard: ${link}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "No activity yet";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** "26 Oct" for a "YYYY-MM-DD" (or ISO) date. */
export function shortDate(day: string): string {
  const d = new Date(`${String(day).slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "Tue 28 Oct" for a "YYYY-MM-DD" date. */
export function dayLabel(day: string): string {
  const d = new Date(`${String(day).slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** Today in India as "YYYY-MM-DD". */
export function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** The Monday of the week a "YYYY-MM-DD" date falls in. */
export function weekOf(day: string): string {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * 86400000).toISOString().slice(0, 10);
}

/**
 * The next posting day (Tuesday, Thursday or Saturday) from today that no
 * existing post already uses, so three posts a week fall into place.
 */
export function suggestDueDate(taken: string[]): string {
  const used = new Set(taken.map((d) => String(d).slice(0, 10)));
  const [y, m, d] = istToday().split("-").map(Number);
  for (let i = 1; i <= 60; i++) {
    const t = new Date(Date.UTC(y, m - 1, d) + i * 86400000);
    const day = t.toISOString().slice(0, 10);
    if ([2, 4, 6].includes(t.getUTCDay()) && !used.has(day)) return day;
  }
  return new Date(Date.UTC(y, m - 1, d) + 86400000).toISOString().slice(0, 10);
}
