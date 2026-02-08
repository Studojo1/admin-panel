import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiX } from "react-icons/fi";

interface PromptModalProps {
  isOpen: boolean;
  message: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  placeholder?: string;
}

export function PromptModal({
  isOpen,
  message,
  defaultValue = "",
  onConfirm,
  onCancel,
  confirmText = "Submit",
  cancelText = "Cancel",
  placeholder = "",
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      // Focus input after animation
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, defaultValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-['Clash_Display'] text-xl font-bold text-neutral-900">
                Prompt
              </h2>
              <button
                onClick={onCancel}
                className="rounded-lg border-2 border-neutral-900 bg-white p-2 transition-colors hover:bg-gray-50"
                aria-label="Close"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <p className="mb-4 font-['Satoshi'] text-sm text-neutral-700">
                {message}
              </p>

              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                className="mb-6 w-full rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] focus:outline-none focus:ring-2 focus:ring-violet-500"
              />

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 rounded-lg border-2 border-neutral-900 bg-white px-6 py-2 font-['Satoshi'] font-medium text-neutral-900 transition-colors hover:bg-neutral-100"
                >
                  {cancelText}
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg border-2 border-neutral-900 bg-violet-600 px-6 py-2 font-['Satoshi'] font-bold text-white transition-colors hover:bg-violet-700"
                >
                  {confirmText}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

