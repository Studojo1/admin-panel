import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./admin-tour.css";

// A short tour of an admin page, like the one on each fellow's page: one part lit at a time and a card that
// says what it's for. It opens by itself the first time someone opens the page in this browser (seen once it
// opens, so leaving halfway doesn't bring it back), and again from "Take the tour". A tap on the lit part ends
// the tour and goes through to what's under it. Steps whose part isn't on the page are left out.
export interface TourStep { sel?: string; title: string; body: string }

const KEY = "adminTour:v1:";

export function AdminTour({ page, steps, ready = true }: { page: string; steps: TourStep[]; ready?: boolean }) {
  const [list, setList] = useState<TourStep[]>([]);
  const [at, setAt] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  const target = (s?: TourStep) => (s?.sel ? document.querySelector<HTMLElement>(s.sel) : null);
  const start = useCallback(() => {
    try { localStorage.setItem(KEY + page, "1"); } catch { /* private mode: it just shows again next time */ }
    lastFocus.current = document.activeElement as HTMLElement | null;
    setList(steps.filter((s) => !s.sel || target(s)));
    setAt(0);
  }, [page, steps]);
  const close = useCallback(() => {
    setAt(null);
    lastFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!ready) return;
    let seen = false;
    try { seen = localStorage.getItem(KEY + page) === "1"; } catch { seen = false; }
    if (seen) return;
    const t = setTimeout(start, 700);
    return () => clearTimeout(t);
  }, [ready, page, start]);

  const step = at == null ? null : list[at];
  // Bring the lit part into view, then keep the light on it as the page scrolls or redraws.
  useLayoutEffect(() => {
    if (!step) return;
    const el = target(step);
    // A part taller than the screen is shown from its top, where its headings are.
    if (el) el.scrollIntoView({ block: el.offsetHeight > innerHeight - 120 ? "start" : "center", behavior: "auto" });
    const place = () => { const e = target(step); setRect(e ? e.getBoundingClientRect() : null); };
    place();
    addEventListener("resize", place); addEventListener("scroll", place, true);
    const tick = setInterval(place, 400);
    card.current?.querySelector<HTMLButtonElement>(".atour-main")?.focus();
    return () => { removeEventListener("resize", place); removeEventListener("scroll", place, true); clearInterval(tick); };
  }, [step]);

  useEffect(() => {
    if (at == null) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") { ev.preventDefault(); close(); }
      else if (ev.key === "ArrowRight" && at < list.length - 1) { ev.preventDefault(); setAt(at + 1); }
      else if (ev.key === "ArrowLeft" && at > 0) { ev.preventDefault(); setAt(at - 1); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [at, list.length, close]);

  // A tap on the lit part ends the tour and does what it would have done without it.
  const passThrough = (ev: React.MouseEvent) => {
    if (!rect || card.current?.contains(ev.target as Node)) return;
    const { clientX: x, clientY: y } = ev;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
    if (layer.current) layer.current.style.pointerEvents = "none";
    if (card.current) card.current.style.pointerEvents = "none";
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    setAt(null);
    const field = hit?.closest<HTMLElement>("textarea, input, select");
    if (field) { field.focus(); return; }
    hit?.closest<HTMLElement>("button, a, label, summary")?.click();
  };

  const pad = 6;
  const lit = step && rect && rect.width > 8 && rect.height > 8 ? rect : null;
  // The card goes under the lit part when there's room, else above it, else (a part taller than the screen)
  // in the bottom right corner, where it covers least; always on screen.
  let pos: React.CSSProperties = {};
  if (lit && typeof window !== "undefined") {
    const w = Math.min(380, innerWidth - 32), h = card.current?.offsetHeight ?? 240;
    const below = lit.bottom + pad + 14, above = lit.top - pad - 14 - h;
    const fits = below + h <= innerHeight - 16 || above >= 16;
    const left = fits ? Math.max(16, Math.min(innerWidth - w - 16, lit.left)) : innerWidth - w - 24;
    const top = below + h <= innerHeight - 16 ? below : above >= 16 ? above : Math.max(16, innerHeight - h - 24);
    pos = { left, top, width: w };
  }

  return (
    <>
      <button type="button" className="atour-open" onClick={start} aria-label="Take the tour of this page">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
        Take the tour
      </button>
      {step && typeof document !== "undefined" ? createPortal(
        <div ref={layer} className={`atour-layer${lit ? "" : " atour-center"}`} onClick={passThrough}>
          {lit ? <div className="atour-hole" aria-hidden="true" style={{ top: Math.max(8, lit.top - pad), left: lit.left - pad, width: lit.width + pad * 2, height: Math.min(innerHeight - 8, lit.bottom + pad) - Math.max(8, lit.top - pad) }} /> : null}
          <div ref={card} className="atour-card" role="dialog" aria-modal="true" aria-labelledby="atour-title" aria-describedby="atour-body" style={pos}>
            <div className="atour-head">
              <p className="atour-step">Step {at! + 1} of {list.length}</p>
              <h2 className="atour-title" id="atour-title">{step.title}</h2>
              <div className="atour-bar" aria-hidden="true">{list.map((_, i) => <i key={i} className={i <= at! ? "atour-on" : ""} />)}</div>
            </div>
            <p className="atour-body" id="atour-body">{step.body}</p>
            <div className="atour-actions">
              {at! > 0
                ? <button type="button" className="atour-btn atour-quiet" onClick={() => setAt(at! - 1)}>Back</button>
                : <button type="button" className="atour-btn atour-quiet" onClick={close}>Skip</button>}
              {at! < list.length - 1
                ? <button type="button" className="atour-btn atour-main" onClick={() => setAt(at! + 1)}>{at === 0 ? "Show me" : "Next"}</button>
                : <button type="button" className="atour-btn atour-main" onClick={close}>Done</button>}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
