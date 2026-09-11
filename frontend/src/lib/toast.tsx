import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  push: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const STYLES: Record<ToastKind, string> = {
  success: "border-ok-500/30 text-ok-600 dark:text-ok-500",
  error: "border-danger-500/30 text-danger-600 dark:text-danger-500",
  info: "border-teal-500/30 text-teal-600",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((message: string, kind: ToastKind = "success") => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  function dismiss(id: number) {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {items.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div
              key={t.id}
              className={`card border-l-2 ${STYLES[t.kind]} px-3 py-2.5 flex items-start gap-2 animate-stagger`}
              role="status"
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <p className="text-sm text-ink dark:text-steel-100 flex-1">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-ink-faint hover:text-ink dark:hover:text-steel-100">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
