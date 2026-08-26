/**
 * Pre-run briefing. Shown at the start of every haul with the simulation genuinely stopped — the game loop
 * is not started until this is dismissed, so no ticks run and the input log stays clean for replay.
 */

interface Row { key: string; name: string; note: string }

const CONTROLS: Row[] = [
  { key: 'W / S', name: 'WALK', note: 'Held, not toggled. The rig only moves while W is down, at the gait you set.' },
  { key: 'A / D', name: 'LANE', note: 'Steer across the corridor. Walls stop you dead, so pick a lane early.' },
  { key: '0 – 4', name: 'GAIT', note: 'Top speed. Higher gait means less time to react and a longer stop.' },
  { key: 'SPACE', name: 'JUMP', note: 'Clears a collapsed span. Landing costs tilt and shakes the straps loose.' },
  { key: 'SHIFT', name: 'BRACE', note: 'Damps tilt through a hit. Costs reserve, so brace gaps — not everything.' },
  { key: 'F', name: 'RATCHET', note: 'Tightens the selected bay. Past its crush limit you are grinding the load.' },
  { key: 'TAB / 5 6 7', name: 'BAY', note: 'Select a bay. The restraint and cargo gauges follow your selection.' },
  { key: 'V', name: 'RADAR', note: 'Wireframe vision through a sandstorm. Burns reserve for as long as it is lit.' },
  { key: 'R', name: 'RECOVER', note: 'Retrieve a load you spilled. Costs reserve and holds you still.' },
  { key: 'DRAG', name: 'BALLAST', note: 'Drag the viewport to shift trim. Chase the AIM pip, not the centre.' },
];

const INSTRUMENTS: Row[] = [
  { key: 'TILT', name: 'the dial that ends runs', note: 'Past 1.0 the load spills. The red wedges are where you are already in trouble.' },
  { key: 'RPM', name: 'speed against target', note: 'The needle is real speed; the pale tick is what your gait is asking for.' },
  { key: 'RESERVE', name: 'your fuel and your clock', note: 'Drains with distance, bracing, radar and the shield. At zero the run stalls.' },
  { key: 'RESTRAINT', name: 'selected bay', note: 'The red mark is that load’s crush limit. Ratchet past it and you damage the cargo.' },
  { key: 'CARGO', name: 'selected bay condition', note: 'Follows the same bay as the restraint gauge above it.' },
  { key: 'BALLAST', name: 'trim', note: 'The cyan pip is the trim that cancels the current slope and load. Sit on it.' },
  { key: 'SCOPE', name: '360° threat scope', note: 'Contacts are turrets; blips are missiles closing. The number is time to impact, 1 to 6.' },
  { key: 'SHIELD PAD', name: 'eight bearings', note: 'You must be STOPPED to raise it. Braking takes time, so commit early — by level 2 at full gait.' },
];

const row = (r: Row): string =>
  `<li><b>${r.key}</b><span class="what">${r.name}</span><span class="note">${r.note}</span></li>`;

/** Renders the overlay and calls `onBegin` once, when the player dismisses it. */
export function showBriefing(host: HTMLElement, outpost: string, onBegin: () => void): void {
  const el = document.createElement('div');
  el.className = 'briefing';
  el.innerHTML = `
    <div class="briefing-card">
      <h2>PRE-HAUL BRIEFING <small>${outpost}</small></h2>
      <div class="briefing-cols">
        <section><h3>CONTROLS</h3><ul>${CONTROLS.map(row).join('')}</ul></section>
        <section><h3>INSTRUMENTS</h3><ul>${INSTRUMENTS.map(row).join('')}</ul></section>
      </div>
      <button class="big primary begin">BEGIN HAUL <kbd>ENTER</kbd></button>
    </div>`;
  host.appendChild(el);

  let done = false;
  const dismiss = (): void => {
    if (done) return;
    done = true;
    document.removeEventListener('keydown', onKey);
    el.remove();
    onBegin();
  };
  function onKey(e: KeyboardEvent): void {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); dismiss(); }
  }
  el.querySelector<HTMLButtonElement>('.begin')!.addEventListener('pointerdown', dismiss);
  document.addEventListener('keydown', onKey);
}
