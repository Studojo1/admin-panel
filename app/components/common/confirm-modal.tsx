import { motion, AnimatePresence } from "framer-motion";
import { FiX } from "react-icons/fi";

interface ConfirmModalProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmModal({
  isOpen,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel",
}: ConfirmModalProps) {
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
                Confirm
              </h2>
              <button
                onClick={onCancel}
                className="rounded-lg border-2 border-neutral-900 bg-white p-2 transition-colors hover:bg-gray-50"
                aria-label="Close"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-6 font-['Satoshi'] text-sm text-neutral-700">
              {message}
            </p>

            <div className="flex gap-4">
              <button
                onClick={onCancel}
                className="flex-1 rounded-lg border-2 border-neutral-900 bg-white px-6 py-2 font-['Satoshi'] font-medium text-neutral-900 transition-colors hover:bg-neutral-100"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 rounded-lg border-2 border-neutral-900 bg-violet-600 px-6 py-2 font-['Satoshi'] font-bold text-white transition-colors hover:bg-violet-700"
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

