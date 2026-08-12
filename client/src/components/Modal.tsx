import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Minimal dialog built on the native `<dialog>` element, so focus trapping,
 * Escape-to-close, and the top layer come from the platform rather than from
 * hand-rolled key handling.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // `cancel` fires on Escape; without this the dialog closes but React
      // state still thinks it's open.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Clicking the backdrop targets the dialog itself, not its contents.
        if (event.target === ref.current) onClose();
      }}
      /*
       * `m-auto` is load-bearing: a native <dialog> centres itself via
       * `margin: auto`, and Tailwind's preflight resets margins to 0, which
       * pins the dialog to the top-left corner.
       */
      className={`m-auto max-h-[85vh] w-[92vw] ${width} overflow-y-auto rounded-xl border border-hairline bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/50`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 rounded-md p-1 text-muted hover:bg-plane hover:text-ink"
        >
          ✕
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

export const fieldClass =
  'w-full rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
