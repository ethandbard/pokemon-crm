/**
 * Imports which TM, HM or TR teaches each move.
 *
 *   npm run seed:machines
 *
 * ~2,400 requests — the most expensive pass after the dex itself, which is why
 * `SEED_MACHINES=false` skips it. One request per (move, version group), because
 * that is the grain of the answer: **TMs are renumbered every generation**, so
 * Facade is TM42 in one era and TM109 in another.
 *
 * Sourced from the `/machine` index rather than each move's `machines` array.
 * Both cost the same number of requests to resolve, but the index is a **single**
 * extra call and needs no `/move` fetches at all — so this runs standalone
 * against an already-seeded database without re-importing 900 moves to reach
 * data that is one list away.
 *
 * Requires `moves` to be populated: a machine whose move is not in the database
 * has no row to hang off, and is skipped rather than failing the run.
 *
 * Safe to re-run: rows are deleted and reinserted per move.
 */
import { inArray } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { moveMachines, moves, type NewMoveMachine } from '../db/schema.js';
import { env } from '../env.js';
import { POKEAPI, fetchJson, mapWithConcurrency, type NamedRef } from './pokeapi.js';

/** `/machine/{id}` — the only place a TM's item identity is recorded. */
interface MachineResponse {
  id: number;
  item: NamedRef | null;
  move: NamedRef | null;
  version_group: NamedRef | null;
}

interface MachineIndex {
  count: number;
  results: { url: string }[];
}

interface VersionGroupResponse {
  name: string;
  order: number | null;
}

/**
 * Version group name → chronological order.
 *
 * **Ids are not chronological** — PokeAPI added the Japanese Gen-1 re-releases
 * late, so `blue-japan` is id 29 with order 2. Ranking by id would date a
 * Gen-1 TM to 1996's position in the list rather than its own. The same trap is
 * documented for `pokemon_moves` in CLAUDE.md.
 *
 * Duplicated from `seed.ts` rather than imported: importing that module runs a
 * full dex seed as a side effect (see the header of `pokeapi.ts`). ~34 requests.
 */
async function fetchVersionGroupOrder(): Promise<Map<string, number>> {
  const order = new Map<string, number>();
  const index = await fetchJson<{ results: NamedRef[] }>(`${POKEAPI}/version-group?limit=200`);

  await mapWithConcurrency(index.results, env.seedConcurrency, async (ref) => {
    try {
      const group = await fetchJson<VersionGroupResponse>(ref.url);
      order.set(group.name, group.order ?? 0);
    } catch (err) {
      console.warn(`[seed] version group ${ref.name} failed: ${String(err)}`);
    }
    return null;
  });

  return order;
}

/**
 * Best-effort, like the abilities import rather than the type chart. A missing
 * machine means one move shows no TM number — which is what every move showed
 * before this table existed — not a plausible-looking wrong answer.
 */
export async function seedMachines(): Promise<void> {
  const known = await db.select({ id: moves.id, name: moves.name }).from(moves);
  if (known.length === 0) {
    console.log('[seed] no moves in the database — skipping machines. Run `npm run seed` first.');
    return;
  }
  const idByName = new Map(known.map((row) => [row.name, row.id]));

  const [index, versionOrder] = await Promise.all([
    fetchJson<MachineIndex>(`${POKEAPI}/machine?limit=10000`),
    fetchVersionGroupOrder(),
  ]);

  console.log(`[seed] resolving ${index.results.length} machines…`);

  const rows: NewMoveMachine[] = [];
  let unknownMove = 0;
  let failed = 0;
  let done = 0;

  await mapWithConcurrency(index.results, env.seedConcurrency, async (ref) => {
    try {
      const machine = await fetchJson<MachineResponse>(ref.url);
      const slug = machine.item?.name;
      const moveName = machine.move?.name;
      const group = machine.version_group?.name;

      if (!slug || !moveName || !group) return null;

      const moveId = idByName.get(moveName);
      // A move outside this seed's range — expected under SEED_LIMIT, and the
      // foreign key would reject it anyway.
      if (moveId === undefined) {
        unknownMove += 1;
        return null;
      }

      rows.push({
        moveId,
        versionGroup: group,
        // `-1` for an unknown group, matching `pickMoveEntries` in seed.ts: a
        // known date must always outrank an unknown one when picking the latest.
        versionGroupOrder: versionOrder.get(group) ?? -1,
        tmNumber: slug.toUpperCase(),
        itemSlug: slug,
      });
    } catch (err) {
      failed += 1;
      if (failed <= 5) console.warn(`[seed] machine ${ref.url} failed: ${String(err)}`);
    } finally {
      done += 1;
      if (done % 500 === 0) console.log(`[seed]   …${done}/${index.results.length} machines`);
    }
    return null;
  });

  // Delete-then-insert per move, matching `pokemon_moves`: a machine dropped in
  // a later game never conflicts, so an upsert would leave it behind forever.
  const touched = [...new Set(rows.map((row) => row.moveId))];
  const CHUNK = 200;
  for (let i = 0; i < touched.length; i += CHUNK) {
    await db.delete(moveMachines).where(inArray(moveMachines.moveId, touched.slice(i, i + CHUNK)));
  }

  const INSERT_CHUNK = 1000;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db.insert(moveMachines).values(rows.slice(i, i + INSERT_CHUNK)).onConflictDoNothing();
  }

  console.log(`[seed] wrote ${rows.length} machine rows across ${touched.length} moves.`);
  if (unknownMove) {
    console.log(`[seed] ${unknownMove} machines skipped — their move is not seeded.`);
  }
  if (failed) console.warn(`[seed] ${failed} machines failed and were skipped.`);
}

/** Only runs the pool teardown when invoked directly, not as a pass of `seed`. */
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('seed-machines.ts');

if (invokedDirectly) {
  seedMachines()
    .catch((err) => {
      console.error('[seed:machines] failed', err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
