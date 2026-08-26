export type UiCue = 'select' | 'confirm' | 'back' | 'error';

const SOURCES: Record<UiCue, URL> = {
  select: new URL('../assets/audio/cursor_style_4.ogg', import.meta.url),
  confirm: new URL('../assets/audio/confirm_style_2_001.ogg', import.meta.url),
  back: new URL('../assets/audio/back_style_2_001.ogg', import.meta.url),
  error: new URL('../assets/audio/error_style_2_001.ogg', import.meta.url),
};

const VOLUME: Record<UiCue, number> = { select: 0.2, confirm: 0.28, back: 0.24, error: 0.3 };

export function playUiCue(cue: UiCue): void {
  const audio = new Audio(SOURCES[cue].href);
  audio.volume = VOLUME[cue];
  void audio.play().catch(() => { /* Browsers may reject sound before the first gesture. */ });
}

export function installUiSounds(root: Document): () => void {
  const onPointer = (event: PointerEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    const interactive = target?.closest('button, .offers li');
    if (!interactive) return;
    if (interactive.closest('#panel, #viewport')) return; // gameplay controls have richer diegetic cues
    if (interactive instanceof HTMLButtonElement && interactive.disabled) { playUiCue('error'); return; }
    if (interactive.matches('.offers.at-capacity li:not(.on)')) playUiCue('error');
    else if (interactive.matches('.done')) playUiCue('back');
    else if (interactive.matches('.primary')) playUiCue('confirm');
    else playUiCue('select');
  };
  root.addEventListener('pointerdown', onPointer, { capture: true });
  return () => root.removeEventListener('pointerdown', onPointer, { capture: true });
}
