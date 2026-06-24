import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StatusBar } from '../src/tui/statusbar.ts';

function fakeOut() {
  const chunks: string[] = [];
  return {
    chunks,
    rows: 24,
    columns: 80,
    write(s: string) {
      chunks.push(s);
      return true;
    },
    all() {
      return chunks.join('');
    },
  };
}

test('agentRows reserves exactly one row for the bar', () => {
  assert.equal(StatusBar.agentRows(24), 23);
  assert.equal(StatusBar.agentRows(1), 1); // never below 1
});

test('paint targets the bottom row and brackets with save/restore cursor', () => {
  const out = fakeOut();
  const bar = new StatusBar({ sandboxId: 'abcdef123456', status: 'running', agent: 'claude' }, { out });
  bar.install(); // forces a paint
  const s = out.all();
  // Saves cursor (ESC7), moves to row 24, and restores cursor (ESC8).
  assert.ok(s.includes('\x1b7'), 'saves cursor');
  assert.ok(s.includes('\x1b[24;1H'), 'moves to bottom row');
  assert.ok(s.includes('\x1b8'), 'restores cursor');
  // Reserves the region above the bar.
  assert.ok(s.includes('\x1b[1;23r'), 'sets scroll region to rows 1..23');
  // Mirrors status into the window title.
  assert.ok(s.includes('\x1b]2;teleport'), 'sets window title');
});

test('does NOT paint while output is still flowing (no mid-stream corruption)', () => {
  let clock = 1000;
  const out = fakeOut();
  const bar = new StatusBar(
    { sandboxId: 'abc', status: 'running', agent: 'claude' },
    { out, now: () => clock },
  );
  bar.install();
  out.chunks.length = 0; // ignore the install paint

  // Data just arrived; a tick immediately after must not paint.
  bar.markData();
  (bar as unknown as { tick(): void }).tick();
  assert.equal(out.chunks.length, 0, 'no paint during active output');

  // After the idle window elapses, it paints.
  clock += 200;
  (bar as unknown as { tick(): void }).tick();
  assert.ok(out.chunks.length > 0, 'paints once output is idle');

  bar.uninstall();
});
