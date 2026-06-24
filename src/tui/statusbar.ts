/**
 * Bottom status bar.
 *
 * Reserving a bottom line for a passthrough client (we are not a full terminal
 * emulator like tmux) is inherently delicate, so the implementation follows two
 * rules that keep it from corrupting the agent's UI:
 *
 *  1. We NEVER write the bar in the middle of the agent's output stream. The bar
 *     is painted only when output has been idle for a short window, so our bytes
 *     land between the agent's frames, never inside an escape sequence.
 *  2. We reserve the bottom row two ways: the agent is told the terminal is
 *     (rows-1) tall (see session.ts), and we set a DECSTBM scroll region of
 *     1..(rows-1) which is re-asserted on every paint so scrolling output never
 *     drags the bar up the screen.
 *
 * The status is also mirrored into the window title (OSC 2), which is completely
 * corruption-proof and always reflects the latest state.
 */
const ESC = '\x1b';
const IDLE_MS = 120;

export interface BarState {
  sandboxId: string;
  status: string;
  agent: string;
  repo?: string;
  branch?: string;
  push?: string;
  connection?: string;
}

export interface StatusBarDeps {
  /** Output stream (defaults to process.stdout). Injectable for tests. */
  out?: { write(s: string): unknown; rows?: number; columns?: number };
  /** Clock (defaults to Date.now). Injectable for tests. */
  now?: () => number;
}

export class StatusBar {
  private text = '';
  private title = '';
  private timer: NodeJS.Timeout | null = null;
  private lastDataAt = 0;
  private installed = false;
  private state: BarState;
  private readonly out: NonNullable<StatusBarDeps['out']>;
  private readonly now: () => number;

  constructor(initial: BarState, deps: StatusBarDeps = {}) {
    this.state = initial;
    this.out = deps.out ?? process.stdout;
    this.now = deps.now ?? Date.now;
    this.render();
  }

  /** Rows available to the agent (physical rows minus the bar row). */
  static agentRows(physicalRows: number): number {
    return Math.max(1, physicalRows - 1);
  }

  private get rows(): number {
    return this.out.rows ?? 24;
  }
  private get cols(): number {
    return this.out.columns ?? 80;
  }

  /** Marks that agent output just arrived; defers painting until things settle. */
  markData(): void {
    this.lastDataAt = this.now();
  }

  /** Installs the scroll region and starts the idle painter. */
  install(): void {
    this.installed = true;
    this.assertRegion();
    this.paint(true);
    this.timer = setInterval(() => this.tick(), IDLE_MS);
    if (this.timer.unref) this.timer.unref();
  }

  /** Removes the scroll region, clears the bar, and restores the title. */
  uninstall(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.installed = false;
    // Reset scroll region to full screen, clear the bar row, restore title.
    this.out.write(
      `${ESC}[r${ESC}7${ESC}[${this.rows};1H${ESC}[2K${ESC}8${ESC}]2;${ESC}\\`,
    );
  }

  /** Re-applies the scroll region after a terminal resize. */
  onResize(): void {
    this.render();
    this.assertRegion();
    this.paint(true);
  }

  update(patch: Partial<BarState>): void {
    this.state = { ...this.state, ...patch };
    this.render();
  }

  private tick(): void {
    if (!this.installed) return;
    if (this.now() - this.lastDataAt < IDLE_MS) return; // output still flowing
    this.paint(false);
  }

  /** Sets the DECSTBM scroll region to reserve the bottom row. */
  private assertRegion(): void {
    this.out.write(`${ESC}[1;${Math.max(1, this.rows - 1)}r`);
  }

  private render(): void {
    const s = this.state;
    const parts = [
      `${s.sandboxId.slice(0, 8)}`,
      s.status,
      s.agent,
      s.repo ?? '',
      s.branch ? `↟ ${s.branch}` : '',
      s.push ? `push ${s.push}` : '',
      s.connection ?? '',
    ].filter(Boolean);
    const left = ` ⚡ ${parts.join('  ·  ')} `;
    const hint = ' Ctrl-\\ detach ';
    const pad = Math.max(1, this.cols - left.length - hint.length);
    this.text = (left + ' '.repeat(pad) + hint).slice(0, this.cols);
    this.title = `teleport — ${parts.join(' · ')}`;
  }

  /**
   * Draws the bar on the reserved row in a single atomic write, preserving the
   * agent's cursor. `force` re-asserts the scroll region too (used on install
   * and resize). The window title is always updated (corruption-proof).
   */
  paint(force: boolean): void {
    if (!this.installed && !force) return;
    const row = this.rows;
    const region = force ? `${ESC}[1;${Math.max(1, row - 1)}r` : '';
    this.out.write(
      // save cursor · (re-assert region) · go to bar row · clear · reverse video
      // · text · reset · restore cursor · set window title
      `${ESC}7${region}${ESC}[${row};1H${ESC}[2K${ESC}[7m${this.text}${ESC}[0m${ESC}8` +
        `${ESC}]2;${this.title}${ESC}\\`,
    );
  }
}
