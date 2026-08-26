import type { RigState } from '../sim/types';

/**
 * Sampled cues for the moments the synthesised layer in gameAudio.ts predates: the sandstorm and the
 * interceptor turret. Everything here is one-shot or a gain-ramped loop, driven by diffing RigState —
 * audio never feeds back into the simulation, so determinism is untouched.
 */
export type Cue = 'shieldUp' | 'denied' | 'missileLaunch' | 'dangerTick' | 'radarOn' | 'radarOff' | 'cacheFound';

const SOURCES: Record<Cue, URL> = {
  shieldUp: new URL('../assets/audio/shield_up.ogg', import.meta.url),
  denied: new URL('../assets/audio/denied.ogg', import.meta.url),
  missileLaunch: new URL('../assets/audio/missile_launch.ogg', import.meta.url),
  dangerTick: new URL('../assets/audio/danger_tick.ogg', import.meta.url),
  radarOn: new URL('../assets/audio/radar_on.ogg', import.meta.url),
  radarOff: new URL('../assets/audio/radar_off.ogg', import.meta.url),
  cacheFound: new URL('../assets/audio/cache_found.ogg', import.meta.url),
};
const VOLUME: Record<Cue, number> = {
  shieldUp: 0.42, denied: 0.3, missileLaunch: 0.45, dangerTick: 0.22, radarOn: 0.3, radarOff: 0.26, cacheFound: 0.34,
};

const WIND = new URL('../assets/audio/wind.ogg', import.meta.url);
const RADAR_LOOP = new URL('../assets/audio/radar_loop.ogg', import.meta.url);

function play(cue: Cue, rate = 1): void {
  const el = new Audio(SOURCES[cue].href);
  el.volume = VOLUME[cue];
  el.playbackRate = rate;
  void el.play().catch(() => { /* browsers reject audio before the first gesture */ });
}

function loop(src: URL, volume: number): HTMLAudioElement {
  const el = new Audio(src.href);
  el.loop = true;
  el.volume = 0;
  void el.play().catch(() => { /* unlocked on the first gesture like the rest */ });
  el.dataset.target = String(volume);
  return el;
}

interface Snap { storm: number; radar: boolean; shield: number; missiles: number; danger: number; found: number }

/** Storm and turret audio. Construct once, call beginRun per haul and step every tick. */
export class ThreatAudio {
  private wind: HTMLAudioElement | null = null;
  private radar: HTMLAudioElement | null = null;
  private prev: Snap | null = null;
  private seen = new Set<number>();

  private snap(s: RigState, danger: number): Snap {
    return { storm: s.storm, radar: s.radar, shield: s.shield, missiles: s.missiles.length, danger, found: s.foundDiscoveries.length };
  }

  beginRun(s: RigState): void {
    this.prev = this.snap(s, 0);
    this.seen.clear();
  }

  /** `danger` is highestDanger(s, tuning); passed in so this module never imports the sim's step. */
  step(s: RigState, danger: number): void {
    if (!this.wind) this.wind = loop(WIND, 0.5);
    if (!this.radar) this.radar = loop(RADAR_LOOP, 0.22);
    const prev = this.prev ?? this.snap(s, danger);

    // the storm bed rides the same 0..1 ramp the fog does, so it arrives and lifts with the weather
    this.wind.volume = Math.min(1, s.storm) * 0.5;
    this.radar.volume = s.radar ? 0.22 : 0;

    if (s.radar !== prev.radar) play(s.radar ? 'radarOn' : 'radarOff');
    // a launch is the one thing you cannot see coming, so it gets its own alert
    for (const m of s.missiles) if (!this.seen.has(m.id)) { this.seen.add(m.id); play('missileLaunch'); }
    // the level climb ticks upward in pitch: six steps from launch to impact
    if (danger > prev.danger && danger > 0) play('dangerTick', 0.8 + danger * 0.12);
    if (s.shield >= 0 && prev.shield < 0) play('shieldUp');
    // shield asked for and refused — moving, or still cooling down
    if (s.shield < 0 && prev.shield < 0 && danger >= 5 && Math.abs(s.speed) >= 0.05 && s.t % 30 === 0) play('denied');
    if (s.foundDiscoveries.length > prev.found) play('cacheFound');

    this.prev = this.snap(s, danger);
  }

  stop(): void {
    for (const el of [this.wind, this.radar]) { if (el) { el.pause(); el.currentTime = 0; } }
    this.wind = null; this.radar = null;
  }
}
