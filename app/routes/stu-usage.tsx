// Stu Usage (/usage, 2 Nov 2026): the detail that used to crowd the Overview, on
// its own page under the Stu tabs. Engagement (DAU, WAU, MAU), power users, call
// health, where people stop, retention, the 30-day trends and the live feed. Each
// panel is one section of /api/stu/overview for the tabs' range, as on the
// Overview, and every number opens the people behind it.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { DrillModal, PageTitle, useStu } from "~/components/stu/ui";
import { type Env, KIT_CSS, PALETTE, drillPeople, istTime, useSections } from "~/components/stu/overview-kit";
import { Calls, Dropoffs, Engagement, Feed, Power, Trends, Usage } from "~/components/stu/usage-panels";
import type { Cell } from "~/lib/stu/model";
import type { OvSection } from "~/lib/stu/overview";

export function meta() {
  return [{ title: "Usage · Stu · Studojo Admin" }];
}

const SECTIONS: readonly OvSection[] = ["usage", "power", "calls", "dropoffs", "engagement", "trends", "feed"];

export default function StuUsage() {
  const { filters } = useStu();
  const { start, end, internal } = filters;
  const { S, generated } = useSections(SECTIONS, start, end, internal, true);
  const [drill, setDrill] = useState<{ title: string; cell: Cell; env: Env } | null>(null);
  const openDrill = (title: string, cell: Cell, env: Env) => setDrill({ title, cell, env });
  const qs = new URLSearchParams({ start, end, ...(internal ? { internal: "1" } : {}) }).toString();
  const t = PALETTE;

  // Links from the Overview land on a panel (/usage#calls); scroll there once it has drawn.
  const { hash } = useLocation();
  const scrolled = useRef("");
  const ready = Boolean(generated);
  useEffect(() => {
    if (!hash || !ready || scrolled.current === hash) return;
    scrolled.current = hash;
    window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" }), 50);
  }, [hash, ready]);

  return (
    <div className="ov">
      <style>{KIT_CSS}</style>
      <PageTitle
        title="Usage"
        sub="How the people in range use Stu: engagement, power users, calls, where they stop, retention, the 30-day trends and the live feed."
      />
      <p className="-mt-2 mb-4 text-xs text-neutral-500">
        {generated ? `Read ${istTime(generated)} IST, again every 60 s.` : "Reading."}
        {filters.channel !== "all" ? " The channel filter does not apply on this page: it shows every channel." : ""}
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 [&>*]:min-w-0">
        <div id="engagement" className="scroll-mt-28 lg:col-span-7"><Usage s={S("usage")} drill={openDrill} t={t} /></div>
        <div id="power" className="scroll-mt-28 lg:col-span-5"><Power s={S("power")} drill={openDrill} t={t} qs={qs} /></div>
        <div id="calls" className="scroll-mt-28 lg:col-span-6"><Calls s={S("calls")} drill={openDrill} t={t} /></div>
        <div id="dropoffs" className="scroll-mt-28 lg:col-span-6"><Dropoffs s={S("dropoffs")} drill={openDrill} t={t} qs={qs} /></div>
        <div id="retention" className="scroll-mt-28 lg:col-span-6"><Engagement s={S("engagement")} drill={openDrill} t={t} /></div>
        <div id="trends" className="scroll-mt-28 lg:col-span-6"><Trends s={S("trends")} drill={openDrill} t={t} /></div>
        <div id="feed" className="scroll-mt-28 lg:col-span-12"><Feed s={S("feed")} qs={qs} /></div>
      </div>
      {drill && <DrillModal title={drill.title} cell={drill.cell} data={drillPeople(drill.env)} onClose={() => setDrill(null)} />}
    </div>
  );
}
