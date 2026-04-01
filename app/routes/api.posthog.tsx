/**
 * Server-side PostHog API proxy.
 * Keeps POSTHOG_PERSONAL_API_KEY server-side — never sent to the browser.
 *
 * GET  /api/posthog?type=sessions&...   → /session_recordings/
 * GET  /api/posthog?type=persons&...    → /persons/
 * GET  /api/posthog?type=cohorts        → /cohorts/
 * GET  /api/posthog?type=cohort_persons&cohort_id=X → persons in cohort
 * POST /api/posthog?type=query          → /query/  (HogQL / FunnelsQuery)
 */

const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY ?? "";
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID ?? "150589";
const BASE = `https://eu.posthog.com/api/projects/${PROJECT_ID}`;

function phHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function loader({ request }: { request: Request }) {
  if (!API_KEY) {
    return Response.json({ error: "PostHog API key not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  try {
    if (type === "sessions") {
      const limit = url.searchParams.get("limit") ?? "20";
      const offset = url.searchParams.get("offset") ?? "0";
      const minDuration = url.searchParams.get("min_duration");
      let qs = `?limit=${limit}&offset=${offset}`;
      if (minDuration) qs += `&duration_filter_type=duration_gt&duration=${minDuration}`;
      const res = await fetch(`${BASE}/session_recordings/${qs}`, { headers: phHeaders() });
      const data = await res.json();
      return Response.json(data, { status: res.status });
    }

    if (type === "persons") {
      const search = url.searchParams.get("search") ?? "";
      const limit = url.searchParams.get("limit") ?? "50";
      const offset = url.searchParams.get("offset") ?? "0";
      let qs = `?limit=${limit}&offset=${offset}`;
      if (search) qs += `&search=${encodeURIComponent(search)}`;
      const res = await fetch(`${BASE}/persons/${qs}`, { headers: phHeaders() });
      const data = await res.json();
      return Response.json(data, { status: res.status });
    }

    if (type === "cohorts") {
      const res = await fetch(`${BASE}/cohorts/?limit=100`, { headers: phHeaders() });
      const data = await res.json();
      return Response.json(data, { status: res.status });
    }

    if (type === "cohort_persons") {
      const cohortId = url.searchParams.get("cohort_id");
      const limit = url.searchParams.get("limit") ?? "10";
      if (!cohortId) return Response.json({ error: "cohort_id required" }, { status: 400 });
      const res = await fetch(
        `${BASE}/persons/?cohort=${cohortId}&limit=${limit}`,
        { headers: phHeaders() }
      );
      const data = await res.json();
      return Response.json(data, { status: res.status });
    }

    if (type === "person_events") {
      const personId = url.searchParams.get("person_id");
      if (!personId) return Response.json({ error: "person_id required" }, { status: 400 });
      // Use HogQL to get last 15 events with key properties for this person
      const res = await fetch(`${BASE}/query/`, {
        method: "POST",
        headers: phHeaders(),
        body: JSON.stringify({
          query: {
            kind: "HogQLQuery",
            query: `SELECT event, timestamp,
              properties.$pathname,
              properties.$current_url,
              properties.file_type,
              properties.tier,
              properties.amount_cents,
              properties.campaign_id,
              properties.leads_found,
              properties.enriched_count,
              properties.email_address,
              properties.error_type,
              properties.coupon_code
            FROM events WHERE person_id = '${personId}' ORDER BY timestamp DESC LIMIT 15`,
          },
        }),
      });
      const data = await res.json();
      return Response.json(data, { status: res.status });
    }

    return Response.json({ error: "Unknown type" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function action({ request }: { request: Request }) {
  if (!API_KEY) {
    return Response.json({ error: "PostHog API key not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  if (type !== "query") {
    return Response.json({ error: "POST only supports type=query" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const res = await fetch(`${BASE}/query/`, {
      method: "POST",
      headers: phHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
