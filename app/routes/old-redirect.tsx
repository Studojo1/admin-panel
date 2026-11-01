// Every page and API route the admin panel served before the relaunch moved
// under /old (2 Nov 2026). A request for an old address (a bookmark, a tab
// left open over the deploy, an old bundle calling /api/x) goes to the same
// address under /old. 307 keeps the method and body, and is temporary, so the
// root stays free for the new product's dashboards.
import { data, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

function toArchive(request: Request): Response {
  const { pathname, search } = new URL(request.url);
  if (pathname === "/old" || pathname.startsWith("/old/")) {
    throw data(null, { status: 404 });
  }
  return redirect(`/old${pathname}${search}`, 307);
}

export async function loader({ request }: LoaderFunctionArgs) {
  return toArchive(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return toArchive(request);
}

export default function OldRedirect() {
  return null;
}
