/**
 * Pure command-line parser. Kept side-effect free so it can be unit tested.
 *
 *   teleport                 -> list/reconnect picker
 *   teleport <cmd> [args...] -> create-or-reconnect and run <cmd>
 *   teleport ls              -> non-interactive session list
 *   teleport stop <id>       -> stop a sandbox
 *   teleport rm <id>         -> delete a sandbox
 *   teleport push [<id>]     -> push pending commits now
 *   teleport doctor          -> preflight diagnostics
 *   teleport help            -> usage
 */

export type Command =
  | { type: 'list' }
  | { type: 'ls' }
  | { type: 'doctor' }
  | { type: 'help' }
  | { type: 'stop'; id: string }
  | { type: 'rm'; id: string }
  | { type: 'push'; id?: string }
  | { type: 'run'; command: string; args: string[] };

export type ParseResult = Command | { type: 'error'; message: string };

const RESERVED = new Set(['ls', 'stop', 'rm', 'push', 'doctor', 'help']);

export function parseArgs(argv: string[]): ParseResult {
  const [first, ...rest] = argv;

  if (first === undefined) return { type: 'list' };
  if (first === '--help' || first === '-h' || first === 'help') return { type: 'help' };
  if (first === 'ls') return { type: 'ls' };
  if (first === 'doctor') return { type: 'doctor' };

  if (first === 'stop' || first === 'rm') {
    const id = rest[0];
    if (!id) return { type: 'error', message: `\`teleport ${first}\` requires a sandbox id.` };
    return { type: first, id };
  }

  if (first === 'push') {
    return { type: 'push', id: rest[0] };
  }

  // Anything else is a command to run inside a sandbox.
  if (RESERVED.has(first)) {
    // Defensive: should be handled above.
    return { type: 'error', message: `Unhandled subcommand: ${first}` };
  }
  return { type: 'run', command: first, args: rest };
}

export const USAGE = `teleport — run an AI agent in a fresh Daytona sandbox

Usage:
  teleport <command> [args...]   Create (or reconnect to) a sandbox and run <command>
  teleport                       List open sessions and reconnect
  teleport ls                    List open sessions (non-interactive)
  teleport stop <id>             Stop a sandbox
  teleport rm <id>               Delete a sandbox
  teleport push [<id>]           Push pending commits for a session now
  teleport doctor                Run preflight diagnostics
  teleport help                  Show this help

Environment:
  DAYTONA_API_KEY                Required. Daytona API key.
  TELEPORT_SNAPSHOT              Base snapshot (default: background-agents).
  GH_TOKEN / GITHUB_TOKEN        GitHub token for auto-push (else uses \`gh auth token\`).
`;
