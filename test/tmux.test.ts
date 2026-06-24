import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmuxConf, writeStatusCommand } from '../src/tui/tmux.ts';

test('tmuxConf enables a bottom status bar with our fields', () => {
  const conf = tmuxConf({ shortId: 'abcd1234', agent: 'claude', repo: 'o/r', branch: 'teleport/main/abcd1234' });
  assert.match(conf, /set -g status on/);
  assert.match(conf, /status-position bottom/);
  assert.ok(conf.includes('abcd1234'), 'includes sandbox short id');
  assert.ok(conf.includes('claude'), 'includes agent');
  assert.ok(conf.includes('teleport/main/abcd1234'), 'includes branch');
  assert.match(conf, /cat \/tmp\/teleport-status/, 'reads live status file');
});

test('tmuxConf binds Ctrl-\\ to detach', () => {
  const conf = tmuxConf({ shortId: 'x', agent: 'claude' });
  assert.match(conf, /bind-key -n C-\\\\ detach-client/);
});

test('writeStatusCommand escapes single quotes safely', () => {
  const cmd = writeStatusCommand("it's ok");
  assert.ok(cmd.includes('teleport-status'));
  assert.ok(!/[^\\]'[^\\']*'[^\\]/.test(cmd) || cmd.includes(`'\\''`), 'quotes are escaped');
});
