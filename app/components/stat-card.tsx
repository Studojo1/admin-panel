import { motion } from "framer-motion";

type StatCardProps = {
  value: string | number;
  label: string;
  color?: "purple" | "green" | "orange" | "pink" | "yellow";
  delay?: number;
};

const colorClasses = {
  purple: "bg-purple-500",
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  pink: "bg-pink-500",
  yellow: "bg-yellow-500",
};

export function StatCard({ value, label, color = "purple", delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      whileHover={{ scale: 1.02, y: -4 }}
      className={`rounded-2xl border-2 border-neutral-900 ${colorClasses[color]} p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-shadow hover:shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]`}
    >
      <div className="flex flex-col gap-2">
        <span className="font-['Clash_Display'] text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        <span className="font-['Satoshi'] text-base font-medium leading-6 text-white/90 md:text-lg">
          {label}
        </span>
      </div>
    </motion.div>
  );
}

