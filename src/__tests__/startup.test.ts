import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_INDEX = resolve(__dirname, '../../dist/index.js');

function runProcess(env: Record<string, string>, timeoutMs = 3000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [DIST_INDEX], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: -1, stderr }); // -1 = killed (process was running = started OK)
    }, timeoutMs);

    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 0, stderr });
    });

    child.on('error', reject);
  });
}

describe('suno-mcp startup', () => {
  it('exits with code 1 when SUNO_API_KEY is not set', async () => {
    const { code, stderr } = await runProcess({ SUNO_API_KEY: '' });
    expect(code).toBe(1);
    expect(stderr).toContain('SUNO_API_KEY');
  }, 10000);

  it('logs SunoBoard mode for sb_ keys', async () => {
    // Process will start, fail the credits call (fake key), log warning, then block on stdio
    // We kill it after 2s and check what it logged before the HTTP call fails
    const { stderr } = await runProcess({ SUNO_API_KEY: 'sb_fakekey123' }, 2000);
    expect(stderr).toContain('SunoBoard API');
  }, 10000);

  it('logs BYOK mode for non-sb_ keys', async () => {
    const { stderr } = await runProcess({ SUNO_API_KEY: 'e57efd1b3c4a2f8d' }, 2000);
    expect(stderr).toContain('sunoapi.org directly');
  }, 10000);
});
