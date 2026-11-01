// The /old archive of the retired student product is read only (2 Nov 2026).
// Its API routes keep their loaders; every write answers with this instead.
export const ARCHIVE_READ_ONLY = "The old product archive is read only.";

export function archiveReadOnly(): Response {
  return Response.json(
    { error: ARCHIVE_READ_ONLY, detail: ARCHIVE_READ_ONLY },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
