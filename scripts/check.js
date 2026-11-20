import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
async function walk(dir) {
  const entries = await readdir(new URL(dir, root), { withFileTypes: true });
  for (const e of entries) {
    const name = `${dir}${e.name}`;
    if (e.isDirectory()) await walk(`${name}/`);
    else if (e.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(name, root))], { encoding: 'utf8' });
      if (result.status !== 0) { process.stderr.write(result.stderr || `Cannot check ${name}\n`); process.exitCode = 1; }
    }
  }
}
for (const dir of ['src/', 'web/', 'scripts/', 'tests/']) await walk(dir);
if (!process.exitCode) console.log('All JavaScript files passed syntax validation. No compilation or asset downloads are needed.');
