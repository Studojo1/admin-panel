// EMAIL-PAUSE, 29 Oct 2026. The owner's order, word for word: "kill all the
// emails being sent by us to a user now, and the internal team emails as well;
// the only emails should be the ones the students send to hiring managers".
//
// The admin panel's own email (the ticket reply sent to a user through Gmail,
// gmail-direct.server.ts) is held while this returns true.
//
// Paused by default. An unset EMAILS_PAUSED keeps it held, so any redeploy
// stays paused without a workflow change. Only EMAILS_PAUSED=0 sends again.
// Account emails (sign-in codes, verification, password reset) live in the
// emailer service, paused there.
export function emailsPaused(): boolean {
  return (process.env.EMAILS_PAUSED ?? "").trim() !== "0";
}
