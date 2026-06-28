import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitiseRef, sbxBranch, shortSandboxId, sandboxName, slugifyName } from '../src/naming.ts';

test('slugifyName produces DNS-style components', () => {
  assert.equal(slugifyName('My Repo'), 'my-repo');
  assert.equal(slugifyName('owner/Repo_Name'), 'owner-repo-name');
  assert.equal(slugifyName('  '), '');
});

test('sandboxName combines prefix, slug, and suffix', () => {
  assert.equal(sandboxName('sbx', 'myrepo', 'abc123'), 'sbx-myrepo-abc123');
  // Empty slug is dropped; custom prefix honoured.
  assert.equal(sandboxName('tp', null, 'abc'), 'tp-abc');
  // Falls back to "sbx" if the prefix slugifies to empty.
  assert.match(sandboxName('', 'r', 's'), /^sbx-r-s$/);
});

test('sanitiseRef strips illegal characters', () => {
  assert.equal(sanitiseRef('feature/Foo Bar'), 'feature/Foo-Bar');
  assert.equal(sanitiseRef('..weird..'), 'weird');
  assert.equal(sanitiseRef('/leading/'), 'leading');
  assert.equal(sanitiseRef(''), 'work');
});

test('sbxBranch is always unique per sandbox', () => {
  const a = sbxBranch('main', 'sandbox-abcdef123456');
  const b = sbxBranch('main', 'sandbox-zzzzzz999999');
  assert.match(a, /^sbx\/main\/[a-z0-9]+$/i);
  assert.notEqual(a, b, 'different sandboxes must yield different branches');
});

test('sbxBranch incorporates the base branch', () => {
  assert.match(sbxBranch('release/2.0', 'id123456'), /^sbx\/release\/2\.0\//);
});

test('shortSandboxId truncates to 8 chars', () => {
  assert.equal(shortSandboxId('abcdefghijklmnop'), 'abcdefgh');
});
