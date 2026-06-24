import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitiseRef, teleportBranch, shortSandboxId } from '../src/naming.ts';

test('sanitiseRef strips illegal characters', () => {
  assert.equal(sanitiseRef('feature/Foo Bar'), 'feature/Foo-Bar');
  assert.equal(sanitiseRef('..weird..'), 'weird');
  assert.equal(sanitiseRef('/leading/'), 'leading');
  assert.equal(sanitiseRef(''), 'work');
});

test('teleportBranch is always unique per sandbox', () => {
  const a = teleportBranch('main', 'sandbox-abcdef123456');
  const b = teleportBranch('main', 'sandbox-zzzzzz999999');
  assert.match(a, /^teleport\/main\/[a-z0-9]+$/i);
  assert.notEqual(a, b, 'different sandboxes must yield different branches');
});

test('teleportBranch incorporates the base branch', () => {
  assert.match(teleportBranch('release/2.0', 'id123456'), /^teleport\/release\/2\.0\//);
});

test('shortSandboxId truncates to 8 chars', () => {
  assert.equal(shortSandboxId('abcdefghijklmnop'), 'abcdefgh');
});
