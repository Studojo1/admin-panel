// Recordings (5 Nov 2026): rrweb-player, loaded in the browser only when a recording is opened (its own chunk). The
// replay draws in a sandboxed frame with no scripts (rrweb's replayer), so nothing recorded can run here. Skips the
// idle stretches; journey steps and page changes are markers on the timeline (tags).
import { useEffect, useRef } from "react";

export interface PlayerApi {
  goto: (offsetMs: number, play?: boolean) => void;
  pause: () => void;
}

export function ReplayPlayer({ events, onReady }: { events: any[]; onReady?: (p: PlayerApi | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let player: any = null;
    let gone = false;
    (async () => {
      const [mod] = await Promise.all([import("rrweb-player"), import("rrweb-player/dist/style.css")]);
      const el = box.current;
      if (gone || !el) return;
      el.innerHTML = "";
      const width = Math.max(320, el.clientWidth);
      const Player = (mod as any).default ?? (mod as any).Player;
      player = new Player({
        target: el,
        props: {
          events,
          width,
          height: Math.round(Math.min(width * 0.62, 640)),
          autoPlay: false,
          skipInactive: true,
          showController: true,
          mouseTail: false,
          speedOption: [1, 2, 4, 8],
          tags: { journey: "#7c3aed", page: "#0ea5e9" },
        },
      });
      onReady?.({ goto: (ms, play) => player?.goto(ms, play), pause: () => player?.pause() });
    })().catch((e) => {
      if (box.current) box.current.textContent = `The player did not load: ${e?.message || e}`;
    });
    return () => {
      gone = true;
      onReady?.(null);
      try {
        player?.pause?.();
        player?.$destroy?.();
      } catch {
        // already gone
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);
  return <div ref={box} className="rr-box w-full overflow-hidden rounded-xl border-2 border-neutral-900 bg-neutral-100" />;
}
