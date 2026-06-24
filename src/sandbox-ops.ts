/**
 * Convenience operations performed *inside* a running sandbox: resolving the
 * home directory, writing files with restrictive permissions, running commands,
 * and ensuring dtach is installed.
 */
import type { Sandbox } from '@daytonaio/sdk';
import { posix } from 'node:path';

const homeCache = new WeakMap<Sandbox, string>();

/** Resolves and caches the sandbox user's home directory. */
export async function sandboxHome(sandbox: Sandbox): Promise<string> {
  const cached = homeCache.get(sandbox);
  if (cached) return cached;
  const res = await sandbox.process.executeCommand('printf %s "$HOME"');
  const home = (res.result ?? '').trim() || '/home/daytona';
  homeCache.set(sandbox, home);
  return home;
}

/** Runs a command in the sandbox; throws with stderr/stdout if it fails. */
export async function run(
  sandbox: Sandbox,
  command: string,
  opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {},
): Promise<string> {
  const res = await sandbox.process.executeCommand(command, opts.cwd, opts.env, opts.timeout);
  if (typeof res.exitCode === 'number' && res.exitCode !== 0) {
    throw new Error(`command failed (exit ${res.exitCode}): ${command}\n${res.result ?? ''}`);
  }
  return res.result ?? '';
}

/**
 * Writes a file into the sandbox, relative to the user's home, creating its
 * parent directory and applying the given octal mode (default 600).
 */
export async function writeHomeFile(
  sandbox: Sandbox,
  relPath: string,
  content: string,
  mode = '600',
): Promise<void> {
  const home = await sandboxHome(sandbox);
  const abs = posix.join(home, relPath);
  const dir = posix.dirname(abs);
  await sandbox.fs.createFolder(dir, '700').catch(() => {
    /* already exists */
  });
  await sandbox.fs.uploadFile(Buffer.from(content, 'utf8'), abs);
  await sandbox.fs.setFilePermissions(abs, { mode });
}

/** Ensures `dtach` is installed in the sandbox (no fallback, as designed). */
export async function ensureDtach(sandbox: Sandbox): Promise<void> {
  const check = await sandbox.process.executeCommand('command -v dtach || true');
  if ((check.result ?? '').trim()) return;
  // Install non-interactively; works on the Debian-based background-agents image.
  await run(
    sandbox,
    'sudo apt-get update -qq && sudo apt-get install -y -qq dtach',
    { timeout: 180 },
  );
}
