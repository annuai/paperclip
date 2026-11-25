export interface MenuItem {
  id: string;
  label: string;
  checked?: boolean;
  separatorBefore?: boolean;
  /** Opens a sub-panel (e.g. Style > Classic / Flat). */
  children?: MenuItem[];
  /** 'radio' items render a check when selected (single choice inside a group). */
  role?: 'item' | 'radio' | 'checkbox';
  /** Info rows (e.g. "Today: 3 glasses"): shown dimmed, skipped by keyboard navigation, never picked. */
  disabled?: boolean;
}

const W = 180;
const SUB_W = 160;
const MAX_H = 374; // the stage is 380px tall: a longer main menu scrolls instead of being cut off
const ROW_H = 26; // visual row height is themed in CSS; used only for clamping (flat rows are 30px)
const CHECK_SVG =
  '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2 6.5 L5 9.5 L10 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BACK_SVG =
  '<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true"><path d="M8 2 L4 6 L8 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_SVG =
  '<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true"><path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export class ContextMenu {
  private open_ = false;
  private sub: HTMLElement | null = null;
  private subItem: HTMLElement | null = null;
  private level: 'main' | 'sub' = 'main';
  /** The top-level item whose children fill the sub-panel, and the items drilled into beneath it. */
  private subData: MenuItem | null = null;
  private trail: MenuItem[] = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly onPick: (id: string) => void,
    private readonly onVisibility: (v: boolean) => void,
  ) {
    document.addEventListener('mousedown', (e) => {
      if (this.open_ && !this.contains(e.target as Node)) this.close();
    }, true);
    document.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('blur', () => this.close());
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private pointed: HTMLElement | null = null;

  /**
   * The cursor is at (x, y) in window CSS px, as reported by the Rust poller. On macOS the window is often not the
   * active one, and then the web view gets no mouse-move events, so hover is driven from here as well. Pointing at a
   * row behaves exactly like the mouse entering it (highlight, open its submenu).
   */
  pointAt(x: number, y: number): void {
    if (!this.open_) return;
    const hit = document.elementFromPoint(x, y);
    const row = hit instanceof Element ? (hit.closest('.item') as HTMLElement | null) : null;
    if (!row || !this.contains(row) || row.classList.contains('disabled')) {
      // Off the rows: drop the highlight, like a native menu (the row whose submenu is open stays marked by .sub-open).
      if (this.pointed) for (const r of [...this.rows(this.el), ...this.rows(this.sub)]) r.classList.remove('active');
      this.pointed = null;
      return;
    }
    if (row === this.pointed) return;
    this.pointed = row;
    row.dispatchEvent(new MouseEvent('mouseenter'));
  }

  get visible(): boolean {
    return this.open_;
  }

  /** Union of the main panel and the open sub-panel, relative to the stage (for hit rects). */
  rect(): { x: number; y: number; w: number; h: number } {
    const rs = [this.el.getBoundingClientRect()];
    if (this.sub && !this.sub.classList.contains('hidden')) rs.push(this.sub.getBoundingClientRect());
    const x0 = Math.min(...rs.map((r) => r.left));
    const y0 = Math.min(...rs.map((r) => r.top));
    const x1 = Math.max(...rs.map((r) => r.right));
    const y1 = Math.max(...rs.map((r) => r.bottom));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  open(x: number, y: number, items: MenuItem[]): void {
    this.pointed = null;
    this.closeSub();
    this.sub?.remove();
    this.sub = null;
    this.el.textContent = '';
    this.el.classList.remove('hidden');
    this.el.setAttribute('role', 'menu');
    let height = 8;
    for (const it of items) {
      height += this.addRow(this.el, it, () => this.openSub(it)) + (it.separatorBefore ? 7 : 0);
    }
    height = Math.min(height, MAX_H);
    const maxX = Math.max(0, 320 - W - 2);
    const maxY = Math.max(0, 380 - height - 6);
    this.el.style.left = Math.min(Math.max(0, x), maxX) + 'px';
    this.el.style.top = Math.min(Math.max(0, y), maxY) + 'px';
    this.el.scrollTop = 0;
    this.open_ = true;
    this.level = 'main';
    requestAnimationFrame(() => this.onVisibility(true));
  }

  close(): void {
    this.pointed = null;
    if (!this.open_) return;
    this.open_ = false;
    this.closeSub();
    this.el.classList.add('hidden');
    this.onVisibility(false);
  }

  private contains(n: Node): boolean {
    return this.el.contains(n) || (this.sub?.contains(n) ?? false);
  }

  private addRow(host: HTMLElement, it: MenuItem, onHover: () => void, back = false): number {
    if (it.separatorBefore) {
      const s = document.createElement('div');
      s.className = 'sep';
      s.setAttribute('role', 'separator');
      host.append(s);
    }
    const row = document.createElement('div');
    row.className = 'item';
    row.tabIndex = -1;
    row.dataset.id = it.id;
    row.setAttribute('role', it.role === 'radio' ? 'menuitemradio' : it.role === 'checkbox' || it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem');
    if (it.checked !== undefined) row.setAttribute('aria-checked', String(!!it.checked));
    const label = document.createElement('span');
    label.textContent = it.label;
    const tail = document.createElement('span');
    tail.className = 'chk';
    if (back) {
      row.classList.add('back');
      row.setAttribute('aria-label', 'Back');
      tail.innerHTML = BACK_SVG;
      tail.dataset.back = '1';
      row.append(tail, label); // the chevron leads on a back row
      return this.finishRow(host, row, it, onHover, true);
    }
    if (it.children) {
      tail.innerHTML = ARROW_SVG;
      row.classList.add('has-sub');
      row.setAttribute('aria-haspopup', 'menu');
    } else {
      tail.innerHTML = CHECK_SVG;
      if (it.checked) tail.dataset.on = '1';
    }
    row.append(label, tail);
    return this.finishRow(host, row, it, onHover, false);
  }

  private finishRow(host: HTMLElement, row: HTMLElement, it: MenuItem, onHover: () => void, back: boolean): number {
    if (it.disabled) {
      row.classList.add('disabled');
      row.setAttribute('aria-disabled', 'true');
      host.append(row);
      return Math.max(ROW_H, 30);
    }
    row.addEventListener('mouseenter', () => {
      this.activate(row);
      onHover();
    });
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (back) { this.back(); return; }
      if (it.children) {
        if (host === this.el) this.openSub(it, true);
        else this.drill(it); // a submenu inside the sub-panel replaces its rows (the window is only 320px wide)
        return;
      }
      this.close();
      this.onPick(it.id);
    });
    host.append(row);
    // Flat rows are 30px, classic 26px; the theme decides, clamping uses the larger one.
    return Math.max(ROW_H, 30);
  }

  private rows(host: HTMLElement | null): HTMLElement[] {
    return host ? [...host.querySelectorAll<HTMLElement>(':scope > .item:not(.disabled)')] : [];
  }

  private activate(row: HTMLElement): void {
    const host = row.parentElement as HTMLElement;
    for (const r of this.rows(host)) r.classList.toggle('active', r === row);
    row.focus({ preventScroll: true });
    if (host === this.el) row.scrollIntoView?.({ block: 'nearest' });
  }

  private openSub(it: MenuItem, focusFirst = false): void {
    if (!it.children) { this.closeSub(); return; }
    const row = this.rows(this.el).find((r) => r.dataset.id === it.id) as HTMLElement;
    if (this.subItem === row && this.sub && !this.sub.classList.contains('hidden')) {
      if (focusFirst) this.focusSub(this.trail.length ? 1 : 0);
      return;
    }
    this.closeSub();
    if (!this.sub) {
      this.sub = document.createElement('div');
      this.sub.className = 'menu submenu hidden';
      this.sub.setAttribute('role', 'menu');
      this.el.parentElement?.append(this.sub);
    }
    this.subData = it;
    this.trail = [];
    this.fillSub();
    const mx = parseFloat(this.el.style.left) || 0;
    const subX = mx + W + SUB_W + 2 <= 320 ? mx + W - 2 : Math.max(0, mx - SUB_W + 2);
    this.sub.style.left = subX + 'px';
    this.sub.style.width = SUB_W + 'px';
    this.sub.classList.remove('hidden');
    this.subItem = row;
    this.placeSub();
    row.classList.add('sub-open');
    this.onVisibility(true);
    if (focusFirst) this.focusSub(0);
  }

  /** The rows the sub-panel shows right now: the open item's children, or those of the item drilled into. */
  private subList(): MenuItem[] {
    return (this.trail.length ? this.trail[this.trail.length - 1] : this.subData)?.children ?? [];
  }

  private fillSub(): void {
    if (!this.sub) return;
    this.sub.textContent = '';
    this.sub.scrollTop = 0;
    const cur = this.trail[this.trail.length - 1];
    if (cur) {
      // A "< Name" row leads back one level; the rest follow after a rule.
      this.addRow(this.sub, { id: '__back', label: cur.label }, () => undefined, true);
      const sep = document.createElement('div');
      sep.className = 'sep';
      sep.setAttribute('role', 'separator');
      this.sub.append(sep);
    }
    for (const c of this.subList()) this.addRow(this.sub, c, () => undefined);
  }

  /** Aligns the sub-panel with the row that opened it, kept inside the 380px window. */
  private placeSub(): void {
    if (!this.sub || !this.subItem) return;
    const my = parseFloat(this.el.style.top) || 0;
    this.sub.style.top = Math.max(2, Math.min(my + this.subItem.offsetTop - this.el.scrollTop, 380 - this.sub.offsetHeight - 4)) + 'px';
  }

  /** Opens a submenu that lives inside the sub-panel (Wellbeing > Water reminders): its rows replace the current ones. */
  private drill(it: MenuItem): void {
    if (!it.children || !this.sub) return;
    this.trail.push(it);
    this.fillSub();
    this.placeSub();
    this.onVisibility(true);
    this.focusSub(1); // row 0 is the back row
  }

  /** One level out of a drilled-into submenu, keeping the row we came from highlighted. */
  private back(): void {
    const left = this.trail.pop();
    if (!left || !this.sub) return;
    this.fillSub();
    this.placeSub();
    this.onVisibility(true);
    this.level = 'sub';
    const row = this.rows(this.sub).find((r) => r.dataset.id === left.id);
    if (row) this.activate(row);
  }

  private closeSub(): void {
    if (this.sub && !this.sub.classList.contains('hidden')) {
      this.sub.classList.add('hidden');
      this.subItem?.classList.remove('sub-open');
      this.subItem = null;
      this.subData = null;
      this.trail = [];
      this.level = 'main';
      if (this.open_) this.onVisibility(true);
    }
  }

  private focusSub(i: number): void {
    const rows = this.rows(this.sub);
    if (!rows.length) return;
    this.level = 'sub';
    this.activate(rows[(i + rows.length) % rows.length]);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.open_) return;
    const host = this.level === 'sub' && this.sub ? this.sub : this.el;
    const rows = this.rows(host);
    const cur = rows.findIndex((r) => r.classList.contains('active'));
    switch (e.key) {
      case 'Escape':
        if (this.level === 'sub' && this.trail.length) this.back();
        else if (this.level === 'sub') {
          const it = this.subItem;
          this.closeSub();
          if (it) this.activate(it);
        } else this.close();
        break;
      case 'ArrowDown':
        this.activate(rows[(cur + 1 + rows.length) % rows.length]);
        break;
      case 'ArrowUp':
        this.activate(rows[(cur <= 0 ? rows.length : cur) - 1]);
        break;
      case 'ArrowRight':
        if (cur >= 0 && rows[cur].classList.contains('has-sub')) rows[cur].click();
        break;
      case 'ArrowLeft':
        if (this.level === 'sub' && this.trail.length) this.back();
        else if (this.level === 'sub') {
          const it = this.subItem;
          this.closeSub();
          if (it) this.activate(it);
        }
        break;
      case 'Enter':
      case ' ':
        if (cur >= 0) rows[cur].click();
        break;
      default:
        return;
    }
    e.preventDefault();
  }
}
