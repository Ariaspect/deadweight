export type DriveAxis = 'forward' | 'backward' | 'left' | 'right';
export interface DpadHandlers { onDrive(axis: DriveAxis, on: boolean): void }

/** On-screen drive pad for touch devices (shown via CSS only for coarse pointers). Each button captures its own pointer so two fingers can hold forward + steer. */
export function mountDpad(viewport: HTMLElement, h: DpadHandlers): HTMLElement {
  const el = document.createElement('div');
  el.className = 'dpad';
  const keys: [DriveAxis, string, string][] = [['forward', '▲', 'up'], ['left', '◀', 'left'], ['right', '▶', 'right'], ['backward', '▼', 'down']];
  el.innerHTML = keys.map(([axis, glyph, pos]) => `<button class="dpad-btn ${pos}" data-axis="${axis}" aria-label="${axis}">${glyph}</button>`).join('');
  for (const b of el.querySelectorAll<HTMLButtonElement>('button')) {
    const axis = b.dataset.axis as DriveAxis;
    const on = (e: PointerEvent): void => { b.setPointerCapture(e.pointerId); b.classList.add('on'); h.onDrive(axis, true); e.preventDefault(); };
    const off = (): void => { if (!b.classList.contains('on')) return; b.classList.remove('on'); h.onDrive(axis, false); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  }
  viewport.appendChild(el);
  return el;
}
