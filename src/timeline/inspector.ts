// A look inside a timeline, for people and for tools: every track laid out against time, what's on now, and the
// playhead. Read-only: you can play, pause and scrub it, never change it. Drag anywhere on the tracks to scrub.
//
// It's a plain element: put it where you like. Its colours are CSS variables on `.grip-timeline`.
import { type SoundTrack, type Timeline, type Track, type Value } from './timeline';

export type InspectorOptions = {
    /** Where it goes. Default document.body. */
    parent?: HTMLElement;
    /** Names to show for tracks, by track name. */
    labels?: Record<string, string>;
};

export type Inspector = {
    el: HTMLElement;
    /** Shows or hides it. */
    show(on: boolean): void;
    /** Takes it off the page for good. */
    stop(): void;
};

const LABEL = 132, RULER = 20, LANE = 24, ROW = 14;

const CSS = `
.grip-timeline { --grip-accent: #fffc00; --grip-ink: #e8e8ee; --grip-dim: rgba(232,232,238,0.45); --grip-clip: rgba(255,255,255,0.13);
  --grip-lane: rgba(255,255,255,0.035); --grip-bg: rgba(22,22,28,0.82);
  background: var(--grip-bg); color: var(--grip-ink); font: 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); user-select: none; -webkit-user-select: none; touch-action: none; }
.grip-timeline[hidden] { display: none; }
.grip-timeline header { display: flex; align-items: center; gap: 10px; height: 28px; padding: 0 10px; }
.grip-timeline header b { font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grip-timeline header button { all: unset; cursor: pointer; width: 22px; height: 22px; display: grid; place-items: center; color: var(--grip-ink); }
.grip-timeline header button:hover { color: var(--grip-accent); }
.grip-timeline header button svg { width: 12px; height: 12px; fill: currentColor; }
.grip-timeline header span { color: var(--grip-dim); font-variant-numeric: tabular-nums; }
.grip-timeline canvas { display: block; width: 100%; cursor: ew-resize; }
`;

const PLAY = '<svg viewBox="0 0 12 12"><path d="M2 1l9 5-9 5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 12 12"><path d="M2 1h3v10H2zM7 1h3v10H7z"/></svg>';
const START = '<svg viewBox="0 0 12 12"><path d="M1 1h2v10H1zM11 1v10L4 6z"/></svg>';

