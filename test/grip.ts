// Grip, tested headless: each way Klipp Lab lost the player, and the rest of what Grip promises.
//   node projects/grip/build.mjs --test
import { Director, ease, fixed, follow, group, orbit, path, rail, side, still, trips, type Subject, type V3, type View } from '../src/index';

let failed = 0, passed = 0;
function test(name: string, fn: () => void) {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`); }
}
function expect(ok: boolean, msg: string) { if (!ok) throw new Error(msg); }

const unit = (v: View) => Math.abs(Math.hypot(...v.rotation) - 1) < 1e-6;
const inBox = (d: Director, p: V3, box: number) => { const s = d.project(p); return s[2] > 0 && Math.abs(s[0]) <= box + 1e-3 && Math.abs(s[1]) <= box + 1e-3; };
const head = (s: Subject, lift = 1): V3 => [s.position[0], s.position[1] + lift, s.position[2]];

/** A car: drives at `speed`, turning at `rate` radians a second, `heading` kept up to date. */
function car(speed: number, rate: number) {
    const s: Subject = { position: [0, 0.6, 0], heading: 0, radius: 1 };
    return {
        s,
        step(dt: number) {
            s.heading! += rate * dt;
            s.position[0] += -Math.sin(s.heading!) * speed * dt;
            s.position[2] += -Math.cos(s.heading!) * speed * dt;
        }
    };
}

console.log('Grip');

test('a chase camera at full speed in a long turn never loses the car, or falls far behind', () => {
    // Klipp Lab's Chase: 46 a second, holding right. The camera trailed 18 units back and swung out wide.
    const c = car(46, -1.2), d = new Director();
    d.add('chase', follow(c.s, { distance: 8, height: 3, lift: 0.7 }));
    d.cut('chase');
    let worst = 0, far = 0;
    for (let i = 0; i < 60 * 20; i++) {
        c.step(1 / 60);
        d.update(1 / 60);
        expect(unit(d.view), 'rotation not unit length');
        expect(inBox(d, head(c.s, 0.7), 0.8), `car left the picture at frame ${i}`);
        const s = d.project(head(c.s, 0.7));
        worst = Math.max(worst, Math.abs(s[0]), Math.abs(s[1]));
        far = Math.max(far, Math.hypot(d.view.position[0] - c.s.position[0], d.view.position[2] - c.s.position[2]));
    }
    expect(far < 8 + 1.5 + 0.5, `camera trailed ${far.toFixed(1)} away`);
    console.log(`        furthest ${far.toFixed(1)}, car never further out than ${worst.toFixed(2)}`);
});

test('the same at any frame rate, 15 to 240 a second', () => {
    const c = car(40, 1.5), d = new Director();
    d.add('chase', follow(c.s));
    d.cut('chase');
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 3000; i++) {
        const dt = 1 / (15 + rnd() * 225);
        c.step(dt);
        d.update(dt);
        expect(inBox(d, head(c.s), 0.8), `car left the picture at dt ${dt.toFixed(4)}`);
    }
});

test('a teleport snaps the camera instead of flinging it', () => {
    // Klipp Lab's Side: a respawn read to the lookahead as a burst of speed
    const s: Subject = { position: [0, 0, 0] }, d = new Director();
    d.add('side', side(s, { ahead: 0.5, distance: 20 }));
    d.cut('side');
    for (let i = 0; i < 60; i++) { s.position[0] += 0.15; d.update(1 / 60); }
    s.position[0] = -100;
    d.update(1 / 60);
    expect(inBox(d, head(s), 0.8), 'player off screen after the jump');
    for (let i = 0; i < 60; i++) { d.update(1 / 60); expect(inBox(d, head(s), 0.8), 'player off screen after the jump'); }
    expect(Math.abs(d.frame.at[0] + 100) < 3, `camera at ${d.frame.at[0].toFixed(1)}, not on the player`);
});

test('mixing two shots of a car, one lagging, keeps the car in the picture', () => {
    // Klipp's MixingCamera rebuilt the mix from look-at points and lost a car both its cameras framed
    const c = car(38, -1.4), d = new Director();
    d.add('calm', follow(c.s, { distance: 9, height: 3.4, lag: 0.4, leash: 4, ahead: 0.4, swing: 0.5, maxSwing: 50 }));
    d.add('fast', follow(c.s, { distance: 7, height: 2.3, lag: 0.03 }));
    for (let i = 0; i < 60 * 15; i++) {
        const w = 0.5 + 0.5 * Math.sin(i / 50);
        d.mix({ calm: 1 - w, fast: w });
        c.step(1 / 60);
        d.update(1 / 60);
        expect(unit(d.view), 'rotation not unit length');
        expect(inBox(d, head(c.s), 0.9), `car left the picture at frame ${i}`);
    }
});

test('a blend between shots from opposite sides swings round, never through, and keeps the subject', () => {
    const s: Subject = { position: [0, 0, 0] }, d = new Director();
    d.add('front', orbit(s, { yaw: 180, distance: 8 }));
    d.add('back', orbit(s, { yaw: 0, distance: 8 }));
    d.cut('front');
    d.update(1 / 60);
    d.blend('back', 2, { arc: true });
    let closest = Infinity;
    for (let i = 0; i < 130; i++) {
        d.update(1 / 60);
        closest = Math.min(closest, Math.hypot(...d.frame.eye.map((v, k) => v - head(s)[k]!) as V3));
        expect(inBox(d, head(s), 0.8), `subject left the picture at frame ${i}`);
    }
    expect(closest > 7, `came within ${closest.toFixed(1)} of the subject`);
});

test('the camera never leaves its room', () => {
    const c = car(40, -0.9), d = new Director();
    const room: [number, number, number, number, number, number] = [-20, 0, -20, 20, 30, 20];
    d.add('chase', follow(c.s, { room }));
    d.cut('chase');
    for (let i = 0; i < 1200; i++) {
        c.step(1 / 60);
        c.s.position[0] = Math.max(-19, Math.min(19, c.s.position[0]));
        c.s.position[2] = Math.max(-19, Math.min(19, c.s.position[2]));
        d.update(1 / 60);
        const e = d.view.position;
        expect(e[0] >= -20 - 1e-6 && e[0] <= 20 + 1e-6 && e[2] >= -20 - 1e-6 && e[2] <= 20 + 1e-6, `camera out at ${e.map(v => v.toFixed(1))}`);
        expect(inBox(d, head(c.s), 0.9), 'car left the picture');
    }
});

test('a side-on camera sits still while the subject is in the dead zone, then follows', () => {
    const s: Subject = { position: [0, 0, 0] }, d = new Director();
    d.add('side', side(s, { deadZone: [0.3, 0.3], distance: 20, lag: 0 }));
    d.cut('side');
    d.update(1 / 60);
    const x0 = d.view.position[0];
    for (let i = 0; i < 20; i++) { s.position[0] += 0.1; d.update(1 / 60); }
    expect(Math.abs(d.view.position[0] - x0) < 1e-6, 'moved inside the dead zone');
    for (let i = 0; i < 200; i++) { s.position[0] += 0.2; d.update(1 / 60); }
    expect(d.view.position[0] - x0 > 30, 'did not follow');
    expect(inBox(d, head(s), 0.8), 'lost the subject');
});

test('a fixed camera only turns once the subject leaves its dead zone', () => {
    const s: Subject = { position: [0, 0, 0] }, d = new Director();
    d.add('cam', fixed([10, 5, 10], s, { deadZone: [0.3, 0.3], lag: 0 }));
    d.cut('cam');
    d.update(1 / 60);
    const q0 = [...d.view.rotation];
    s.position[0] += 0.5;
    d.update(1 / 60);
    expect(d.view.rotation.every((v, i) => Math.abs(v - q0[i]!) < 1e-6), 'turned inside the dead zone');
    for (let i = 0; i < 100; i++) { s.position[0] -= 0.3; d.update(1 / 60); expect(inBox(d, head(s), 0.8), 'lost the subject'); }
});

test('a sequence plays its shots in order, holds each, and hands over', () => {
    const d = new Director(), seen: string[] = [];
    d.add('a', still([0, 2, 10], [0, 0, 0]));
    d.add('b', still([10, 2, 0], [0, 0, 0]));
    d.add('c', still([0, 10, 0.1], [0, 0, 0]));
    d.add('game', still([0, 5, 5], [0, 0, 0]));
    let ended = 0;
    d.play([{ shot: 'a', hold: 1 }, { shot: 'b', hold: 1, blend: 0.5 }, { shot: 'c', hold: 0.5 }], { then: 'game', onShot: n => seen.push(n), onEnd: () => ended++ });
    let t = 0;
    while (d.playing && t < 10) { d.update(1 / 60); t += 1 / 60; }
    expect(seen.join() === 'a,b,c', `played ${seen.join()}`);
    expect(Math.abs(t - 3) < 0.05, `took ${t.toFixed(2)}s, not 3`);
    expect(ended === 1 && d.live?.name === 'game', 'did not hand over');
});

test('a kick travels: felt later and less, further away, and on the game clock', () => {
    const d = new Director();
    d.add('near', still([5, 2, 0], [0, 0, 0]));
    d.cut('near');
    d.kick({ from: [50, 0, 0], push: [0, 1, 0], speed: 45, time: 0.5, radius: 5, fade: 90 });
    const nudge = () => Math.hypot(d.view.position[0] - 5, d.view.position[1] - 2, d.view.position[2]);
    let first = -1;
    for (let i = 0; i < 120; i++) { d.update(1 / 60); if (first < 0 && nudge() > 1e-3) first = i / 60; }
    expect(first > 0.95 && first < 1.05, `felt at ${first.toFixed(2)}s, not 1s`);
    // paused: dt 0, nothing arrives
    const p = new Director();
    p.add('s', still([0, 0, 0], [0, 0, -1]));
    p.cut('s');
    p.kick({ from: [10, 0, 0], push: [0, 1, 0], speed: 10 });
    for (let i = 0; i < 120; i++) p.update(0);
    expect(Math.abs(p.view.position[1]) < 1e-9, 'shook while paused');
});

test('a rail goes from start to end in its time, at an even speed, looking where it is told', () => {
    const line = path([[0, 0, 0], [10, 0, 0], [20, 0, 0], [30, 0, 0]]);
    expect(Math.abs(line.length - 30) < 0.01, `a straight path of 30 measured ${line.length.toFixed(2)}`);
    const d = new Director(), r = rail(line, { duration: 2, ease: ease.linear, look: [{ at: 0, look: [0, 0, -10] }, { at: 1, look: [30, 0, -10] }] });
    d.add('r', r);
    d.cut('r');
    const xs: number[] = [];
    for (let i = 0; i <= 120; i++) { d.update(1 / 60); xs.push(d.frame.eye[0]); }
    expect(Math.abs(xs[60]! - 15) < 0.4, `halfway at ${xs[60]!.toFixed(2)}, not 15`);
    expect(Math.abs(xs[120]! - 30) < 0.01, 'did not reach the end');
});

test('a path moves smoothly through its joins, never sticking or turning on the spot', () => {
    // Coaster's track had pieces at right angles to the rest: at every join the distance stuck, and the way it ran fell back to -z
    for (const closed of [false, true]) {
        // Coaster's own track
        const p = path([[0, 2.5, 30], [0, 4, 10], [0, 16, -18], [0, 24, -36], [0, 24.5, -44], [0, 21, -52], [0, 4, -78], [6, 2.2, -96], [24, 3, -106],
            [44, 8, -100], [54, 10, -80], [46, 4, -60], [28, 2.5, -48], [20, 9, -30], [30, 6, -12], [50, 3, -6], [62, 5, 14], [52, 8, 34], [30, 4, 46], [12, 2.5, 42]], closed);
        const a: V3 = [0, 0, 0], b: V3 = [0, 0, 0], t1: V3 = [0, 0, 0], t2: V3 = [0, 0, 0];
        const step = 0.05;
        for (let d = 0; d < p.length - step; d += step) {
            p.at(d, a); p.at(d + step, b);
            const moved = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
            expect(moved > step * 0.5 && moved < step * 1.5, `${closed ? 'closed' : 'open'}: moved ${moved.toFixed(4)} for ${step} at ${d.toFixed(2)}`);
            p.along(d, t1); p.along(d + step, t2);
            const turnDeg = Math.acos(Math.min(1, t1[0] * t2[0] + t1[1] * t2[1] + t1[2] * t2[2])) * 180 / Math.PI;
            expect(turnDeg < 5, `${closed ? 'closed' : 'open'}: turned ${turnDeg.toFixed(1)} degrees in ${step} at ${d.toFixed(2)}`);
        }
    }
});

test('a group shot keeps every member in the picture, orthographic and perspective', () => {
    for (const ortho of [true, false]) {
        const ms = [0, 1, 2, 3].map(i => ({ position: [i * 3, 0, 0] as V3, radius: 1 }));
        const d = new Director();
        d.ortho = ortho;
        d.add('g', group(ms, { keep: ms[0], padding: 1, lag: 0 }));
        d.cut('g');
        for (let i = 0; i < 300; i++) {
            ms.forEach((m, k) => { m.position[0] = Math.sin(i / 40 + k) * (10 + k * 4); m.position[2] = Math.cos(i / 30 + k * 2) * 8; });
            d.update(1 / 60);
            for (const m of ms) expect(inBox(d, m.position, 1), `${ortho ? 'orthographic' : 'perspective'}: a member left the picture at frame ${i}`);
        }
    }
});

test('an orbit stays above its floor, and inside its zoom', () => {
    const s: Subject = { position: [0, 0, 0] }, d = new Director(), o = orbit(s, { pitchRange: [5, 70], distanceRange: [3, 20], ease: 0 });
    d.add('o', o);
    d.cut('o');
    o.turn(0, -500);
    o.zoomBy(0.01);
    d.update(1 / 60);
    expect(d.view.position[1] > 0, 'went below the floor');
    expect(Math.abs(Math.hypot(...d.view.position) - Math.hypot(0, 1, 0) - 20) < 1.5, 'zoomed past its range');
});

test('a column right behind the subject: the camera goes over or round it, never into the subject, and comes back after', () => {
    // a tall column just behind the subject, between it and an orbit's camera, as behind Orbit's pillars
    const col = { x: 0, z: 1.3, r: 0.6, top: 30 };
    const blocked = (from: Readonly<V3>, to: Readonly<V3>) => {
        const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], a = dx * dx + dz * dz;
        if (a < 1e-6) return null;
        const ox = from[0] - col.x, oz = from[2] - col.z, b = ox * dx + oz * dz, c = ox * ox + oz * oz - col.r * col.r, h = b * b - a * c;
        if (h < 0) return null;
        const hit = (-b - Math.sqrt(h)) / a;
        return hit > 0 && hit < 1 && from[1] + dy * hit < col.top ? hit : null;
    };
    const s: Subject = { position: [0, 0, 0], radius: 0.7 }, d = new Director();
    const o = orbit(s, { yaw: 0, distance: 9, pitch: 20, lift: 0.9, lag: 0.12, blocked, ease: 0 });
    d.add('o', o);
    d.cut('o');
    let closest = Infinity, seenThrough = 0;
    for (let i = 0; i < 180; i++) {
        d.update(1 / 60);
        const f = head(s, 0.9), e = d.view.position;
        closest = Math.min(closest, Math.hypot(e[0] - f[0], e[1] - f[1], e[2] - f[2]));
        if (i > 30 && blocked(f, e) !== null) seenThrough++;
    }
    expect(closest >= 2.4, `came ${closest.toFixed(2)} from the subject`);
    expect(seenThrough === 0, `the column hid the subject for ${seenThrough} frames once settled`);
    // walk off, away from the column: the camera goes back to where it was
    for (let i = 0; i < 240; i++) { s.position[0] += 4 / 60; d.update(1 / 60); }
    for (let i = 0; i < 120; i++) d.update(1 / 60);
    const f = head(s, 0.9), e = d.view.position, back = Math.hypot(e[0] - f[0], e[1] - f[1], e[2] - f[2]);
    expect(Math.abs(back - 9) < 0.3, `stayed ${back.toFixed(2)} away, not 9`);
});

test('a clock that jumps backwards, or breaks, changes nothing', () => {
    const c = car(20, 0.3), d = new Director();
    d.add('chase', follow(c.s, { distance: 8, height: 3 }));
    d.cut('chase');
    for (let i = 0; i < 60; i++) { c.step(1 / 60); d.update(1 / 60); }
    const before = [...d.view.position];
    d.update(-90); d.update(NaN);
    expect(Math.hypot(d.view.position[0] - before[0]!, d.view.position[1] - before[1]!, d.view.position[2] - before[2]!) < 1e-6, 'the camera moved');
    d.shake(0.5);
    d.update(-90);
    for (let i = 0; i < 120; i++) { c.step(1 / 60); d.update(1 / 60); }
    expect(inBox(d, head(c.s), 0.8), 'lost the car after');
});

test('a shot thrown off by its settings is put right by the rules, which do nothing to a good one', () => {
    // a security camera told to ignore the subject until it's well off screen
    const run = (guard: boolean) => {
        const s: Subject = { position: [0, 0, 0] }, d = new Director();
        d.add('cam', fixed([0, 4, 12], s, { deadZone: [1.6, 1.6], lag: 2, guard: guard ? {} : false }));
        d.cut('cam');
        let off = 0;
        for (let i = 0; i < 240; i++) { s.position[0] = Math.sin(i / 30) * 25; d.update(1 / 60); if (!inBox(d, head(s), 0.8)) off++; }
        return off;
    };
    const without = run(false), withRules = run(true);
    expect(without > 50, `the test is too gentle: only ${without} frames off without the rules`);
    expect(withRules === 0, `${withRules} frames off with the rules`);
    // and a good shot: the rules never step in
    const before = { ...trips }, c = car(20, 0.6), d = new Director();
    d.add('f', follow(c.s));
    d.cut('f');
    for (let i = 0; i < 600; i++) { c.step(1 / 60); d.update(1 / 60); }
    expect(trips.box === before.box && trips.final === before.final, 'the rules stepped in on a good shot');
    console.log(`        ${without} frames off without the rules, none with`);
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
