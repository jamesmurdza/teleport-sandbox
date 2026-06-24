/**
 * Pure helpers for deriving the teleport working-branch name. Kept separate and
 * dependency-free so it is easy to unit test.
 */

/** Sanitises a branch component to a git-ref-safe slug. */
export function sanitiseRef(part: string): string {
  return (
    part
      .replace(/[^A-Za-z0-9._/-]+/g, '-') // illegal ref chars -> dash
      .replace(/\.\.+/g, '-') // no ".."
      .replace(/^[-./]+|[-./]+$/g, '') // trim leading/trailing separators
      .replace(/\/+/g, '/') || 'work'
  );
}

/**
 * The always-unique working branch teleport creates off the base branch.
 * Format: teleport/<base>/<sandbox-short-id>. The short-id suffix guarantees
 * that multiple agents launched from the same base branch never collide.
 */
export function teleportBranch(baseBranch: string, sandboxId: string): string {
  const base = sanitiseRef(baseBranch || 'main');
  const shortId = shortSandboxId(sandboxId);
  return `teleport/${base}/${shortId}`;
}

/** First 8 alphanumerics of the sandbox id, used as a unique branch suffix. */
export function shortSandboxId(sandboxId: string): string {
  return sandboxId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'sandbox';
}
