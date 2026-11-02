import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

// Relaunch, 2 Nov 2026. The retired student product's dashboards live under
// /old as a read-only archive, with the same data. Live tools (support, users,
// ops alerts, marketing) and the B2B product (Sensei, B2B GTM, GTM dashboards)
// stay at their original paths. The new product's dashboards (Stu, studojo.pro)
// are at the root: Daily, Funnel, Ratios, Drop-offs, Sources, Journeys,
// Retention and the self-check, under one layout (app/routes/stu-layout.tsx).
// On main, api.journeys.tsx stays unrouted, as it was before.
// The Overview (2 Nov 2026) is the root and the landing page after login: one
// short screen with its own range control, so it sits outside that layout. Its
// detail panels are on /usage, inside the layout.
export default [
  index("routes/stu-overview.tsx"),
  layout("routes/stu-layout.tsx", [
    route("daily", "routes/stu-daily.tsx"),
    route("funnel", "routes/stu-funnel.tsx"),
    route("ratios", "routes/stu-ratios.tsx"),
    route("drop-offs", "routes/stu-dropoffs.tsx"),
    route("sources", "routes/stu-sources.tsx"),
    route("journeys", "routes/stu-journeys.tsx"),
    route("retention", "routes/stu-retention.tsx"),
    // Engagement, power users, calls, retention and the live feed, moved off the Overview (2 Nov 2026).
    route("usage", "routes/stu-usage.tsx"),
    route("self-check", "routes/stu-check.tsx"),
  ]),
  route("api/stu", "routes/api.stu.tsx"),
  route("api/stu/overview", "routes/api.stu-overview.tsx"),
  // Vendors and credits (LeadsForge, Apollo): balances, spend, run-out dates.
  route("vendors", "routes/vendors.tsx"),
  route("api/vendors", "routes/api.vendors.tsx"),
  route("login", "routes/login.tsx"),
  route("users", "routes/users.tsx"),
  route("ops-alerts", "routes/ops-alerts.tsx"),
  route("tickets", "routes/tickets.tsx"),
  route("tickets/:id", "routes/tickets.$id.tsx"),
  route("settings", "routes/settings.tsx"),
  route("consultation-signups", "routes/consultation-signups.tsx"),
  route("utm-builder", "routes/utm-builder.tsx"),
  route("webinar-registrations", "routes/webinar-registrations.tsx"),
  route("campus-ambassadors", "routes/campus-ambassadors.tsx"),
  route("ugc-applicants", "routes/ugc-applicants.tsx"),
  // The Growth Fellowship name for the same page.
  route("fellowship", "routes/ugc-applicants.tsx", { id: "fellowship" }),
  // The Growth Fellowship program (Navigate, Live tools): the tracking dashboard and the editorial
  // calendar, where Claude's drafts are reviewed. The old calendar address redirects.
  route("fellowship-program", "routes/fellowship-program.tsx"),
  route("fellowship-program/calendar", "routes/fellowship-calendar.tsx"),
  route("fellowship/calendar", "routes/fellowship-calendar-redirect.tsx"),
  route("sensei", "routes/sensei.tsx"),
  route("b2b-gtm", "routes/b2b-gtm.tsx"),
  route("b2b-gtm/team/:who", "routes/b2b-gtm.team.$who.tsx"),
  route("b2b-gtm/:id", "routes/b2b-gtm.$id.tsx"),
  route("gtm", "routes/gtm.tsx"),
  route("gtm/:slug", "routes/gtm.$slug.tsx"),
  route("api/settings", "routes/api.settings.tsx"),
  route("api/sensei", "routes/api.sensei.tsx"),
  route("api/sensei/chat/:chatId", "routes/api.sensei.chat.$chatId.tsx"),
  route("api/ops-alerts", "routes/api.ops-alerts.tsx"),
  route("api/ops-alerts/:id", "routes/api.ops-alerts.$id.tsx"),
  route("api/tickets", "routes/api.tickets.tsx"),
  route("api/tickets/:id", "routes/api.tickets.$id.tsx"),
  route("api/tickets/:id/messages", "routes/api.tickets.$id.messages.tsx"),
  route("api/consultation-signups", "routes/api.consultation-signups.tsx"),
  route("api/utm-campaigns", "routes/api.utm-campaigns.tsx"),
  route("api/utm-report", "routes/api.utm-report.tsx"),
  // Shared by the UTM page here and the old analytics pages under /old.
  route("api/posthog", "routes/api.posthog.tsx"),
  route("api/webinar-registrations", "routes/api.webinar-registrations.tsx"),
  route("api/campus-ambassadors", "routes/api.campus-ambassadors.tsx"),
  route("api/ugc-applicants", "routes/api.ugc-applicants.tsx"),
  route("api/ugc-creators", "routes/api.ugc-creators.tsx"),
  route("api/ugc-creators/:id", "routes/api.ugc-creators.$id.tsx"),
  route("api/fellowship-calendar", "routes/api.fellowship-calendar.tsx"),
  route("api/fellowship-dashboard", "routes/api.fellowship-dashboard.tsx"),
  // Vanshika's Claude Code (shared key, not an admin login): drafts in, never approval.
  route("api/agent/*", "routes/api.agent.$.tsx"),
  route("api/b2b-gtm", "routes/api.b2b-gtm.tsx"),
  route("api/gtm-dashboards", "routes/api.gtm-dashboards.tsx"),

  ...prefix("old", [
    // Pages share the archive banner; API routes stay outside the layout.
    layout("routes/old-layout.tsx", [
      index("routes/dashboard.tsx"),
      route("daily", "routes/daily-dashboard.tsx"),
      route("funnel", "routes/funnel.tsx"),
      route("journeys", "routes/user-journeys.tsx"),
      route("analytics", "routes/analytics.tsx"),
      route("outreach-orders", "routes/outreach-orders.tsx"),
      route("outreach", "routes/outreach.tsx"),
      route("outreach-campaign", "routes/outreach-campaign.tsx"),
      route("campaign-health", "routes/campaign-health.tsx"),
      route("campaign-refund-check", "routes/campaign-refund-check.tsx"),
      route("paid-users", "routes/paid-users.tsx"),
      route("suppression", "routes/suppression.tsx"),
      route("coupons", "routes/coupons.tsx"),
      route("email-sequences", "routes/email-sequences.tsx"),
      route("career-coach", "routes/career-coach.tsx"),
      route("careers", "routes/careers.tsx"),
      route("dissertations", "routes/dissertations.tsx"),
      route("assignments", "routes/assignments.tsx"),
      route("chat-logs", "routes/chat-logs.tsx"),
    ]),
    route("api/dashboard", "routes/api.dashboard.tsx"),
    route("api/sources", "routes/api.sources.tsx"),
    route("api/health-watch", "routes/api.health-watch.tsx"),
    route("api/overview", "routes/api.overview.tsx"),
    route("api/paid-emails", "routes/api.paid-emails.tsx"),
    route("api/analytics", "routes/api.analytics.tsx"),
    route("api/outreach", "routes/api.outreach.tsx"),
    route("api/refund-check", "routes/api.refund-check.tsx"),
    route("api/suppression", "routes/api.suppression.tsx"),
    route("api/coupons", "routes/api.coupons.tsx"),
    route("api/career-coach", "routes/api.career-coach.tsx"),
    route("api/chat-logs", "routes/api.chat-logs.tsx"),
  ]),

  // Old bookmarks and open tabs: /outreach-orders goes to /old/outreach-orders,
  // /api/outreach to /old/api/outreach.
  route("*", "routes/old-redirect.tsx"),
] satisfies RouteConfig;
