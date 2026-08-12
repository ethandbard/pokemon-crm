import { Link } from 'react-router-dom';
import type { EvolutionLink } from '../lib/types';
import { titleCase } from '../lib/format';

/** `thunder-stone` → `Thunder stone`, `level-up` → `Level up`. */
function readableTrigger(trigger: string | null): string {
  if (!trigger) return '—';
  return titleCase(trigger.replace(/-/g, ' '));
}

/**
 * Compact stage indicator for a roster row: "2/3" plus a segmented bar.
 *
 * The chain is treated as a programme of study — stage N of a chain of length L
 * is progress toward completion. Fully evolved reads as complete.
 */
export function EvolutionProgress({
  stage,
  chainLength,
  eligible = false,
}: {
  stage: number;
  chainLength: number;
  eligible?: boolean;
}) {
  // A single-stage species has nothing to progress through; showing "1/1" and
  // a full bar would imply an achievement that doesn't exist.
  if (chainLength <= 1) {
    return <span className="text-xs text-muted">—</span>;
  }

  return (
    <span className="flex items-center gap-1.5" title={`Stage ${stage} of ${chainLength}`}>
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: chainLength }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 w-4 rounded-full ${i < stage ? 'bg-brand' : 'bg-hairline'}`}
          />
        ))}
      </span>
      <span className="text-xs tabular-nums text-muted">
        {stage}/{chainLength}
      </span>
      {eligible && (
        <span
          title="Level requirement for the next stage is met"
          className="rounded-full border border-brand bg-brand/10 px-1.5 text-[10px] font-semibold text-brand-strong"
        >
          READY
        </span>
      )}
    </span>
  );
}

/**
 * Full chain for the Pokémon profile — every stage, with the requirement to
 * reach each one, and the current species marked.
 */
export function EvolutionChain({
  chain,
  currentId,
}: {
  chain: EvolutionLink[];
  currentId: number;
}) {
  if (chain.length <= 1) {
    return (
      <p className="text-sm text-muted">
        This Pokémon does not evolve — it is a single-stage species.
      </p>
    );
  }

  // Group by stage so branching chains (Eevee) show their options side by side.
  const stages = [...new Set(chain.map((link) => link.evolutionStage))].sort((a, b) => a - b);

  return (
    <ol className="space-y-3">
      {stages.map((stage) => {
        const links = chain.filter((link) => link.evolutionStage === stage);
        return (
          <li key={stage}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Stage {stage}
            </p>
            <div className="flex flex-wrap gap-2">
              {links.map((link) => {
                const isCurrent = link.id === currentId;
                const body = (
                  <>
                    {link.spriteUrl && (
                      <img src={link.spriteUrl} alt="" width={40} height={40} className="h-10 w-10" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">{link.displayName}</span>
                      <span className="block text-[11px] text-muted">
                        {stage === 1
                          ? 'Base form'
                          : link.evolutionMinLevel
                            ? `Lv ${link.evolutionMinLevel}`
                            : readableTrigger(link.evolutionTrigger)}
                      </span>
                    </span>
                  </>
                );

                return isCurrent ? (
                  <span
                    key={link.id}
                    className="flex items-center gap-2 rounded-lg border border-brand bg-brand/10 px-2.5 py-1.5 text-brand-strong"
                  >
                    {body}
                    <span className="text-[10px] font-semibold uppercase tracking-wide">Here</span>
                  </span>
                ) : (
                  <Link
                    key={link.id}
                    to={`/pokemon/${link.id}`}
                    className="flex items-center gap-2 rounded-lg border border-hairline px-2.5 py-1.5 text-ink hover:border-brand hover:bg-plane"
                  >
                    {body}
                  </Link>
                );
              })}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
