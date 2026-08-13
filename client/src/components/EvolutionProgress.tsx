import { Link } from 'react-router-dom';
import type { EvolutionLink } from '../lib/types';
import { slugLabel } from '../lib/format';

/**
 * What it takes to reach this stage.
 *
 * `evolutionCondition` is built by the seed from the full `evolution_details`
 * and already reads as a sentence ("Use a Thunder Stone", "Level up with high
 * friendship, at night"). It covers the roughly one third of the dex that has
 * no `evolutionMinLevel`, which previously showed a bare trigger slug or "—".
 * The level and trigger are fallbacks for rows seeded before that column landed.
 */
function requirementLabel(link: EvolutionLink): string {
  if (link.evolutionCondition) return link.evolutionCondition;
  if (link.evolutionMinLevel) return `Level ${link.evolutionMinLevel}`;
  return link.evolutionTrigger ? slugLabel(link.evolutionTrigger) : '—';
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
                      {/* Conditions can be a full clause ("Level up with high
                          friendship, during the night"), so it truncates and
                          the tooltip carries the rest rather than the chip
                          growing wide enough to break the row. */}
                      <span
                        className="block max-w-[14rem] truncate text-[11px] text-muted"
                        title={stage === 1 ? undefined : requirementLabel(link)}
                      >
                        {stage === 1 ? 'Base form' : requirementLabel(link)}
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
