import { motion } from "framer-motion";

type StatCardProps = {
  value: string | number;
  label: string;
  color?: "purple" | "green" | "orange" | "pink" | "yellow";
  delay?: number;
  /** A small line under the label, such as the change against the previous period. */
  note?: React.ReactNode;
  /** Makes the whole card a button, such as one that opens the people behind the number. */
  onClick?: () => void;
  /** Hover text. */
  title?: string;
};

const colorClasses = {
  purple: "bg-purple-500",
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  pink: "bg-pink-500",
  yellow: "bg-yellow-500",
};

export function StatCard({ value, label, color = "purple", delay = 0, note, onClick, title }: StatCardProps) {
  const className = `rounded-2xl border-2 border-neutral-900 ${colorClasses[color]} p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-shadow hover:shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]`;
  const inner = (
    <div className="flex flex-col gap-2">
      <span className="font-['Clash_Display'] text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
      <span className="font-['Satoshi'] text-base font-medium leading-6 text-white/90 md:text-lg">
        {label}
      </span>
      {note != null && <span className="font-['Satoshi'] text-xs font-medium leading-snug text-white/90">{note}</span>}
    </div>
  );
  const motionProps = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay, ease: "easeOut" as const },
    whileHover: { scale: 1.02, y: -4 },
  };
  if (onClick) {
    return (
      <motion.button type="button" onClick={onClick} title={title} {...motionProps} className={`${className} w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-neutral-900/30`}>
        {inner}
      </motion.button>
    );
  }
  return (
    <motion.div title={title} {...motionProps} className={className}>
      {inner}
    </motion.div>
  );
}
