import { fileURLToPath } from 'node:url';
import { configuration } from './config.js';
import { EventStore } from './store.js';
import { Controller } from './controller.js';
import { createExtractor } from './ollama.js';
import { createHttpServer } from './http.js';

async function main() {
  const config = configuration(process.env, process.argv.slice(2));
  const store = await new EventStore(config.dataDir).init();
  const controller = await new Controller(store, createExtractor(config)).init();
  const server = createHttpServer(controller, config);
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolve); });
  } catch (err) { await controller.close(); throw err; }
  console.log(`Controller: http://localhost:${config.port}`);
  console.log(`Phone: open the controller for the phone address and mission join code.`);
  console.log(`Data: ${config.dataDir}`);
  console.log(`Model: ${config.model}. The first report may take longer while Ollama loads it.`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true;
    server.close(); await controller.close(); server.closeAllConnections();
  };
  process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(err => { console.error(err.code === 'EADDRINUSE' ? 'Port is already in use. Stop the other controller or choose --port 3118.' : err.message); process.exitCode = 1; });
