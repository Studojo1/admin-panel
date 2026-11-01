// The message that tells a Growth Fellowship applicant when their meeting is.
// The public form's last screen tells them to watch their email for it, so the
// email is the main channel; WhatsApp is the fallback when it can't be sent.

const IST_PARTS = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "Thursday 30 October, 4:30 pm IST" */
export function meetingWhen(at: Date): string {
  const p = Object.fromEntries(IST_PARTS.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${String(p.dayPeriod || "").toLowerCase()} IST`;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface MeetingInput {
  fullName: string;
  at: Date;
  link: string | null;
  note: string | null;
  /** The time they were last told, when this replaces an earlier message. */
  previousAt?: Date | null;
}

// A message that replaces an earlier one says so: a new time cancels the old
// one, and the same time with a new link or note is an update.
function change(m: MeetingInput): { moved: string | null; updated: boolean } {
  if (!m.previousAt) return { moved: null, updated: false };
  if (m.previousAt.getTime() !== m.at.getTime()) return { moved: meetingWhen(m.previousAt), updated: false };
  return { moved: null, updated: true };
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] || "there";

export function meetingEmail(m: MeetingInput): { subject: string; html: string; text: string } {
  const when = meetingWhen(m.at);
  const first = firstName(m.fullName);
  const { moved, updated } = change(m);
  const subject = moved
    ? `Your Studojo Growth Fellowship meeting has moved: ${when}`
    : updated
      ? `Updated details for your Studojo Growth Fellowship meeting: ${when}`
      : `Your Studojo Growth Fellowship meeting: ${when}`;
  const opening = moved
    ? `We've moved your Studojo Growth Fellowship meeting. The earlier time, ${moved}, is off.`
    : updated
      ? "Here are the updated details for your Studojo Growth Fellowship meeting."
      : "Thanks for applying to the Studojo Growth Fellowship. We'd like to meet you.";
  const lines = [
    `Hi ${first},`,
    opening,
    `When: ${when}`,
    m.link ? `Join here: ${m.link}` : "We'll send you the link to join before the call.",
    ...(m.note ? [m.note] : []),
    "If this time doesn't work for you, reply to this email and we'll find another.",
    "The Studojo team",
  ];
  const p = (inner: string) => `<p style="margin:0 0 14px">${inner}</p>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1625;max-width:560px">
${p(`Hi ${esc(first)},`)}
${p(esc(opening))}
${p(`<b>When:</b> ${esc(when)}`)}
${m.link ? p(`<b>Join here:</b> <a href="${esc(m.link)}" style="color:#5b30da">${esc(m.link)}</a>`) : p("We'll send you the link to join before the call.")}
${m.note ? p(esc(m.note).replace(/\n/g, "<br>")) : ""}
${p("If this time doesn't work for you, reply to this email and we'll find another.")}
${p("The Studojo team")}
</div>`;
  return { subject, html, text: lines.join("\n\n") };
}

/** A wa.me link with the same message, or null without a usable number. */
export function meetingWhatsapp(m: MeetingInput, whatsapp: string | null): string | null {
  const digits = (whatsapp || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const when = meetingWhen(m.at);
  const { moved, updated } = change(m);
  const text = [
    moved
      ? `Hi ${firstName(m.fullName)}, we've moved your Studojo Growth Fellowship meeting to ${when}. The earlier time, ${moved}, is off.`
      : updated
        ? `Hi ${firstName(m.fullName)}, here are the updated details for your Studojo Growth Fellowship meeting: ${when}.`
        : `Hi ${firstName(m.fullName)}, thanks for applying to the Studojo Growth Fellowship. We'd like to meet you: ${when}.`,
    m.link ? `Join here: ${m.link}` : "We'll send you the link to join before the call.",
    m.note || "",
    "If the time doesn't work, reply here and we'll find another.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
