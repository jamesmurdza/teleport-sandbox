/**
 * Bottom status bar.
 *
 * Mechanism: we reserve the bottom physical row for ourselves by
 *   (a) reporting a PTY size of (cols, rows-1) to the remote agent, so it never
 *       addresses the last row, and
 *   (b) setting a local DECSTBM scroll region of rows 1..(rows-1), so scrolling
 *       output from line-based programs stays above the bar.
 * The bar is repainted on a timer and whenever the content changes, so even if
 * the agent clears the whole screen the bar reappears within ~1s.
 */
const ESC = '\x1b';

export interface BarState {
  sandboxId: string;
  status: string;
  agent: string;
  repo?: string;
  branch?: string;
  push?: string;
  connection?: string;
}

export class StatusBar {
  private text = '';
  private timer: NodeJS.Timeout | null = null;
  private state: BarState;

  constructor(initial: BarState) {
    this.state = initial;
    this.render();
  }

  /** Rows available to the agent (physical rows minus the bar row). */
  static agentRows(physicalRows: number): number {
    return Math.max(1, physicalRows - 1);
  }

  private get rows(): number {
    return process.stdout.rows ?? 24;
  }
  private get cols(): number {
    return process.stdout.columns ?? 80;
  }

  /** Installs the scroll region so program output stays above the bar. */
  install(): void {
    // Set scroll region to rows 1..(rows-1), leaving the last row for the bar.
    process.stdout.write(`${ESC}[1;${this.rows - 1}r`);
    // Park the cursor inside the region.
    process.stdout.write(`${ESC}[${this.rows - 1};1H`);
    this.render();
    this.timer = setInterval(() => this.paint(), 1000);
    if (this.timer.unref) this.timer.unref();
  }

  /** Removes the scroll region and clears the bar. */
  uninstall(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Reset scroll region to full screen and clear the bar row.
    process.stdout.write(`${ESC}[r`);
    process.stdout.write(`${ESC}7${ESC}[${this.rows};1H${ESC}[2K${ESC}8`);
  }

  /** Re-applies the scroll region after a terminal resize. */
  onResize(): void {
    process.stdout.write(`${ESC}[1;${this.rows - 1}r`);
    this.paint();
  }

  update(patch: Partial<BarState>): void {
    this.state = { ...this.state, ...patch };
    this.render();
    this.paint();
  }

  private render(): void {
    const s = this.state;
    const parts = [
      `⚡ ${s.sandboxId.slice(0, 8)}`,
      s.status,
      s.agent,
      s.repo ? `${s.repo}` : '',
      s.branch ? `↟ ${s.branch}` : '',
      s.push ? `push:${s.push}` : '',
      s.connection ?? '',
    ].filter(Boolean);
    const left = ` ${parts.join('  │  ')} `;
    const hint = ' detach: Ctrl-\\ ';
    const pad = Math.max(1, this.cols - left.length - hint.length);
    this.text = (left + ' '.repeat(pad) + hint).slice(0, this.cols);
  }

  /** Draws the bar on the reserved row, preserving the agent's cursor. */
  paint(): void {
    const row = this.rows;
    // Save cursor, move to bar row, reverse video, write, reset, restore cursor.
    process.stdout.write(
      `${ESC}7${ESC}[${row};1H${ESC}[2K${ESC}[7m${this.text}${ESC}[0m${ESC}8`,
    );
  }
}
