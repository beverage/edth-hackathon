import { INTENT_SCHEMA, sanitizeIntent, systemPrompt } from './intent.js';

export function createExtractor({ ollamaUrl = 'http://127.0.0.1:11434', model = 'ministral-3:3b', fetchImpl = fetch, timeoutMs = 60000 } = {}) {
  const base = ollamaUrl.replace(/\/+$/, '');
  return {
    async health() {
      try {
        const res = await fetchImpl(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) throw new Error('Ollama did not answer.');
        const data = await res.json();
        const available = (data.models ?? []).some(m => m.name === model || m.model === model);
        return { connected: true, available, model, message: available ? 'Ready for reports' : `Download the model: ollama pull ${model}` };
      } catch {
        return { connected: false, available: false, model, message: `Cannot reach Ollama at ${base}. Start ollama serve.` };
      }
    },
    async extract(text, { place, language, signal } = {}) {
      let res;
      try {
        res = await fetchImpl(`${base}/api/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, stream: false, format: INTENT_SCHEMA, keep_alive: '5m',
            messages: [{ role: 'system', content: systemPrompt(place) }, { role: 'user', content: text }],
            options: { temperature: 0, num_ctx: 4096, num_predict: 300 } }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (err.name === 'TimeoutError') throw new Error('Ollama took too long. Try the report again after the model loads.');
        if (signal?.aborted) throw new Error('Controller stopped during processing. Send the report again.');
        throw new Error(`Cannot reach Ollama at ${base}. Start ollama serve, then retry.`);
      }
      if (res.status === 404) throw new Error(`Model missing. Run: ollama pull ${model}`);
      if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}. Check its terminal and retry.`);
      const data = await res.json();
      let raw;
      try { raw = JSON.parse(data.message?.content); } catch { throw new Error('The model returned an unreadable answer. Please retry.'); }
      if (!raw || !['position', 'movement', 'other'].includes(raw.kind)) throw new Error('The model did not return a location report. Please retry.');
      const intent = sanitizeIntent(raw, language, text);
      return { ...intent, language: language ?? intent.language };
    },
  };
}
