/**
 * Static configuration: the base snapshot, per-agent definitions, and session
 * conventions shared across the codebase.
 */

/**
 * The Daytona snapshot every sandbox is created from. "background-agents" is a
 * custom snapshot in your Daytona org; override with TELEPORT_SNAPSHOT if yours
 * is named differently.
 */
export const BASE_SNAPSHOT = process.env.TELEPORT_SNAPSHOT ?? 'background-agents';

/** Prefix applied to the name of every sandbox teleport creates. */
export const SANDBOX_PREFIX = process.env.TELEPORT_PREFIX ?? 'teleport';

/**
 * Minutes of inactivity after which a sandbox auto-stops (0 disables). Sandboxes
 * restart on reconnect, so idle ones don't sit running. Override with
 * TELEPORT_AUTOSTOP.
 */
export const AUTOSTOP_MINUTES = Number(process.env.TELEPORT_AUTOSTOP ?? 30) || 0;

/** Absolute path inside the sandbox where the repo is cloned. */
export const SANDBOX_REPO_PATH = '/home/daytona/repo';

/**
 * Stable id of the persistent Daytona PTY session that runs the agent. Reusing a
 * fixed id per sandbox is what lets teleport reconnect to the *same* running
 * agent after a detach — Daytona keeps the PTY process alive server-side, so no
 * in-sandbox multiplexer (tmux) is needed for persistence.
 */
export const PTY_SESSION_ID = 'teleport-agent';

/** Labels used to tag and rediscover teleport sandboxes. */
export const LABELS = {
  managed: 'teleport',
  command: 'teleport.command',
  repo: 'teleport.repo',
  branch: 'teleport.branch',
  base: 'teleport.base',
  agent: 'teleport.agent',
  created: 'teleport.created',
} as const;

/** A credential source that can be imported into the sandbox for an agent. */
export interface CredentialSource {
  /** Stable key, e.g. "env" | "keychain" | "file". */
  kind: 'env' | 'keychain' | 'file';
  /** Human label shown in the modal. */
  label: string;
  /** Short description of where it comes from. */
  detail: string;
}

/** Definition of a known agent teleport can launch and import credentials for. */
export interface AgentDef {
  /** Command name as typed, e.g. "claude". */
  name: string;
  /** Command executed inside the sandbox to start the agent. */
  startCommand: string;
  /** Env var that, if set locally, holds an API key for this agent. */
  apiKeyEnv?: string;
  /** macOS keychain service name, if the agent stores creds there. */
  keychainService?: string;
  /** Local credential file (relative to home) to copy into the sandbox. */
  localCredFile?: string;
  /** Destination path inside the sandbox for the credential file. */
  sandboxCredFile?: string;
  /**
   * Additional non-secret config files copied alongside file/keychain creds so
   * the agent recognises the imported login (e.g. Claude's ~/.claude.json, which
   * holds the account + onboarding state). Skipped for API-key (env) imports.
   */
  companionFiles?: { local: string; sandbox: string }[];
  /** Static environment variables injected into the agent's session. */
  env?: Record<string, string>;
}

export const AGENTS: Record<string, AgentDef> = {
  claude: {
    name: 'claude',
    startCommand: 'claude',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    keychainService: 'Claude Code-credentials',
    localCredFile: '.claude/.credentials.json',
    sandboxCredFile: '.claude/.credentials.json',
    // ~/.claude.json (account + onboarding + trust/bypass acceptance) is written
    // by prepareClaudeConfig() — merged locally and uploaded, so it does not
    // depend on a node runtime existing in the sandbox.
    // Start Claude in fullscreen (no-flicker) mode.
    env: { CLAUDE_CODE_NO_FLICKER: '1' },
  },
  codex: {
    name: 'codex',
    startCommand: 'codex',
    apiKeyEnv: 'OPENAI_API_KEY',
    localCredFile: '.codex/auth.json',
    sandboxCredFile: '.codex/auth.json',
  },
  gemini: {
    name: 'gemini',
    startCommand: 'gemini',
    apiKeyEnv: 'GEMINI_API_KEY',
    // Gemini CLI caches its OAuth token + settings under ~/.gemini.
    localCredFile: '.gemini/oauth_creds.json',
    sandboxCredFile: '.gemini/oauth_creds.json',
    companionFiles: [{ local: '.gemini/settings.json', sandbox: '.gemini/settings.json' }],
  },
  copilot: {
    name: 'copilot',
    startCommand: 'copilot',
    apiKeyEnv: 'COPILOT_GITHUB_TOKEN',
  },
  opencode: {
    name: 'opencode',
    startCommand: 'opencode',
    localCredFile: '.local/share/opencode/auth.json',
    sandboxCredFile: '.local/share/opencode/auth.json',
  },
  kimi: {
    name: 'kimi',
    startCommand: 'kimi',
    apiKeyEnv: 'KIMI_API_KEY',
  },
  kilo: {
    name: 'kilo',
    startCommand: 'kilo',
    // Kilo manages its own auth in the sandbox; no single API-key env var.
  },
  goose: {
    name: 'goose',
    startCommand: 'goose',
    // Goose stores provider config under ~/.config/goose and uses its own keyring.
  },
  pi: {
    name: 'pi',
    startCommand: 'pi',
  },
};

/** Command names of every known agent, in display order. */
export const KNOWN_AGENTS = Object.keys(AGENTS);

/** Returns the known-agent definition for a command, if any. */
export function knownAgent(command: string): AgentDef | undefined {
  return AGENTS[command];
}

/**
 * Per-agent flag that skips permission/approval prompts ("yolo"/dangerous mode),
 * applied when teleport is run with --yolo. Only agents with a known flag are
 * listed; others are left untouched.
 */
export const YOLO_FLAGS: Record<string, string> = {
  claude: '--dangerously-skip-permissions',
  codex: '--yolo',
  copilot: '--autopilot',
  gemini: '--yolo',
  kilo: '--auto',
};

/** Returns the yolo/dangerous flag for a command, if one is known. */
export function yoloFlagFor(command: string): string | undefined {
  return YOLO_FLAGS[command];
}
