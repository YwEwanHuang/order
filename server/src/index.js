// server/src/index.js
const express = require('express');
const apiRouter = require('./routes');
const openid = require('./middleware/openid');
const { ensureSchema } = require('./db/pool');

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(openid);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/v1', apiRouter);

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'internal_error' });
});

const port = Number(process.env.PORT) || 80;
ensureSchema()
  .then(() => {
    app.listen(port, () => console.log(`[server] listening on ${port}`));
  })
  .catch((err) => {
    console.error('[fatal] ensureSchema failed', err);
    process.exit(1);
  });
