/**
 * High-level orchestration for starting a new session and reconnecting to an
 * existing one: ties together repo inspection, the credential modal, sandbox
 * creation, repo clone + teleport branch, auto-push, and the interactive attach.
 */
import { knownAgent, SANDBOX_REPO_PATH } from './config.js';
import {
  createSandbox,
  ensureStarted,
  getSession,
  tagBranch,
  type Session,
} from './daytona.js';
import { inspectLocalRepo } from './local-git.js';
import { discoverSources } from './auth/sources.js';
import { applyCredential } from './auth/importer.js';
import { resolveGitHubToken } from './git/auth.js';
import { setupRepo } from './git/repo.js';
import { AutoPush, type PushStatus } from './git/autopush.js';
import { attach } from './session.js';
import { StatusBar } from './tui/statusbar.js';
import { select, confirm } from './tui/prompt.js';

function log(msg: string): void {
  process.stdout.write(`teleport: ${msg}\n`);
}

export interface StartOptions {
  command: string;
  args: string[];
}

/** Full flow for `teleport <command>`. */
export async function startNew(opts: StartOptions): Promise<void> {
  const cwd = process.cwd();
  const repo = await inspectLocalRepo(cwd);
  const runCommand = [opts.command, ...opts.args].join(' ');

  const hasRepo = !!(repo && repo.originUrl);
  if (!hasRepo) {
    const ok = await confirm(
      'Not in a git repo (or no origin remote). Create a new blank sandbox with no repo?',
      false,
    );
    if (!ok) {
      log('cancelled.');
      return;
    }
  } else if (repo) {
    if (repo.dirty || repo.ahead > 0) {
      const bits = [
        repo.dirty ? 'uncommitted changes' : null,
        repo.ahead > 0 ? `${repo.ahead} unpushed commit(s)` : null,
      ]
        .filter(Boolean)
        .join(' and ');
      log(`warning: ${bits} won't be in the sandbox (it clones from origin).`);
    }
  }

  // Choose credentials (modal) up front; applied after the sandbox exists.
  const agent = knownAgent(opts.command);
  const sources = agent ? await discoverSources(agent) : [];
  let chosen: (typeof sources)[number] | null | undefined;
  if (sources.length > 0) {
    chosen = await select(`Import credentials for ${opts.command}?`, [
      ...sources.map((s) => ({ label: s.label, detail: s.detail, value: s })),
      { label: 'Neither — start without importing', detail: '', value: null },
    ]);
  }

  log(`creating sandbox on the background-agents snapshot…`);
  const sandbox = await createSandbox({
    command: runCommand,
    agent: opts.command,
    repoSlug: repo?.slug ?? null,
    baseBranch: repo?.branch ?? null,
  });
  log(`sandbox ${sandbox.id} created; starting…`);
  await ensureStarted(sandbox);

  // Apply credential choice now that we have a sandbox.
  let env: Record<string, string> = {};
  if (chosen) {
    env = await applyCredential(sandbox, chosen.payload);
    log(`imported ${opts.command} credentials.`);
  }

  // Clone repo + create teleport branch + start auto-push.
  let cwdInSandbox: string | undefined;
  let autopush: AutoPush | undefined;
  let branch = '';
  const bar = new StatusBar({
    sandboxId: sandbox.id,
    status: 'running',
    agent: opts.command,
    repo: repo?.slug ?? undefined,
  });

  if (hasRepo && repo) {
    const creds = await resolveGitHubToken();
    if (!creds) {
      log('warning: no GitHub token found — cloning may fail for private repos and auto-push is disabled.');
    }
    try {
      const setup = await setupRepo(sandbox, {
        originUrl: repo.originUrl!,
        baseBranch: repo.branch ?? 'main',
        creds: creds ?? { username: '', password: '', source: 'none' },
      });
      cwdInSandbox = setup.repoPath;
      branch = setup.branch;
      await tagBranch(sandbox, branch);
      bar.update({ branch });
      log(`cloned ${repo.slug} and checked out ${branch}.`);
      if (creds) {
        autopush = new AutoPush(sandbox, {
          repoPath: setup.repoPath,
          branch,
          creds,
          onStatus: (s, d) => bar.update({ push: pushLabel(s, d) }),
        });
        autopush.start();
      }
    } catch (err) {
      log(`warning: repo setup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await runInteractive(sandbox, runCommand, cwdInSandbox, env, bar, autopush);
}

/** Full flow for reconnecting to an existing session. */
export async function reconnect(session: Session): Promise<void> {
  log(`reconnecting to ${session.id} (${session.state})…`);
  await ensureStarted(session.sandbox);

  const bar = new StatusBar({
    sandboxId: session.id,
    status: 'running',
    agent: session.agent || session.command,
    repo: session.repo || undefined,
    branch: session.branch || undefined,
  });

  // Best-effort re-inject env-var credentials (files already persist on disk).
  let env: Record<string, string> = {};
  const agent = knownAgent(session.agent || session.command);
  if (agent) {
    const sources = await discoverSources(agent);
    const envSource = sources.find((s) => s.payload.env);
    if (envSource?.payload.env) env[envSource.payload.env.name] = envSource.payload.env.value;
  }

  let autopush: AutoPush | undefined;
  const cwdInSandbox = session.repo ? SANDBOX_REPO_PATH : undefined;
  if (session.repo && session.branch) {
    const creds = await resolveGitHubToken();
    if (creds) {
      autopush = new AutoPush(session.sandbox, {
        repoPath: SANDBOX_REPO_PATH,
        branch: session.branch,
        creds,
        onStatus: (s, d) => bar.update({ push: pushLabel(s, d) }),
      });
      autopush.start();
    }
  }

  await runInteractive(session.sandbox, session.command, cwdInSandbox, env, bar, autopush);
}

async function runInteractive(
  sandbox: import('@daytonaio/sdk').Sandbox,
  command: string,
  cwd: string | undefined,
  env: Record<string, string>,
  bar: StatusBar,
  autopush?: AutoPush,
): Promise<void> {
  const outcome = await attach(sandbox, { command, cwd, env, statusBar: bar });
  autopush?.stop();
  if (outcome === 'detached') {
    log(`detached. Reconnect with \`teleport\` (sandbox ${sandbox.id} keeps running, auto-stops when idle).`);
  } else {
    log(`session ended. Remove the sandbox with \`teleport rm ${sandbox.id}\`.`);
  }
}

function pushLabel(status: PushStatus, detail?: string): string {
  switch (status) {
    case 'pushing':
      return '…';
    case 'ok':
      return detail ? `✓ ${detail}` : '✓';
    case 'error':
      return '✗';
    default:
      return '';
  }
}