export function inspector(tl: Timeline, o: InspectorOptions = {}): Inspector {
    if (!document.getElementById('grip-timeline-css')) {
        const style = document.createElement('style');
        style.id = 'grip-timeline-css';
        style.textContent = CSS;
        document.head.append(style);
    }
    const el = document.createElement('div');
    el.className = 'grip-timeline';
    el.innerHTML = `<header><button data-k="start" title="Start">${START}</button><button data-k="play" title="Play">${PLAY}</button><b></b><span></span></header><canvas></canvas>`;
    (o.parent ?? document.body).append(el);
    const [startBtn, playBtn] = el.querySelectorAll('button');
    const title = el.querySelector('b')!, clock = el.querySelector('span')!;
    const canvas = el.querySelector('canvas')!;
    const g = canvas.getContext('2d')!;
    title.textContent = tl.name;
    const tracks = tl.script.tracks;
    // sounds that overlap stack, as in an editor, and their lane grows to fit
    const placeSounds = (t: SoundTrack) => {
        const ends: number[] = [];
        const placed = t.clips.map(k => {
            const len = k.length ?? Math.max(0.1, (tl.sounds?.duration?.(k.sound) ?? 1) - (k.offset ?? 0));
            let row = ends.findIndex(e => e <= k.at + 1e-6);
            if (row < 0) row = ends.push(0) - 1;
            ends[row] = k.at + len;
            return { k, len, row };
        });
        return { placed, rows: Math.max(1, ends.length) };
    };
    const laneOf = (t: Track) => (t.kind === 'sound' ? LANE + (placeSounds(t).rows - 1) * ROW : LANE);
    let height = 0;
    const fit = () => {
        const h = RULER + tracks.reduce((s, t) => s + laneOf(t), 0) + 6;
        if (h !== height) { height = h; canvas.style.height = `${h}px`; }
    };
    fit();

    startBtn!.addEventListener('click', () => tl.seek(0));
    playBtn!.addEventListener('click', () => (tl.playing ? tl.pause() : tl.play()));

    // scrubbing: pauses while held, carries on after if it was playing
    let scrub: { was: boolean } | null = null;
    const timeAt = (x: number) => ((x - LABEL) / Math.max(1, canvas.clientWidth - LABEL - 12)) * tl.length;
    canvas.addEventListener('pointerdown', e => {
        if (e.offsetX < LABEL - 8) return;
        scrub = { was: tl.playing };
        if (tl.playing) tl.pause();
        canvas.setPointerCapture(e.pointerId);
        tl.seek(timeAt(e.offsetX));
    });
    canvas.addEventListener('pointermove', e => { if (scrub) tl.seek(timeAt(e.offsetX)); });
    const up = () => { if (scrub?.was) tl.play(); scrub = null; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    let raf = 0, playing: boolean | null = null;
    const frame = () => {
        raf = requestAnimationFrame(frame);
        if (el.hidden) return;
        if (tl.playing !== playing) { playing = tl.playing; playBtn!.innerHTML = playing ? PAUSE : PLAY; playBtn!.title = playing ? 'Pause' : 'Play'; }
        clock.textContent = `${tl.time.toFixed(2)} / ${tl.length.toFixed(2)}`;
        draw();
    };
    raf = requestAnimationFrame(frame);

    const css = getComputedStyle(el);
    const colour = (name: string) => css.getPropertyValue(name).trim();
    function draw() {
        fit();
        const dpr = Math.min(2, devicePixelRatio || 1), w = canvas.clientWidth;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(height * dpr); }
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, height);
        const span = Math.max(1, w - LABEL - 12), L = tl.length || 1;
        const X = (t: number) => LABEL + (t / L) * span;
        const accent = colour('--grip-accent'), ink = colour('--grip-ink'), dim = colour('--grip-dim'), clip = colour('--grip-clip'), lane = colour('--grip-lane');
        g.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
        g.textBaseline = 'middle';

        // the ruler: a tick a second, a number where there's room
        const every = [0.5, 1, 2, 5, 10, 30, 60].find(s => (s / L) * span >= 34) ?? 60;
        g.fillStyle = dim;
        for (let s = 0; s <= L + 1e-6; s += every) {
            const x = X(s);
            g.fillRect(Math.round(x), RULER - 5, 1, 5);
            g.fillText(fmt(s), x + 3, RULER / 2 - 1);
        }

        const state = tl.inspect();
        let y = RULER;
        for (const t of tracks) {
            const lh = laneOf(t);
            g.fillStyle = lane;
            g.fillRect(LABEL, y + 2, span, lh - 4);
            g.fillStyle = dim;
            const label = o.labels?.[t.name ?? ''] ?? t.name ?? t.kind;
            g.fillText(trim(label, 12), 10, y + LANE / 2);
            drawTrack(t, y, lh, X, { accent, ink, dim, clip }, state);
            y += lh;
        }

        // the playhead
        const x = Math.round(X(tl.time)) + 0.5;
        g.strokeStyle = accent;
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, RULER - 6); g.lineTo(x, height - 4); g.stroke();
        g.fillStyle = accent;
        g.beginPath(); g.moveTo(x - 4, RULER - 8); g.lineTo(x + 4, RULER - 8); g.lineTo(x, RULER - 3); g.fill();
    }

    type Ink = { accent: string; ink: string; dim: string; clip: string };
    function drawTrack(t: Track, y: number, lh: number, X: (t: number) => number, c: Ink, state: ReturnType<Timeline['inspect']>) {
        const top = y + 4, h = lh - 8, mid = y + lh / 2;
        if (t.kind === 'camera') {
            const on = tl.cameraTrack === t ? state.shot : null;
            for (const k of t.clips) {
                const x0 = X(k.at), x1 = X(k.at + k.length);
                // lit while it's the one on screen: once the timeline's over, the game's camera may have taken over
                const live = on === k.shot && (!tl.director || tl.director.live?.name === k.shot) && tl.time >= k.at && tl.time < k.at + k.length + 1e-6;
                g.fillStyle = live ? c.accent : c.clip;
                g.globalAlpha = live ? 0.28 : 1;
                g.fillRect(x0 + 1, top, Math.max(1, x1 - x0 - 2), h);
                g.globalAlpha = 1;
                if (k.blend) {
                    // the blend in, as a ramp
                    g.fillStyle = c.dim;
                    g.globalAlpha = 0.35;
                    g.beginPath(); g.moveTo(x0 + 1, top + h); g.lineTo(X(k.at + k.blend), top); g.lineTo(x0 + 1, top); g.fill();
                    g.globalAlpha = 1;
                }
                g.fillStyle = live ? c.accent : c.ink;
                clipText(k.shot, x0 + 5, x1 - 3, mid);
            }
        } else if (t.kind === 'value') {
            const keys = t.keys;
            if (!keys.length) return;
            const nums = (v: Value) => (typeof v === 'number' ? [v] : v);
            let lo = Infinity, hi = -Infinity;
            const n = Math.max(...keys.map(k => nums(k[1]).length));
            const samples: number[][] = [];
            const x0 = X(0), x1 = X(tl.length);
            for (let x = x0; x <= x1 + 0.5; x += 2) {
                const v = nums(tl.value(t.name, ((x - x0) / Math.max(1, x1 - x0)) * tl.length)!);
                samples.push(v);
                for (const a of v) { lo = Math.min(lo, a); hi = Math.max(hi, a); }
            }
            const Y = (v: number) => (hi - lo < 1e-9 ? mid : top + h - ((v - lo) / (hi - lo)) * h);
            g.lineWidth = 1.25;
            for (let j = 0; j < n; j++) {
                g.strokeStyle = c.ink;
                g.globalAlpha = j === 0 ? 0.85 : 0.45;
                g.beginPath();
                samples.forEach((v, s) => { const x = x0 + s * 2, yy = Y(v[j] ?? v[0]!); if (s) g.lineTo(x, yy); else g.moveTo(x, yy); });
                g.stroke();
            }
            g.globalAlpha = 1;
            g.fillStyle = c.ink;
            for (const k of keys) {
                const x = X(k[0]), yy = Y(nums(k[1])[0]!);
                g.beginPath(); g.moveTo(x, yy - 3.5); g.lineTo(x + 3.5, yy); g.lineTo(x, yy + 3.5); g.lineTo(x - 3.5, yy); g.fill();
            }
            // what it is now, beside its name
            const v = state.values[t.name];
            if (v !== undefined) { g.fillStyle = c.ink; g.textAlign = 'right'; g.fillText(show(v), LABEL - 8, mid); g.textAlign = 'left'; }
        } else if (t.kind === 'sound') {
            const { placed, rows } = placeSounds(t);
            const rh = h / rows;
            for (const { k, len, row } of placed) {
                const x0 = X(k.at), x1 = X(Math.min(tl.length, k.at + len)), live = state.sounds.includes(k.sound) && tl.time >= k.at && tl.time < k.at + len;
                const y0 = top + row * rh;
                g.fillStyle = live ? c.accent : c.clip;
                g.globalAlpha = live ? 0.28 : 1;
                g.fillRect(x0 + 1, y0 + 0.5, Math.max(2, x1 - x0 - 2), rh - 1);
                g.globalAlpha = 1;
                g.fillStyle = live ? c.accent : c.ink;
                if (rh >= 9) clipText(k.sound, x0 + 5, x1 - 3, y0 + rh / 2);
            }
        } else if (t.kind === 'event') {
            for (const m of t.marks) {
                const x = Math.round(X(m.at)) + 0.5, past = tl.time >= m.at;
                g.strokeStyle = past ? c.accent : c.ink;
                g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + h); g.stroke();
                g.fillStyle = past ? c.accent : c.ink;
                g.fillText(m.name, x + 4, mid);
            }
        } else {
            for (const k of t.kicks) {
                const x0 = X(k.at), x1 = Math.max(x0 + 3, X(k.at + (k.time ?? 0.4))), past = tl.time >= k.at;
                g.fillStyle = past ? c.accent : c.ink;
                g.globalAlpha = 0.7;
                g.beginPath(); g.moveTo(x0, top + h);
                for (let s = 0; s <= 12; s++) { const u = s / 12; g.lineTo(x0 + (x1 - x0) * u, top + h - Math.sin(Math.PI * u) * h * (1 - u * 0.6)); }
                g.fill();
                g.globalAlpha = 1;
            }
        }
    }
    function clipText(text: string, x0: number, x1: number, y: number) {
        if (x1 - x0 < 14) return;
        g.save();
        g.beginPath(); g.rect(x0, y - 8, x1 - x0, 16); g.clip();
        g.fillText(text, x0, y);
        g.restore();
    }

    return {
        el,
        show(on) { el.hidden = !on; },
        stop() { cancelAnimationFrame(raf); el.remove(); }
    };
}

const fmt = (s: number) => (s % 1 ? s.toFixed(1) : String(s));
const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const show = (v: Value) => (typeof v === 'number' ? num(v) : v.map(num).join(' '));
const num = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
