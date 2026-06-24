/**
 * Applies a chosen credential source to a sandbox: file-based credentials are
 * uploaded (chmod 600), env-based credentials are returned so the caller can
 * inject them into the agent's dtach session environment (kept out of shell
 * history). The GitHub token is never handled here — it stays on the local
 * machine and is only ever passed per-call to the git toolbox.
 */
import type { Sandbox } from '@daytonaio/sdk';
import { writeHomeFile } from '../sandbox-ops.js';
import type { CredentialPayload } from './sources.js';

/** Applies a payload; returns any env var to inject into the session. */
export async function applyCredential(
  sandbox: Sandbox,
  payload: CredentialPayload,
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  if (payload.file) {
    await writeHomeFile(sandbox, payload.file.sandboxRelPath, payload.file.content, '600');
  }
  if (payload.env) {
    env[payload.env.name] = payload.env.value;
  }
  return env;
}
