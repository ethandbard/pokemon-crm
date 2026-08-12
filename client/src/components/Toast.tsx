import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastTone = 'neutral' | 'success' | 'error';

interface ToastAction {
  label: string;
  /** Return a promise to keep the toast alive until the action settles. */
  onAct: () => void | Promise<void>;
}

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

interface ToastOptions {
  tone?: ToastTone;
  action?: ToastAction;
  /** Milliseconds before auto-dismiss. Errors default to longer. */
  duration?: number;
}

interface ToastContextValue {
  toast: (message: string, options?: ToastOptions) => void;
  /**
   * Runs `perform`, then shows an undo toast. If the user hits Undo, `undo`
   * runs and `onSettled` fires again so the caller can refresh.
   *
   * This is the replacement for `window.confirm` on destructive actions:
   * recoverable-after beats blocking-before.
   */
  confirmable: (config: {
    message: string;
    perform: () => Promise<void>;
    undo: () => Promise<void>;
    onSettled?: () => void;
    onError?: (message: string) => void;
  }) => Promise<void>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000;
const ERROR_DURATION = 8000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      const tone = options.tone ?? 'neutral';
      setToasts((current) => [...current, { id, message, tone, action: options.action }]);

      const duration = options.duration ?? (tone === 'error' ? ERROR_DURATION : DEFAULT_DURATION);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const confirmable = useCallback<ToastContextValue['confirmable']>(
    async ({ message, perform, undo, onSettled, onError }) => {
      try {
        await perform();
      } catch (err) {
        const text = err instanceof Error ? err.message : 'Something went wrong';
        onError?.(text);
        toast(text, { tone: 'error' });
        return;
      }

      onSettled?.();

      toast(message, {
        tone: 'success',
        action: {
          label: 'Undo',
          onAct: async () => {
            try {
              await undo();
              onSettled?.();
              toast('Undone', { tone: 'neutral' });
            } catch (err) {
              const text = err instanceof Error ? err.message : 'Could not undo';
              onError?.(text);
              toast(text, { tone: 'error' });
            }
          },
        },
      });
    },
    [toast],
  );

  const value = useMemo(() => ({ toast, confirmable }), [toast, confirmable]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}

const TONE_STYLES: Record<ToastTone, string> = {
  neutral: 'border-hairline bg-ink text-white',
  success: 'border-hairline bg-ink text-white',
  error: 'border-status-critical bg-status-critical text-white',
};

const TONE_ICON: Record<ToastTone, string> = {
  neutral: '•',
  success: '✓',
  error: '▲',
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      // `polite` so a toast never interrupts what a screen reader is saying;
      // these are confirmations, not alarms.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg ${TONE_STYLES[toast.tone]}`}
        >
          <span aria-hidden="true" className="text-xs opacity-80">
            {TONE_ICON[toast.tone]}
          </span>
          <span className="flex-1">{toast.message}</span>

          {toast.action && (
            <button
              type="button"
              onClick={() => {
                void toast.action?.onAct();
                onDismiss(toast.id);
              }}
              className="rounded-md border border-white/30 px-2 py-0.5 text-xs font-semibold hover:bg-white/10"
            >
              {toast.action.label}
            </button>
          )}

          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
            className="rounded px-1 text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/** Registers a global keyboard shortcut. Used by the command palette. */
export function useHotkey(
  matches: (event: KeyboardEvent) => boolean,
  handler: () => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (matches(event)) {
        event.preventDefault();
        handlerRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // `matches` is expected to be a stable module-level predicate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
