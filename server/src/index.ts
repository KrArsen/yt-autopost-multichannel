import { createApp } from './app.js';
import { config } from './config.js';
import { startBackgroundWorker, stopBackgroundWorker } from './worker.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`YT AutoPost Studio server listening on http://localhost:${config.port}`);
  startBackgroundWorker();
});

function shutdown(): void {
  stopBackgroundWorker();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
