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
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] || "there";

export function meetingEmail(m: MeetingInput): { subject: string; html: string; text: string } {
  const when = meetingWhen(m.at);
  const first = firstName(m.fullName);
  const subject = `Your Studojo Growth Fellowship meeting: ${when}`;
  const lines = [
    `Hi ${first},`,
    "Thanks for applying to the Studojo Growth Fellowship. We'd like to meet you.",
    `When: ${when}`,
    m.link ? `Join here: ${m.link}` : "We'll send you the link to join before the call.",
    ...(m.note ? [m.note] : []),
    "If this time doesn't work for you, reply to this email and we'll find another.",
    "The Studojo team",
  ];
  const p = (inner: string) => `<p style="margin:0 0 14px">${inner}</p>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1625;max-width:560px">
${p(`Hi ${esc(first)},`)}
${p("Thanks for applying to the Studojo Growth Fellowship. We'd like to meet you.")}
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
  const text = [
    `Hi ${firstName(m.fullName)}, thanks for applying to the Studojo Growth Fellowship. We'd like to meet you: ${when}.`,
    m.link ? `Join here: ${m.link}` : "We'll send you the link to join before the call.",
    m.note || "",
    "If the time doesn't work, reply here and we'll find another.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
