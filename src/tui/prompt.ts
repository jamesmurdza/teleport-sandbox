/**
 * Simple, dependency-free terminal prompts used for the pre-launch credential
 * modal, the blank-sandbox confirmation, and the session picker. They use a
 * line-based readline interface (type a number / y-n) which is robust across
 * terminals and CI, rather than raw-mode arrow-key navigation.
 */
import { createInterface } from 'node:readline';

export interface Choice<T> {
  label: string;
  detail?: string;
  value: T;
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Presents a numbered list and returns the chosen value (or null if cancelled). */
export async function select<T>(title: string, choices: Choice<T>[]): Promise<T | null> {
  if (choices.length === 0) return null;
  process.stdout.write(`\n${title}\n`);
  choices.forEach((c, i) => {
    const detail = c.detail ? `  — ${c.detail}` : '';
    process.stdout.write(`  ${i + 1}) ${c.label}${detail}\n`);
  });
  while (true) {
    const answer = (await ask(`Choose 1-${choices.length} (or q to cancel): `)).trim().toLowerCase();
    if (answer === 'q' || answer === '') return null;
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
      return choices[n - 1].value;
    }
    process.stdout.write('Invalid choice.\n');
  }
}

/** Yes/No confirmation. `defaultYes` controls the answer for an empty input. */
export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = (await ask(`${question} [${hint}] `)).trim().toLowerCase();
  if (answer === '') return defaultYes;
  return answer === 'y' || answer === 'yes';
}
