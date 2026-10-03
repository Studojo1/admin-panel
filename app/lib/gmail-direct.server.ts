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

let cached: { transporter: Transporter; from: string } | null = null;

function getTransporter(): { transporter: Transporter; from: string } | null {
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
  });
  cached = { transporter, from: `Studojo Support <${user}>` };
  return cached;
}

export interface SendOpts {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendDirectGmail(opts: SendOpts): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.transporter.sendMail({
      from: t.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo,
    });
    return true;
  } catch (e: any) {
    console.error("[gmail-direct] send failed:", e?.message || e);
    return false;
  }
}
