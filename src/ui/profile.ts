export function slopeProfileSvg(profile: number[], stepM: number, w = 480, h = 64): string {
  const hs: number[] = [0];
  for (let i = 1; i < profile.length; i++) hs.push(hs[i - 1]! + profile[i - 1]! * stepM);
  const min = Math.min(...hs), max = Math.max(...hs), span = Math.max(1, max - min);
  const pts = hs.map((y, i) => `${((i / Math.max(1, hs.length - 1)) * w).toFixed(1)},${(h - 6 - ((y - min) / span) * (h - 12)).toFixed(1)}`).join(' ');
  return `<svg class="profile" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Route slope profile"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>`;
}
