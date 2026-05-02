import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { buildRouter } from './api/routes.js';
import { globalBus } from './events/bus.js';
import { attachPersistence } from './db/persist.js';
import { getDb, markCrashed } from './db/store.js';

// Open DB and run schema migrations early.
getDb();
const crashed = markCrashed(Date.now());
if (crashed > 0) console.log(`[server] marked ${crashed} previously-running tournament(s) as crashed`);

attachPersistence(globalBus);

const app = express();
app.use(cors());
app.use(buildRouter());

app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port} (mockMode=${config.mockMode})`);
});
