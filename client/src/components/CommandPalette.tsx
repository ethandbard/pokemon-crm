import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toQueryString } from '../lib/api';
import { useApi, useDebounced } from '../lib/useApi';
import type { PokemonListResponse, TrainerListItem } from '../lib/types';
import { dexNumber } from '../lib/format';
import { useHotkey } from './Toast';

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: 'Pages' | 'Pokémon' | 'Trainers';
  icon?: string;
  spriteUrl?: string | null;
  to: string;
}

const PAGES: Command[] = [
  { id: 'page-home', label: 'Home', group: 'Pages', icon: '⌂', to: '/' },
  { id: 'page-lookup', label: 'Pokémon Lookup', group: 'Pages', icon: '⌕', to: '/lookup' },
  { id: 'page-trainers', label: 'Trainers', group: 'Pages', icon: '☰', to: '/trainers' },
  { id: 'page-dashboard', label: 'Performance Dashboard', group: 'Pages', icon: '▤', to: '/dashboard' },
  { id: 'page-notes', label: 'Notes', group: 'Pages', icon: '✎', to: '/notes' },
  { id: 'page-activity', label: 'Activity', group: 'Pages', icon: '⚡', to: '/activity' },
  { id: 'page-tableau', label: 'Tableau Dashboard', group: 'Pages', icon: '▦', to: '/tableau' },
];

const isPaletteHotkey = (event: KeyboardEvent) =>
  (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';

/**
 * Global jump-to search. ⌘K / Ctrl+K anywhere.
 *
 * Pages are matched locally; Pokémon and trainers come from the same search
 * endpoints the Lookup and Trainers pages use, so there's no second index to
 * keep in sync.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const navigate = useNavigate();

  useHotkey(isPaletteHotkey, () => setOpen((current) => !current));

  const debouncedQuery = useDebounced(query, 200);
  const trimmed = debouncedQuery.trim();

  // Null path = don't fetch. Pointing at a placeholder endpoint instead would
  // leave `data` holding the wrong shape between keystrokes.
  const pokemonPath = trimmed
    ? `/api/pokemon${toQueryString({ search: trimmed, pageSize: 6 })}`
    : null;
  const trainerPath = trimmed ? `/api/trainers${toQueryString({ search: trimmed })}` : null;

  const pokemonResults = useApi<PokemonListResponse>(pokemonPath);
  const trainerResults = useApi<{ data: TrainerListItem[] }>(trainerPath);

  const commands = useMemo<Command[]>(() => {
    const needle = trimmed.toLowerCase();

    const pages = PAGES.filter((page) => !needle || page.label.toLowerCase().includes(needle));

    if (!trimmed) return pages;

    const pokemonCommands: Command[] =
      pokemonResults.data?.data
        ? pokemonResults.data.data.slice(0, 6).map((row) => ({
            id: `pokemon-${row.id}`,
            label: row.displayName,
            hint: `${dexNumber(row.id)} · ${row.type1}${row.type2 ? `/${row.type2}` : ''}`,
            group: 'Pokémon',
            spriteUrl: row.spriteUrl,
            to: `/pokemon/${row.id}`,
          }))
        : [];

    const trainerCommands: Command[] =
      trainerResults.data?.data
        ? trainerResults.data.data.slice(0, 5).map((trainer) => ({
            id: `trainer-${trainer.id}`,
            label: trainer.name,
            hint: `${trainer.rosterSize} on roster${trainer.region ? ` · ${trainer.region}` : ''}`,
            group: 'Trainers',
            icon: '☰',
            to: `/trainers?trainerId=${trainer.id}`,
          }))
        : [];

    return [...pages, ...pokemonCommands, ...trainerCommands];
  }, [trimmed, pokemonResults.data, trainerResults.data]);

  // Reset the cursor whenever the result set changes, so Enter can't fire a
  // stale selection.
  useEffect(() => setActiveIndex(0), [commands.length, trimmed]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      setQuery('');
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function run(command: Command) {
    setOpen(false);
    navigate(command.to);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (commands.length ? (i + 1) % commands.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (commands.length ? (i - 1 + commands.length) % commands.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = commands[activeIndex];
      if (command) run(command);
    }
  }

  const loading = Boolean(trimmed) && (pokemonResults.loading || trainerResults.loading);
  let lastGroup: string | null = null;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        setOpen(false);
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) setOpen(false);
      }}
      // `m-auto` then pulled toward the top: a palette belongs under the
      // cursor's expectation, not centred vertically.
      className="m-auto mt-[12vh] w-[min(92vw,34rem)] rounded-xl border border-hairline bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/50"
    >
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
        <span aria-hidden="true" className="text-muted">
          ⌕
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search Pokémon, trainers, and pages…"
          aria-label="Command palette search"
          autoFocus
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        <kbd className="rounded border border-hairline px-1.5 py-0.5 text-[10px] text-muted">
          esc
        </kbd>
      </div>

      <ul ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
        {commands.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-muted">
            {loading ? 'Searching…' : `No matches for “${trimmed}”`}
          </li>
        ) : (
          commands.map((command, index) => {
            const showHeader = command.group !== lastGroup;
            lastGroup = command.group;
            return (
              <li key={command.id}>
                {showHeader && (
                  <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {command.group}
                  </p>
                )}
                <button
                  type="button"
                  data-index={index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => run(command)}
                  className={`flex w-full items-center gap-2.5 px-4 py-2 text-left ${
                    index === activeIndex ? 'bg-brand/10' : 'hover:bg-plane'
                  }`}
                >
                  {command.spriteUrl ? (
                    <img src={command.spriteUrl} alt="" width={24} height={24} className="h-6 w-6" />
                  ) : (
                    <span aria-hidden="true" className="w-6 text-center text-muted">
                      {command.icon ?? '·'}
                    </span>
                  )}
                  <span className="flex-1 truncate text-sm text-ink">{command.label}</span>
                  {command.hint && (
                    <span className="shrink-0 text-xs text-muted">{command.hint}</span>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="flex items-center gap-3 border-t border-hairline px-4 py-2 text-[11px] text-muted">
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span className="ml-auto">⌘K / Ctrl+K</span>
      </div>
    </dialog>
  );
}
