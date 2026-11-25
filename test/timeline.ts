// The timeline, tested headless.
import { Director, fixed, orbit, path, rail, type V3 } from '../src/index';
import { Timeline, type Script, type SoundPlayer } from '../src/timeline/index';

let failed = 0, passed = 0;
function test(name: string, fn: () => void) {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`); }
}
function expect(ok: boolean, msg: string) { if (!ok) throw new Error(msg); }
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;
const gap = (a: Readonly<V3>, b: Readonly<V3>) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

console.log('Timeline');

// a short cutscene: a crane, a cut to a fixed shot, a blend into a drifting orbit
function scene() {
    const mech = { position: [0, 3, 0] as V3 };
    const d = new Director();
    d.add('crane', rail(path([[-10, 1, 10], [0, 4, 14], [10, 9, 8]]), { duration: 4, look: mech, lift: 0 }));
    d.add('close', fixed([2, 1, 4], mech, { lift: 0, lag: 0.3 }));
    d.add('spin', orbit(mech, { distance: 10, yaw: 20, drift: 40, lift: 0, ease: 0.2 }));
    const script: Script = {
        name: 'Test',
        tracks: [
            { kind: 'camera', clips: [
                { at: 0, length: 4, shot: 'crane' },
                { at: 4, length: 2, shot: 'close' },
                { at: 6, length: 4, shot: 'spin', blend: 1.5 }
            ] },
            { kind: 'value', name: 'height', keys: [[0, 3], [5, 5, 'linear'], [10, 3]] },
            { kind: 'event', marks: [{ at: 0, name: 'start' }, { at: 6, name: 'fire' }, { at: 10, name: 'end' }] },
            { kind: 'shake', kicks: [{ at: 6, push: [0, 0.3, 0], shape: 'rumble', time: 1 }] }
        ]
    };
    const tl = new Timeline(script, { director: d });
    tl.bind('height', v => { mech.position[1] = v as number; });
    return { d, tl, mech };
}

test('values: held before the first key and after the last, eased between, lists one by one', () => {
    const tl = new Timeline({ tracks: [
        { kind: 'value', name: 'a', keys: [[1, 0], [3, 10, 'linear'], [5, 0, 'cut']] },
        { kind: 'value', name: 'c', keys: [[0, [0, 0, 0]], [2, [1, 2, 4], 'linear']] }
    ] });
    expect(tl.value('a', 0) === 0 && tl.value('a', 9) === 0, 'not held at the ends');
    expect(near(tl.value('a', 2) as number, 5), `linear half way gave ${tl.value('a', 2)}`);
    expect(tl.value('a', 4.9) === 10 && tl.value('a', 5) === 0, 'a cut key should hold, then jump');
    const c = tl.value('c', 1) as number[];
    expect(near(c[0]!, 0.5) && near(c[1]!, 1) && near(c[2]!, 2), `list gave ${c}`);
    expect(tl.length === 5, `length ${tl.length}`);
});

test('playing cuts and blends on time, fires each event once, and ends', () => {
    const { d, tl } = scene();
    const fired: string[] = [], shots: string[] = [];
    let ended = 0;
    tl.onEvent = m => fired.push(`${m.name}@${tl.time.toFixed(2)}`);
    tl.onEnd = () => ended++;
    tl.play(0);
    for (let i = 0; i < 60 * 11; i++) {
        tl.update(1 / 60);
        d.update(1 / 60);
        const live = d.live?.name ?? '';
        if (shots[shots.length - 1] !== live) shots.push(live);
        if (near(tl.time, 6.75, 0.01)) expect(d.blending && d.weightOf('spin') > 0.2 && d.weightOf('spin') < 0.8, 'not half way through the blend');
    }
    expect(shots.join(' ') === 'crane close spin', `shots went ${shots.join(' ')}`);
    expect(fired.length === 3 && fired[0]!.startsWith('start') && fired[1]!.startsWith('fire') && fired[2]!.startsWith('end'), `events: ${fired.join(', ')}`);
    expect(ended === 1 && !tl.playing, 'did not end once');
    expect(d.rate === 1, 'left the director held');
});

test('a seek lands exactly where playing would have, mid-rail, mid-blend and after', () => {
    for (const t of [1.7, 4.5, 6.9, 9.2]) {
        const a = scene(), b = scene();
        a.tl.play(0);
        // in steps that line up with the clips, as a seek does
        for (let i = 0; i < Math.round(t * 60); i++) { a.tl.update(1 / 60); a.d.update(1 / 60); }
        b.tl.seek(t);
        b.d.update(0);
        const off = gap(a.d.view.position, b.d.view.position);
        const turn = Math.abs(a.d.view.rotation.reduce((s, q, i) => s + q * b.d.view.rotation[i]!, 0));
        expect(off < 0.08 && turn > 0.9995, `at ${t}s the seek was ${off.toFixed(3)} away and turned ${(2 * Math.acos(Math.min(1, turn)) * 57.3).toFixed(2)} degrees`);
        expect(near(b.mech.position[1], a.mech.position[1], 1e-3), 'a bound value was not applied');
    }
});

test('seeking fires no events, and paused holds the picture still', () => {
    const { d, tl } = scene();
    let fired = 0;
    tl.onEvent = () => fired++;
    tl.seek(8);
    tl.seek(2);
    expect(fired === 0, 'a seek fired events');
    tl.play();
    for (let i = 0; i < 30; i++) { tl.update(1 / 60); d.update(1 / 60); }
    tl.pause();
    const p = [...d.view.position] as V3;
    for (let i = 0; i < 60; i++) { tl.update(1 / 60); d.update(1 / 60); }
    expect(gap(p, d.view.position) < 1e-9, 'the picture moved while paused');
    expect(near(tl.time, 2.5, 1e-6), `time moved while paused: ${tl.time}`);
});

test('skip jumps to the end and lets go; problems are named', () => {
    const { d, tl } = scene();
    let ended = 0;
    tl.onEnd = () => ended++;
    tl.play(0);
    tl.pause();
    tl.skip();
    expect(ended === 1 && tl.time === tl.length && d.rate === 1, 'skip did not end');
    const bad = new Timeline({ tracks: [{ kind: 'camera', clips: [{ at: 0, length: 3, shot: 'crane' }, { at: 2, length: 1, shot: 'nope', blend: 2 }] }] }, { director: d });
    const p = bad.problems();
    expect(p.length === 3, `problems: ${p.join('; ')}`);
});

test('sounds start on time, part way in after a seek, and stop on pause', () => {
    const log: string[] = [];
    const sounds: SoundPlayer = { play: (s, off) => { log.push(`play ${s} ${off.toFixed(2)}`); return s; }, stop: h => log.push(`stop ${h}`), duration: () => 3 };
    const tl = new Timeline({ length: 10, tracks: [{ kind: 'sound', clips: [{ at: 1, sound: 'drone' }, { at: 5, sound: 'boom', length: 0.5 }] }] }, { sounds });
    tl.play(0);
    for (let i = 0; i < 90; i++) tl.update(1 / 60);
    expect(log[0]?.startsWith('play drone 0.0') ?? false, `first: ${log[0]}`);
    tl.seek(2);
    expect(log.includes('stop drone') && log[log.length - 1] === 'play drone 1.00', `after seek: ${log.join(', ')}`);
    tl.seek(4.5);
    expect(log[log.length - 1] === 'stop drone', 'a sound past its end was started again');
    for (let i = 0; i < 50; i++) tl.update(1 / 60);
    expect(log.some(l => l.startsWith('play boom')), 'boom never played');
    for (let i = 0; i < 40; i++) tl.update(1 / 60);
    expect(log[log.length - 1] === 'stop boom', `boom did not stop after its length: ${log.slice(-3).join(', ')}`);
    tl.pause();
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
