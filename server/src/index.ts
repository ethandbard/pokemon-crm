import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { env } from './env.js';
import { db, pool } from './db/client.js';
import { errorHandler, asyncHandler } from './http.js';
import { pokemonRouter } from './routes/pokemon.js';
import { movesRouter } from './routes/moves.js';
import { notesRouter } from './routes/notes.js';
import { activityRouter } from './routes/activity.js';
import { statsRouter } from './routes/stats.js';
import { trainersRouter } from './routes/trainers.js';
import { rosterRouter } from './routes/roster.js';
import { attentionRouter } from './routes/attention.js';
import { usersRouter } from './routes/users.js';
import { naturesRouter } from './routes/natures.js';
import { adminRouter } from './routes/admin.js';

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get(
  '/api/health',
  asyncHandler(async (_req, res) => {
    await db.execute(sql`select 1`);
    res.json({ status: 'ok', time: new Date().toISOString() });
  }),
);

app.use('/api/pokemon', pokemonRouter);
app.use('/api/moves', movesRouter);
app.use('/api/notes', notesRouter);
app.use('/api/activity', activityRouter);
app.use('/api/stats', statsRouter);
app.use('/api/trainers', trainersRouter);
app.use('/api/roster', rosterRouter);
app.use('/api/attention', attentionRouter);
app.use('/api/users', usersRouter);
app.use('/api/natures', naturesRouter);
app.use('/api/admin', adminRouter);

// In production the client is built into ../client/dist relative to this
// file's compiled location (server/dist/index.js). Serving it here keeps
// the app to a single container with no separate reverse proxy.
if (process.env.NODE_ENV === 'production') {
  const here = dirname(fileURLToPath(import.meta.url));
  const clientDist = resolve(here, '../../client/dist');
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(resolve(clientDist, 'index.html'));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
}
