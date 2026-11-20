import { resolve } from 'node:path';

export function configuration(env = process.env, args = []) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--host', '--port', '--data-dir'].includes(args[i]) || !args[i + 1]) {
      throw new Error('Usage: npm start -- [--host 0.0.0.0] [--port 3117] [--data-dir PATH]');
    }
    options[args[i].slice(2)] = args[i + 1];
  }
  const port = Number(options.port ?? env.PORT ?? 3117);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const ollamaUrl = new URL(env.OLLAMA_URL || 'http://127.0.0.1:11434');
  if (!['http:', 'https:'].includes(ollamaUrl.protocol) || ollamaUrl.username || ollamaUrl.password) throw new Error('OLLAMA_URL must be an HTTP URL without credentials.');
  return {
    host: options.host ?? env.HOST ?? '0.0.0.0', port,
    dataDir: resolve(options['data-dir'] ?? env.DATA_DIR ?? '.data/lightweight'),
    ollamaUrl: ollamaUrl.href.replace(/\/$/, ''),
    model: env.LOCAL_EXTRACT_MODEL || 'ministral-3:3b',
  };
}
