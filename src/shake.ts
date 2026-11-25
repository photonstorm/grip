// Shake. Continuous shake is smooth noise scaled by an amount; trauma is shake that's added by hits and fades on
// its own, felt as its square so small knocks stay small. Kicks are one-off pushes from a place in the world that
// travel outwards at a speed, so a far camera feels a blast later and less. All of it runs on the game's clock:
// pause the game, or slow it, and the shake goes with it. Klipp's impulses ran on the wall clock.
import { type V3, v3, dist } from './math';

// smooth 1D noise, -1 to 1
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
export function noise(x: number): number {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return hash(i) * (1 - u) + hash(i + 1) * u;
}

export type ShakeStyle = {
    /** Most turn, in degrees: yaw, pitch, roll. */
    angle?: V3;
    /** Most move, in world units: right, up, back. */
    move?: V3;
    /** How fast it wanders, roughly shakes a second. */
    speed?: number;
};

/** Writes one moment of shake at strength `k` into a wobble and a nudge. */
export function shakeAt(wobble: V3, nudge: V3, t: number, k: number, style: ShakeStyle, seed = 0) {
    if (k <= 0) return;
    const a = style.angle ?? [1.5, 1.5, 2], m = style.move ?? [0.05, 0.05, 0], s = style.speed ?? 12, x = t * s;
    wobble[0] += a[0] * k * noise(x + seed);
    wobble[1] += a[1] * k * noise(x + seed + 31.7);
    wobble[2] += a[2] * k * noise(x + seed + 63.1);
    nudge[0] += m[0] * k * noise(x + seed + 97.3);
    nudge[1] += m[1] * k * noise(x + seed + 123.9);
    nudge[2] += m[2] * k * noise(x + seed + 151.1);
}

export type KickShape = 'bump' | 'boom' | 'recoil' | 'rumble';
const shapes: Record<KickShape, (t: number) => number> = {
    // up and back down
    bump: t => Math.sin(Math.PI * t) * (1 - t),
    // a hard hit, then a few dying wobbles
    boom: t => Math.exp(-4 * t) * Math.sin(t * Math.PI * 7) * (1 - t),
    // snaps back, eases forward
    recoil: t => (t < 0.12 ? t / 0.12 : Math.exp(-(t - 0.12) * 6)),
    rumble: t => Math.sin(t * Math.PI * 23) * Math.sin(Math.PI * t)
};

export type Kick = {
    /** Where it starts, in the world. Leave it out for a kick felt the same everywhere, like recoil. */
    from?: V3;
    /** Which way and how far it pushes the camera at its height, in the camera's own space: right, up, back. */
    push: V3;
    /** How it rises and falls. */
    shape?: KickShape;
    /** Seconds it lasts. */
    time?: number;
    /** Units a second it travels out from `from`. Infinity is felt at once. */
    speed?: number;
    /** Full strength within this distance. */
    radius?: number;
    /** It fades to nothing over this far beyond `radius`. */
    fade?: number;
    /** Trauma it leaves behind as well, 0 to 1, for a rattle on top of the push. */
    trauma?: number;
};

type Live = Required<Omit<Kick, 'from'>> & { from: V3 | null; born: number; felt: boolean };

export class Shaker {
    /** 0 to 1. Fades on its own. */
    trauma = 0;
    /** Trauma lost a second. */
    recover = 1.2;
    style: ShakeStyle = { angle: [2.5, 2.5, 3.5], move: [0.12, 0.12, 0.08], speed: 14 };
    private kicks: Live[] = [];
    private clock = 0;

    kick(k: Kick) {
        this.kicks.push({
            from: k.from ? [...k.from] : null, push: [...k.push], shape: k.shape ?? 'bump', time: k.time ?? 0.4,
            speed: k.speed ?? Infinity, radius: k.radius ?? 0, fade: k.fade ?? 0, trauma: k.trauma ?? 0, born: this.clock, felt: false
        });
    }
    add(trauma: number) { this.trauma = Math.min(1, this.trauma + trauma); }
    /** Stops every kick and all trauma at once. */
    clear() { this.kicks.length = 0; this.trauma = 0; }

    /** Advances the clock and writes this moment's shake for a camera at `eye`. */
    apply(dt: number, eye: Readonly<V3>, wobble: V3, nudge: V3) {
        this.clock += dt;
        this.trauma = Math.min(1, Math.max(0, this.trauma - this.recover * Math.max(0, dt)));
        for (let i = this.kicks.length - 1; i >= 0; i--) {
            const k = this.kicks[i]!;
            const d = k.from ? dist(k.from, eye) : 0;
            const arrive = k.born + (Number.isFinite(k.speed) ? d / k.speed : 0);
            const t = (this.clock - arrive) / k.time;
            if (t > 1) { this.kicks.splice(i, 1); continue; }
            if (t < 0) continue;
            const strength = k.from && k.fade > 0 ? Math.max(0, 1 - Math.max(0, d - k.radius) / k.fade) : k.from && k.fade === 0 && k.radius > 0 && d > k.radius ? 0 : 1;
            if (!k.felt) { k.felt = true; this.add(k.trauma * strength); }
            const s = shapes[k.shape](t) * strength;
            nudge[0] += k.push[0] * s; nudge[1] += k.push[1] * s; nudge[2] += k.push[2] * s;
        }
        const k = this.trauma * this.trauma;
        shakeAt(wobble, nudge, this.clock, k, this.style, 7.7);
    }
}

export const ZERO: Readonly<V3> = v3();
