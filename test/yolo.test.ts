import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yoloFlagFor, knownAgent, KNOWN_AGENTS } from '../src/config.ts';

test('known agents map to their permission-skip flag', () => {
  assert.equal(yoloFlagFor('claude'), '--dangerously-skip-permissions');
  assert.equal(yoloFlagFor('codex'), '--yolo');
  assert.equal(yoloFlagFor('gemini'), '--yolo');
  assert.equal(yoloFlagFor('copilot'), '--autopilot');
  assert.equal(yoloFlagFor('kilo'), '--auto');
});

test('agents without a permission-skip flag return undefined', () => {
  // Auto-approve in interactive mode (no flag needed) or none available.
  for (const a of ['goose', 'kimi', 'opencode', 'pi', 'somethingelse']) {
    assert.equal(yoloFlagFor(a), undefined);
  }
});

test('all preinstalled agents are recognised', () => {
  for (const a of ['claude', 'codex', 'gemini', 'copilot', 'opencode', 'kimi', 'kilo', 'goose', 'pi']) {
    assert.ok(knownAgent(a), `expected ${a} to be a known agent`);
    assert.ok(KNOWN_AGENTS.includes(a));
  }
});

test('known agents expose their credential env var where applicable', () => {
  assert.equal(knownAgent('gemini')?.apiKeyEnv, 'GEMINI_API_KEY');
  assert.equal(knownAgent('copilot')?.apiKeyEnv, 'COPILOT_GITHUB_TOKEN');
  assert.equal(knownAgent('kimi')?.apiKeyEnv, 'KIMI_API_KEY');
});
