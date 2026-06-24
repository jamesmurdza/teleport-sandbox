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

/** Absolute path inside the sandbox where the repo is cloned. */
export const SANDBOX_REPO_PATH = '/home/daytona/repo';

/** tmux session name that persists the agent across reconnects. */
export const TMUX_SESSION = 'teleport';
/** Path to the generated tmux config inside the sandbox. */
export const TMUX_CONF_PATH = '/tmp/teleport.tmux';
/** File the tmux status line reads for live (push) status. */
export const TMUX_STATUS_FILE = '/tmp/teleport-status';

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
}

export const AGENTS: Record<string, AgentDef> = {
  claude: {
    name: 'claude',
    startCommand: 'claude',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    keychainService: 'Claude Code-credentials',
    localCredFile: '.claude/.credentials.json',
    sandboxCredFile: '.claude/.credentials.json',
    // ~/.claude.json holds the account + onboarding state; without it Claude
    // re-runs onboarding and ignores the imported token.
    companionFiles: [{ local: '.claude.json', sandbox: '.claude.json' }],
  },
  codex: {
    name: 'codex',
    startCommand: 'codex',
    apiKeyEnv: 'OPENAI_API_KEY',
    localCredFile: '.codex/auth.json',
    sandboxCredFile: '.codex/auth.json',
  },
  opencode: {
    name: 'opencode',
    startCommand: 'opencode',
    localCredFile: '.local/share/opencode/auth.json',
    sandboxCredFile: '.local/share/opencode/auth.json',
  },
};

/** Returns the known-agent definition for a command, if any. */
export function knownAgent(command: string): AgentDef | undefined {
  return AGENTS[command];
}
