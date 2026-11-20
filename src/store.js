import { mkdir, readFile, appendFile, open, truncate, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export class EventStore {
  constructor(dir) { this.dir = dir; this.events = []; this.tail = Promise.resolve(); }
  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    this.file = join(this.dir, 'events.jsonl');
    this.lockFile = join(this.dir, 'controller.lock');
    try { this.lock = await open(this.lockFile, 'wx', 0o600); }
    catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let pid;
      try { pid = Number(await readFile(this.lockFile, 'utf8')); } catch {}
      if (!Number.isInteger(pid) || pid < 1) throw new Error('Invalid controller.lock. Stop other controllers before removing this file.');
      try { process.kill(pid, 0); throw new Error('Another controller is using this data directory.'); }
      catch (check) { if (check.code !== 'ESRCH') throw check; }
      await unlink(this.lockFile);
      this.lock = await open(this.lockFile, 'wx', 0o600);
    }
    await this.lock.writeFile(String(process.pid));
    try {
      let data;
      try { data = await readFile(this.file); } catch (err) { if (err.code !== 'ENOENT') throw err; data = Buffer.alloc(0); }
      const end = data.lastIndexOf(10) + 1;
      this.events = data.subarray(0, end).toString('utf8').split('\n').filter(Boolean).map((line, i) => {
        try { const e = JSON.parse(line); if (!e.kind || !e.id || !Number.isFinite(e.ts)) throw new Error(); return e; }
        catch { throw new Error(`Invalid log entry on line ${i + 1}. Restore a backup of ${this.file}.`); }
      });
      if (data.length > end) await truncate(this.file, end);
      return this;
    } catch (err) { await this.close(); throw err; }
  }
  append(event) {
    const next = this.tail.then(async () => {
      await appendFile(this.file, `${JSON.stringify(event)}\n`, { mode: 0o600, flush: true });
      this.events.push(event);
      return event;
    });
    this.tail = next.catch(() => {});
    return next;
  }
  async close() {
    await this.tail;
    if (this.lock) { await this.lock.close(); this.lock = null; await unlink(this.lockFile); }
  }
}
