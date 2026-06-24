/**
 * Interactive session lifecycle: runs the agent under dtach inside the sandbox
 * and attaches a local PTY that streams stdin/stdout, with the status bar on the
 * reserved bottom row. Detaching (Ctrl-\, handled by dtach in the sandbox) leaves
 * the agent running; the same function is used to reconnect later.
 */
import type { Sandbox } from '@daytonaio/sdk';
import { DTACH_SOCKET } from './config.js';
import { ensureDtach } from './sandbox-ops.js';
import { StatusBar } from './tui/statusbar.js';

export interface AttachOptions {
  /** Command to run under dtach when no live session exists (e.g. "claude"). */
  command: string;
  /** Working directory inside the sandbox. */
  cwd?: string;
  /** Env vars injected into the agent session (e.g. API keys). */
  env?: Record<string, string>;
  statusBar: StatusBar;
}

export type AttachOutcome = 'detached' | 'ended';

/**
 * dtach command line. If a live socket exists we attach to it (reconnect to the
 * running agent); otherwise we create a new session running the command. The
 * socket lives in /tmp, so after an auto-stop + restart it is gone and the agent
 * is relaunched fresh — exactly the desired "restart on reattach" behaviour.
 */
function dtachCommand(opts: AttachOptions, socketAlive: boolean): string {
  // -z: ignore suspend key, -r winch: redraw via SIGWINCH (best for full-screen TUIs).
  if (socketAlive) {
    return `dtach -a ${DTACH_SOCKET} -z -r winch`;
  }
  return `dtach -A ${DTACH_SOCKET} -z -r winch ${opts.command}`;
}

/** Attaches the local terminal to the sandbox session. Resolves on detach/exit. */
export async function attach(sandbox: Sandbox, opts: AttachOptions): Promise<AttachOutcome> {
  await ensureDtach(sandbox);

  const socketAlive = await sandbox.process
    .executeCommand(`test -S ${DTACH_SOCKET} && echo alive || true`)
    .then((r) => (r.result ?? '').includes('alive'))
    .catch(() => false);

  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;
  const agentRows = StatusBar.agentRows(rows);
  const sessionId = `teleport-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const pty = await sandbox.process.createPty({
    id: sessionId,
    cwd: opts.cwd,
    envs: opts.env,
    cols,
    rows: agentRows,
    onData: (data: Uint8Array) => {
      // Mark activity but do NOT paint here — painting mid-stream corrupts the
      // agent's escape sequences. The status bar paints only when output is idle.
      opts.statusBar.markData();
      process.stdout.write(Buffer.from(data));
    },
  });

  if (typeof (pty as { waitForConnection?: () => Promise<void> }).waitForConnection === 'function') {
    await pty.waitForConnection();
  }

  // Start (or attach to) the dtach session.
  await pty.sendInput(`${dtachCommand(opts, socketAlive)}\n`);

  // Wire up local terminal: raw mode + status bar + resize forwarding.
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw ?? false;
  if (stdin.setRawMode) stdin.setRawMode(true);
  stdin.resume();
  opts.statusBar.install();
  process.stdout.write('\x1b[?25h'); // ensure cursor visible

  const onStdin = (chunk: Buffer) => void pty.sendInput(chunk);
  const onResize = () => {
    const c = process.stdout.columns ?? 80;
    const r = StatusBar.agentRows(process.stdout.rows ?? 24);
    void pty.resize(c, r);
    opts.statusBar.onResize();
  };

  stdin.on('data', onStdin);
  process.stdout.on('resize', onResize);

  try {
    await pty.wait();
  } finally {
    stdin.off('data', onStdin);
    process.stdout.off('resize', onResize);
    if (stdin.setRawMode) stdin.setRawMode(wasRaw);
    stdin.pause();
    opts.statusBar.uninstall();
    await pty.disconnect().catch(() => {});
  }

  // Distinguish detach (dtach socket still present) from the agent exiting.
  const alive = await sandbox.process
    .executeCommand(`test -S ${DTACH_SOCKET} && echo alive || true`)
    .then((r) => (r.result ?? '').includes('alive'))
    .catch(() => false);

  return alive ? 'detached' : 'ended';
}
