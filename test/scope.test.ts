import { describe, it, expect } from 'vitest';
import { scopeMarkup } from '../src/ui/scope';
import { createRun } from '../src/sim/step';
import { tuning } from '../src/content';
import { flatRoute, crateDef } from './helpers';

describe('scopeMarkup', () => {
  it('draws eight sectors and a blip for each missile in flight', () => {
    const s = createRun(flatRoute(), [{ def: crateDef(), slot: 1 }], tuning);
    expect(scopeMarkup(s, tuning)).not.toContain('class="blip"');
    s.missiles.push({ id: 1, x: s.x + 50, z: s.z, launchTick: 0, impactTick: 300 });
    const withOne = scopeMarkup(s, tuning);
    expect((withOne.match(/class="sector/g) ?? []).length).toBe(8);
    expect((withOne.match(/class="blip"/g) ?? []).length).toBe(1);
    expect(withOne).toContain('data-sector="0"');
  });
});
