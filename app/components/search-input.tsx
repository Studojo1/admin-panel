import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type SearchInputProps = {
  value?: string;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
};

export function SearchInput({
  value = "",
  onChange,
  onSearch,
  placeholder = "Search...",
  debounceMs = 300,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Call onChange if provided
      onChange?.(localValue);
      // Call onSearch if provided (supporting the usage in assignments.tsx)
      onSearch?.(localValue);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onChange, onSearch]);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="relative w-full max-w-md"
    >
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border-2 border-neutral-900 bg-white px-4 py-3 pl-10 font-['Satoshi'] text-base font-normal leading-6 text-neutral-900 placeholder:text-neutral-500 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-shadow focus:outline-none focus:shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]"
      />
      <svg
        className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    </motion.div>
  );
}
