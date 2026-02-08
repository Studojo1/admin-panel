import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { AlertModal } from "./alert-modal";
import { ConfirmModal } from "./confirm-modal";
import { PromptModal } from "./prompt-modal";

interface ModalContextType {
  showAlert: (message: string) => Promise<void>;
  showConfirm: (message: string, confirmText?: string, cancelText?: string) => Promise<boolean>;
  showPrompt: (message: string, defaultValue?: string, placeholder?: string, confirmText?: string, cancelText?: string) => Promise<string | null>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within ModalProvider");
  }
  return context;
}

interface ModalProviderProps {
  children: ReactNode;
}

export function ModalProvider({ children }: ModalProviderProps) {
  const [alertState, setAlertState] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: "",
  });
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    message: string;
    confirmText?: string;
    cancelText?: string;
    resolve?: (value: boolean) => void;
  }>({
    isOpen: false,
    message: "",
  });
  const [promptState, setPromptState] = useState<{
    isOpen: boolean;
    message: string;
    defaultValue?: string;
    placeholder?: string;
    confirmText?: string;
    cancelText?: string;
    resolve?: (value: string | null) => void;
  }>({
    isOpen: false,
    message: "",
  });

  const [alertResolve, setAlertResolve] = useState<(() => void) | null>(null);

  const showAlert = useCallback((message: string): Promise<void> => {
    return new Promise((resolve) => {
      setAlertResolve(() => resolve);
      setAlertState({ isOpen: true, message });
    });
  }, []);

  const showConfirm = useCallback(
    (message: string, confirmText?: string, cancelText?: string): Promise<boolean> => {
      return new Promise((resolve) => {
        setConfirmState({
          isOpen: true,
          message,
          confirmText,
          cancelText,
          resolve,
        });
      });
    },
    []
  );

  const showPrompt = useCallback(
    (
      message: string,
      defaultValue?: string,
      placeholder?: string,
      confirmText?: string,
      cancelText?: string
    ): Promise<string | null> => {
      return new Promise((resolve) => {
        setPromptState({
          isOpen: true,
          message,
          defaultValue,
          placeholder,
          confirmText,
          cancelText,
          resolve,
        });
      });
    },
    []
  );

  const handleAlertClose = () => {
    if (alertResolve) {
      alertResolve();
      setAlertResolve(null);
    }
    setAlertState({ isOpen: false, message: "" });
  };

  const handleConfirm = () => {
    if (confirmState.resolve) {
      confirmState.resolve(true);
    }
    setConfirmState({ isOpen: false, message: "" });
  };

  const handleCancel = () => {
    if (confirmState.resolve) {
      confirmState.resolve(false);
    }
    setConfirmState({ isOpen: false, message: "" });
  };

  const handlePromptConfirm = (value: string) => {
    if (promptState.resolve) {
      promptState.resolve(value);
    }
    setPromptState({ isOpen: false, message: "" });
  };

  const handlePromptCancel = () => {
    if (promptState.resolve) {
      promptState.resolve(null);
    }
    setPromptState({ isOpen: false, message: "" });
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      <AlertModal
        isOpen={alertState.isOpen}
        message={alertState.message}
        onClose={handleAlertClose}
      />
      <ConfirmModal
        isOpen={confirmState.isOpen}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
      <PromptModal
        isOpen={promptState.isOpen}
        message={promptState.message}
        defaultValue={promptState.defaultValue}
        placeholder={promptState.placeholder}
        confirmText={promptState.confirmText}
        cancelText={promptState.cancelText}
        onConfirm={handlePromptConfirm}
        onCancel={handlePromptCancel}
      />
    </ModalContext.Provider>
  );
}

