// Stu Ratios: the headline conversions for the people who joined in the range.
// Both sides of every ratio open their people.
import { useMemo } from "react";
import { CARD, Num, PageTitle, SourceNote, useStu } from "~/components/stu/ui";
import { fmtPct, ratios } from "~/lib/stu/model";

export default function StuRatios() {
  const { data, filters } = useStu();
  const rows = useMemo(() => ratios(data, filters), [data, filters]);
  return (
    <div>
      <PageTitle title="Ratios" sub={`People who joined Stu from ${filters.start} to ${filters.end} (IST). Visits are visitor ids in the same range.`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <div key={r.key} className={`p-4 ${CARD}`}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{r.label}</div>
            <div className="mt-1 font-['Clash_Display'] text-3xl font-bold text-neutral-900">
              {r.value == null ? "n/a" : r.avg ? r.value.toLocaleString("en-IN") : fmtPct(r.value)}
            </div>
            <div className="mt-1 text-sm text-neutral-600">
              <Num cell={r.num} title={`${r.label}: ${r.avg ? "total" : "did it"}`} /> {r.avg ? "over" : "of"} <Num cell={r.den} title={`${r.label}: ${r.avg ? "people" : "out of"}`} />
            </div>
            <SourceNote>{r.source}</SourceNote>
          </div>
        ))}
      </div>
    </div>
  );
}
