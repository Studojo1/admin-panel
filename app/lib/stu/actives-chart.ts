// ADMIN-AUDIT-STU (14 Nov 2026): the Active users chart's datasets and axes (app/components/stu/actives-panel.tsx),
// kept here so a test can check them. The audit found the y axis set to stacked: false while the two bars shared the
// stack "dau", so Chart.js drew them over each other: 13 Nov showed 160, not 160 new + 45 returning = 205. The bars
// now stack on one stack id; WAU and MAU each have a stack of their own, so they are never added to anything.
// Type imports only, so `node --test` reads it as is.
import type { ChartDay } from "./actives";

export const DAU_STACK = "dau";
export const WAU_STACK = "wau";
export const MAU_STACK = "mau";

export interface ActivesColors {
  returning: string;
  fresh: string;
  wau: string;
  mau: string;
}

/** The four series: returning and new bars stacked into DAU, then the WAU and MAU lines on stacks of their own. */
export function activesDatasets(days: ChartDay[], colors: ActivesColors, dashed: (flags: boolean[]) => Record<string, unknown> = () => ({})) {
  return [
    { type: "bar" as const, label: "Returning", data: days.map((x) => x.returning.v), backgroundColor: colors.returning, stack: DAU_STACK, maxBarThickness: 16, order: 2 },
    { type: "bar" as const, label: "New (joined that day)", data: days.map((x) => x.new.v), backgroundColor: colors.fresh, stack: DAU_STACK, maxBarThickness: 16, borderRadius: { topLeft: 3, topRight: 3 }, borderSkipped: false, order: 2 },
    { type: "line" as const, label: "WAU", data: days.map((x) => x.wau), stack: WAU_STACK, borderColor: colors.wau, backgroundColor: colors.wau, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0, segment: dashed(days.map((x) => x.wauPartial)), order: 1 },
    { type: "line" as const, label: "MAU", data: days.map((x) => x.mau), stack: MAU_STACK, borderColor: colors.mau, backgroundColor: colors.mau, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0, segment: dashed(days.map((x) => x.mauPartial)), order: 1 },
  ];
}

/** Both axes stacked: the bars of one day sum to its DAU; each line is alone on its stack id. */
export const ACTIVES_STACKING = { x: { stacked: true }, y: { stacked: true } } as const;
