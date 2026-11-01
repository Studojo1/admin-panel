import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

// Relaunch, 2 Nov 2026: the old student product is retired. Every page and API
// route it had lives under /old as an archive, with the same queries and data.
// The root is kept for the new product's dashboards, which come after launch.
export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),

  ...prefix("old", [
    // Pages share the archive banner; API routes stay outside the layout.
    layout("routes/old-layout.tsx", [
      index("routes/dashboard.tsx"),
      route("users", "routes/users.tsx"),
      route("funnel", "routes/funnel.tsx"),
      route("journeys", "routes/user-journeys.tsx"),
      route("daily", "routes/daily-dashboard.tsx"),
      route("assignments", "routes/assignments.tsx"),
      route("dissertations", "routes/dissertations.tsx"),
      route("outreach-orders", "routes/outreach-orders.tsx"),
      route("campaign-health", "routes/campaign-health.tsx"),
      route("paid-users", "routes/paid-users.tsx"),
      route("outreach-campaign", "routes/outreach-campaign.tsx"),
      route("campaign-refund-check", "routes/campaign-refund-check.tsx"),
      route("suppression", "routes/suppression.tsx"),
      route("outreach", "routes/outreach.tsx"),
      route("careers", "routes/careers.tsx"),
      route("settings", "routes/settings.tsx"),
      route("email-sequences", "routes/email-sequences.tsx"),
      route("sensei", "routes/sensei.tsx"),
      route("chat-logs", "routes/chat-logs.tsx"),
      route("ops-alerts", "routes/ops-alerts.tsx"),
      route("tickets", "routes/tickets.tsx"),
      route("tickets/:id", "routes/tickets.$id.tsx"),
      route("consultation-signups", "routes/consultation-signups.tsx"),
      route("analytics", "routes/analytics.tsx"),
      route("utm-builder", "routes/utm-builder.tsx"),
      route("coupons", "routes/coupons.tsx"),
      route("career-coach", "routes/career-coach.tsx"),
      route("webinar-registrations", "routes/webinar-registrations.tsx"),
      route("campus-ambassadors", "routes/campus-ambassadors.tsx"),
      route("b2b-gtm", "routes/b2b-gtm.tsx"),
      route("b2b-gtm/team/:who", "routes/b2b-gtm.team.$who.tsx"),
      route("b2b-gtm/:id", "routes/b2b-gtm.$id.tsx"),
      route("gtm", "routes/gtm.tsx"),
      route("gtm/:slug", "routes/gtm.$slug.tsx"),
    ]),
    route("api/dashboard", "routes/api.dashboard.tsx"),
    route("api/sources", "routes/api.sources.tsx"),
    route("api/health-watch", "routes/api.health-watch.tsx"),
    route("api/overview", "routes/api.overview.tsx"),
    route("api/paid-emails", "routes/api.paid-emails.tsx"),
    route("api/journeys", "routes/api.journeys.tsx"),
    route("api/refund-check", "routes/api.refund-check.tsx"),
    route("api/suppression", "routes/api.suppression.tsx"),
    route("api/settings", "routes/api.settings.tsx"),
    route("api/sensei", "routes/api.sensei.tsx"),
    route("api/sensei/chat/:chatId", "routes/api.sensei.chat.$chatId.tsx"),
    route("api/chat-logs", "routes/api.chat-logs.tsx"),
    route("api/ops-alerts", "routes/api.ops-alerts.tsx"),
    route("api/ops-alerts/:id", "routes/api.ops-alerts.$id.tsx"),
    route("api/tickets", "routes/api.tickets.tsx"),
    route("api/tickets/:id", "routes/api.tickets.$id.tsx"),
    route("api/tickets/:id/messages", "routes/api.tickets.$id.messages.tsx"),
    route("api/consultation-signups", "routes/api.consultation-signups.tsx"),
    route("api/utm-campaigns", "routes/api.utm-campaigns.tsx"),
    route("api/utm-report", "routes/api.utm-report.tsx"),
    route("api/coupons", "routes/api.coupons.tsx"),
    route("api/posthog", "routes/api.posthog.tsx"),
    route("api/analytics", "routes/api.analytics.tsx"),
    route("api/outreach", "routes/api.outreach.tsx"),
    route("api/career-coach", "routes/api.career-coach.tsx"),
    route("api/webinar-registrations", "routes/api.webinar-registrations.tsx"),
    route("api/campus-ambassadors", "routes/api.campus-ambassadors.tsx"),
    route("api/b2b-gtm", "routes/api.b2b-gtm.tsx"),
    route("api/gtm-dashboards", "routes/api.gtm-dashboards.tsx"),
  ]),

  // The pod-restart-alerter CronJob posts to /api/ops-alerts (the URL in its
  // ops-alert-webhook secret) and does not follow redirects, so ingest still
  // answers at the root. Same module, same token check.
  route("api/ops-alerts", "routes/api.ops-alerts.tsx", { id: "ops-alerts-ingest" }),

  // Old bookmarks and open tabs: /users goes to /old/users, /api/x to /old/api/x.
  route("*", "routes/old-redirect.tsx"),
] satisfies RouteConfig;
