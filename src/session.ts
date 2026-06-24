/**
 * Interactive session lifecycle. The agent runs inside a tmux session in the
 * sandbox; tmux draws the status bar natively. Locally we are a dumb PTY
 * passthrough: stdin -> sandbox, sandbox -> stdout, plus resize forwarding.
 *
 * tmux gives us persistence for free: detaching (Ctrl-\, bound to detach-client)
 * leaves the session running; reconnecting re-attaches the live agent. After an
 * auto-stop + restart the in-memory tmux server is gone, so `new-session -A`
 * recreates the session and relaunches the agent — the desired behaviour.
 */
import type { Sandbox } from '@daytonaio/sdk';
import { TMUX_CONF_PATH, TMUX_SESSION, TMUX_STATUS_FILE } from './config.js';
import { ensureTmux, writeFileAbs } from './sandbox-ops.js';
import { tmuxConf, type BarInfo } from './tui/tmux.js';

export interface AttachOptions {
  /** Command to run under tmux when the session does not already exist. */
  command: string;
  /** Working directory inside the sandbox. */
  cwd?: string;
  /** Env vars injected into the agent session (e.g. API keys). */
  env?: Record<string, string>;
  /** Static fields shown in the tmux status bar. */
  bar: BarInfo;
}

export type AttachOutcome = 'detached' | 'ended';

/** Single-quotes a string for safe use in a POSIX shell command. */
function shquote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Attaches the local terminal to the sandbox session. Resolves on detach/exit. */
export async function attach(sandbox: Sandbox, opts: AttachOptions): Promise<AttachOutcome> {
  await ensureTmux(sandbox);

  // Write the tmux config and initialise the live-status file.
  await writeFileAbs(sandbox, TMUX_CONF_PATH, tmuxConf(opts.bar), '644');
  await sandbox.process.executeCommand(`: > ${TMUX_STATUS_FILE}`).catch(() => {});

  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;
  const sessionId = `teleport-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const pty = await sandbox.process.createPty({
    id: sessionId,
    cwd: opts.cwd,
    envs: opts.env,
    cols,
    rows,
    onData: (data: Uint8Array) => {
      process.stdout.write(Buffer.from(data));
    },
  });

  if (typeof (pty as { waitForConnection?: () => Promise<void> }).waitForConnection === 'function') {
    await pty.waitForConnection();
  }

  // exec so that when tmux detaches/exits the PTY closes and pty.wait() resolves.
  const cwdArg = opts.cwd ? `-c ${shquote(opts.cwd)}` : '';
  const cmd =
    `exec tmux -f ${TMUX_CONF_PATH} new-session -A -s ${TMUX_SESSION} ${cwdArg} ` +
    `${shquote(opts.command)}\n`;
  await pty.sendInput(cmd);

  // Local terminal: raw passthrough + resize forwarding.
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw ?? false;
  if (stdin.setRawMode) stdin.setRawMode(true);
  stdin.resume();

  const onStdin = (chunk: Buffer) => void pty.sendInput(chunk);
  const onResize = () => {
    void pty.resize(process.stdout.columns ?? 80, process.stdout.rows ?? 24);
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
    process.stdout.write('\x1b[?25h'); // ensure cursor visible
    await pty.disconnect().catch(() => {});
  }

  // Detached if the tmux session still exists; otherwise the agent ended.
  const alive = await sandbox.process
    .executeCommand(`tmux has-session -t ${TMUX_SESSION} 2>/dev/null && echo alive || true`)
    .then((r) => (r.result ?? '').includes('alive'))
    .catch(() => false);

  return alive ? 'detached' : 'ended';
}

/** Updates the live status text shown on the right of the tmux status bar. */
export async function setLiveStatus(sandbox: Sandbox, text: string): Promise<void> {
  const safe = text.replace(/'/g, `'\\''`);
  await sandbox.process.executeCommand(`printf '%s' '${safe}' > ${TMUX_STATUS_FILE}`).catch(() => {});
}
