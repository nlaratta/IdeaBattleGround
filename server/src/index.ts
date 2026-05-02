import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { buildRouter } from './api/routes.js';

const app = express();
app.use(cors());
app.use(buildRouter());

app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port} (mockMode=${config.mockMode})`);
});
