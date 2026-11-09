// Direct Gmail SMTP transport using a Gmail App Password on studojo@gmail.com.
// Copied from the frontend (app/lib/gmail-direct.server.ts). Ticket replies
// used to go to emailer-service, which has no handler for them and dropped every one.
//
// Required env vars on the deployment:
//   STUDOJO_GMAIL_USER          (defaults to studojo@gmail.com)
//   STUDOJO_GMAIL_APP_PASSWORD  (16-char App Password, set as k8s secret)
//
// The transport is created lazily and cached for the lifetime of the process.
import nodemailer, { type Transporter } from "nodemailer";
import { emailsPaused } from "./email-pause.server";

let cached: { transporter: Transporter; from: string; user: string } | null = null;

function getTransporter(): { transporter: Transporter; from: string; user: string } | null {
  if (cached) return cached;
  const user = (process.env.STUDOJO_GMAIL_USER || "studojo@gmail.com").trim();
  const password = (process.env.STUDOJO_GMAIL_APP_PASSWORD || "")
    .replace(/\s+/g, "")
    .trim();
  if (!password) {
    console.error(
      "[gmail-direct] STUDOJO_GMAIL_APP_PASSWORD not set, emails will be skipped",
    );
    return null;
  }
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass: password },
    // Fail in seconds rather than minutes, so the person waiting on a send
    // hears whether it went before their request times out.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  cached = { transporter, from: `Studojo Support <${user}>`, user };
  return cached;
}

export interface SendOpts {
  to: string;
  subject: string;
  html: string;
  /** Plain-text version, sent alongside the HTML when given. */
  text?: string;
  replyTo?: string;
  /** Sender name in place of "Studojo Support"; the address stays the same. */
  fromName?: string;
  /**
   * A message someone on the team read and pressed Send on, to one fellow, from the fellowship desk
   * (the founder, 9 Nov 2026: nudges and requests for stories go by email in one click). The pause
   * holds what the app sends by itself, so only these go through it.
   */
  teamSend?: boolean;
}

export async function sendDirectGmail(opts: SendOpts): Promise<boolean> {
  if (emailsPaused() && !opts.teamSend) {
    console.info("[email-pause] held: ticket reply email (gmail-direct)");
    return false;
  }
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.transporter.sendMail({
      from: opts.fromName ? `${opts.fromName.replace(/[<>"\r\n]/g, "")} <${t.user}>` : t.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      replyTo: opts.replyTo,
    });
    return true;
  } catch (e: any) {
    console.error("[gmail-direct] send failed:", e?.message || e);
    return false;
  }
}
