import type { ReactNode } from 'react';
import { typeColor, titleCase } from '../lib/format';
import type { MoveDamageClass, Pagination } from '../lib/types';

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-hairline bg-surface shadow-[0_1px_2px_rgba(11,11,11,0.04)] ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Indeterminate loading state. `rows` renders skeleton bars for table areas. */
export function Loading({ label = 'Loading…', rows = 0 }: { label?: string; rows?: number }) {
  if (rows > 0) {
    return (
      <div className="space-y-2" role="status" aria-live="polite" aria-label={label}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-9 animate-pulse rounded-md bg-hairline/60" />
        ))}
      </div>
    );
  }
  return (
    <div
      className="flex items-center justify-center gap-2.5 py-12 text-sm text-muted"
      role="status"
      aria-live="polite"
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-hairline border-t-brand" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <p className="text-sm font-medium text-status-critical">
        <span aria-hidden="true">▲ </span>
        Something went wrong
      </p>
      <p className="max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink hover:bg-plane"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
      style={{ backgroundColor: typeColor(type) }}
    >
      {titleCase(type)}
    </span>
  );
}

/**
 * Physical / Special / Status. Outlined rather than filled so it never
 * competes with the type badge beside it — the type is the primary encoding.
 */
export function DamageClassBadge({ damageClass }: { damageClass: MoveDamageClass }) {
  const styles = {
    physical: 'border-hairline bg-plane text-ink-2',
    special: 'border-hairline bg-plane text-ink-2',
    status: 'border-hairline bg-surface text-muted',
  }[damageClass];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles}`}
    >
      {titleCase(damageClass)}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface px-4 py-3.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Button({
  children,
  variant = 'secondary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-brand text-white hover:bg-brand-strong border-transparent',
    secondary: 'bg-surface text-ink hover:bg-plane border-hairline',
    danger: 'bg-surface text-status-critical hover:bg-status-critical/5 border-hairline',
  }[variant];

  return (
    <button
      {...props}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

const controlClass =
  'rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className ?? ''}`} />;
}

/**
 * Offset pagination footer. Takes the API's `pagination` envelope whole rather
 * than spread fields, so `from`/`to` can't be forgotten at a call site.
 *
 * `label` names the unit ("note", "flag"); `compact` drops the first/last jumps
 * for footers inside a card.
 */
export function Paginator({
  pagination,
  onChange,
  label = 'result',
  // Explicit because "Pokémon" is its own plural and "Pokémons" is not a word.
  labelPlural = `${label}s`,
  compact = false,
}: {
  pagination: Pagination;
  onChange: (page: number) => void;
  label?: string;
  labelPlural?: string;
  compact?: boolean;
}) {
  const { page, totalPages, total, from, to } = pagination;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-5 py-3 text-sm">
      <p className="text-muted">
        {total === 0 ? (
          `No ${labelPlural}`
        ) : from === 0 ? (
          // Past the end — the page number is about to be clamped back.
          `${total.toLocaleString()} ${total === 1 ? label : labelPlural}`
        ) : (
          <>
            {/* The visible slice, not just the total: a page of 25 out of 312
                otherwise gives no clue which 25 are on screen. */}
            Showing <span className="tabular-nums text-ink">{from.toLocaleString()}</span>–
            <span className="tabular-nums text-ink">{to.toLocaleString()}</span> of{' '}
            <span className="tabular-nums text-ink">{total.toLocaleString()}</span>{' '}
            {total === 1 ? label : labelPlural}
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        {!compact && (
          <Button onClick={() => onChange(1)} disabled={page <= 1} aria-label="First page">
            «
          </Button>
        )}
        <Button onClick={() => onChange(page - 1)} disabled={page <= 1}>
          Previous
        </Button>
        <span className="tabular-nums text-muted">
          Page {page} of {totalPages}
        </span>
        <Button onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
          Next
        </Button>
        {!compact && (
          <Button
            onClick={() => onChange(totalPages)}
            disabled={page >= totalPages}
            aria-label="Last page"
          >
            »
          </Button>
        )}
      </div>
    </div>
  );
}
