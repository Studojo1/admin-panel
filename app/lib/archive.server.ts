import { ARCHIVE_READ_ONLY } from "./archive";

// Every write to an /old API route answers with this; the loaders still read.
export function archiveReadOnly(): Response {
  return Response.json(
    { error: ARCHIVE_READ_ONLY, detail: ARCHIVE_READ_ONLY },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
