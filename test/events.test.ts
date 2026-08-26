import { describe, it, expect } from 'vitest';
import { describeEvents, snapshot } from '../src/game/events';
import { createRun } from '../src/sim/step';
import { routeFromSegments } from '../src/sim/terrain';
import { tuning } from '../src/content';
import { crateDef, hazard } from './helpers';

const route = routeFromSegments(1, [{ x0: 0, x1: 400, slope: 0, y0: 0 }],
  [hazard({ id: 3, type: 'rockfall', x: 40, x1: 48, z: 0, halfW: 5, impulse: 1.2, strapJolt: 22, cycleTicks: 360, windowTicks: 72, phase: 0 })],
  10, [{ id: 0, x: 20, z: 5, name: 'SMUGGLER CACHE' }]);

describe('describeEvents', () => {
  it('reports caches, mover hits, wall strikes and lost cargo once each', () => {
    const s = createRun(route, [{ def: crateDef({ id: 'crate' }), slot: 1 }], tuning);
    let snap = snapshot(s);
    s.foundDiscoveries.push(0);
    let r = describeEvents(snap, s, route, tuning.cacheReserve); snap = r.next;
    expect(r.lines).toEqual([`CACHE: SMUGGLER CACHE +${tuning.cacheReserve} RESERVE`]);
    expect(describeEvents(snap, s, route, tuning.cacheReserve).lines).toEqual([]);
    s.zoneCooldown[3] = 100;
    r = describeEvents(snap, s, route, tuning.cacheReserve); snap = r.next;
    expect(r.lines).toEqual(['ROCKFALL HIT']);
    s.items[0]!.restraint = 40; s.speed = 0; s.targetSpeed = 10;
    r = describeEvents(snap, s, route, tuning.cacheReserve); snap = r.next;
    expect(r.lines).toEqual(['WALL STRIKE']);
    expect(describeEvents(snap, s, route, tuning.cacheReserve).lines).toEqual([]);
    s.items[0]!.lost = true;
    r = describeEvents(snap, s, route, tuning.cacheReserve);
    expect(r.lines).toEqual(['CRATE OVERBOARD — RECOVER (R)']);
  });
});
