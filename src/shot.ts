// What every shot shares: the subject it's about, the lens, and the rules no shot can break. A shot with a subject
// keeps it on screen, inside `box`, and its camera inside `room` and within `far` of it, every frame, unless it's
// `free`: a cinematic shot that looks away on purpose. A jump in the subject bigger than `teleport` snaps the
// shot's smoothing instead of being read as speed. These were each a way Klipp Lab lost the player.
import { type Frame, type View, project, toView, view as newView } from './frame';
import { type V3, v3, set, copy, sub, add, len, dist, norm, rotate, unrotate, DEG, type Q } from './math';
import { type ShakeStyle, shakeAt } from './shake';
import { Smooth } from './smooth';

/** Something a shot is about. Keep `position` up to date; Grip works out its speed itself. */
export type Subject = {
    position: V3;
    /** Which way it faces, in radians: 0 looks down -z, turning left is positive. Without it, the way it moves. */
    heading?: number;
    /** How big it is, for framing. */
    radius?: number;
};

export type Box = [number, number, number, number, number, number];

export type GuardOptions = {
    /** How far from the middle of the picture the subject may go, 0 to 1 each way. Default 0.8. */
    box?: number;
    /** The furthest the camera may be from the subject. */
    far?: number;
};

export type ShotOptions = {
    /** Vertical field of view, degrees. */
    fov?: number;
    /** Half the view's height, for an orthographic camera. */
    size?: number;
    /** Magnification: 2 is twice as close. */
    zoom?: number;
    /** Roll, in degrees: a dutch angle. */
    dutch?: number;
    /** Slides the picture: [x, y] as shares of half the view. */
    shift?: [number, number];
    /** How high on the subject to keep in view and look at. */
    lift?: number;
    /** Keeps the subject this wide in world units by changing the field of view: move the camera too for a dolly zoom. */
    hold?: number;
    /** A box the camera may not leave: min x, y, z, max x, y, z. */
    room?: Box;
    /** For keeping walls from coming between camera and subject: how far from `from` to `to` the way is clear, 0 to 1, or null if it is. */
    blocked?: (from: Readonly<V3>, to: Readonly<V3>) => number | null;
    /** The closest a wall may push the camera in to its subject. Any closer, and it rises over the wall or swings round it instead. Default 2.5. */
    near?: number;
    /** Continuous shake, like a hand-held camera or an engine. Change `shake.amount` as you go. */
    shake?: ShakeStyle & { amount: number };
    /** The rules: on by default for a shot with a subject. */
    guard?: GuardOptions | false;
    /** A cinematic shot that may look away from its subject. */
    free?: boolean;
    /** A subject jump bigger than this in one frame is a teleport: the shot snaps. Default 6. */
    teleport?: number;
};

export type Ctx = { aspect: number; ortho: boolean; time: number };

/** How often the rules had to step in: a shot that's set up right never trips them. */
export const trips = { box: 0, far: 0, room: 0, wall: 0, final: 0 };

export type Zone = { kind: 'dead' | 'box'; x: number; y: number; w: number; h: number };

export abstract class Shot {
    abstract readonly kind: string;
    name = '';
    subject: Subject | null;
    fov: number;
    size: number;
    zoom: number;
    dutch: number;
    shift: [number, number];
    lift: number;
    hold: number;
    room: Box | null;
    blocked: ShotOptions['blocked'] | null;
    near: number;
    shake: (ShakeStyle & { amount: number }) | null;
    guard: GuardOptions | null;
    free: boolean;
    teleport: number;
    /** The subject's speed, smoothed, as Grip measured it. */
    readonly velocity: V3 = v3();
    /** True for shots that keep a fixed direction (side-on, top-down, group): rules slide them instead of turning them. */
    protected rigid = false;

    private last = v3();
    private seen = false;
    private reach = new Smooth();
    private wallRise = new Smooth();
    private wallSwing = new Smooth();
    private wallAim = { swing: 0, rise: 0 };

    constructor(subject: Subject | null, o: ShotOptions = {}) {
        this.subject = subject;
        this.fov = o.fov ?? 50;
        this.size = o.size ?? 6;
        this.zoom = o.zoom ?? 1;
        this.dutch = o.dutch ?? 0;
        this.shift = o.shift ?? [0, 0];
        this.lift = o.lift ?? 1;
        this.hold = o.hold ?? 0;
        this.room = o.room ?? null;
        this.blocked = o.blocked ?? null;
        this.near = o.near ?? 2.5;
        this.shake = o.shake ?? null;
        this.free = o.free ?? false;
        this.guard = o.guard === false || this.free ? null : { box: 0.8, ...(o.guard ?? {}) };
        this.teleport = o.teleport ?? 6;
    }

    /** Sets the eye, the point looked at and the up. The frame comes in with the lens already set. */
    protected abstract place(f: Frame, dt: number, ctx: Ctx): void;
    /** Forgets any smoothing: the next frame goes straight to where it should be. */
    protected forget(): void {}
    /** Called as the shot goes live, for moves that start over with each showing. */
    wake(): void {}
    /** Its zones on screen, for drawing over the picture. */
    zones(): Zone[] { return this.guard && this.subject ? [{ kind: 'box', x: 0, y: 0, w: this.guard.box! * 2, h: this.guard.box! * 2 }] : []; }

    /** Snaps: for a cut, a teleport, or a fresh start. */
    reset() {
        this.seen = false;
        this.reach.reset();
        this.wallRise.reset();
        this.wallSwing.reset();
        this.wallAim.swing = this.wallAim.rise = 0;
        this.forget();
    }

    /** The point on the subject to keep in view, or null. */
    focus(out: V3): V3 | null {
        if (!this.subject) return null;
        const p = this.subject.position;
        return set(out, p[0], p[1] + this.lift, p[2]);
    }

    private observe(dt: number) {
        const s = this.subject;
        if (!s) return;
        const p = s.position;
        if (!this.seen) { copy(this.last, p); set(this.velocity, 0, 0, 0); this.seen = true; return; }
        if (dist(p, this.last) > this.teleport) {
            // a jump: start again from here rather than read it as speed
            copy(this.last, p);
            set(this.velocity, 0, 0, 0);
            this.forget();
            return;
        }
        if (dt > 0) {
            const k = 1 - Math.exp(-dt / 0.12);
            for (let i = 0; i < 3; i++) this.velocity[i]! += ((p[i]! - this.last[i]!) / dt - this.velocity[i]!) * k;
        }
        copy(this.last, p);
    }

    /** Builds this frame of the shot. */
    update(f: Frame, dt: number, ctx: Ctx) {
        this.observe(dt);
        set(f.up, 0, 1, 0);
        f.roll = 0;
        f.fov = this.fov;
        f.size = this.size;
        f.shift[0] = this.shift[0];
        f.shift[1] = this.shift[1];
        set(f.wobble, 0, 0, 0);
        set(f.nudge, 0, 0, 0);
        this.place(f, dt, ctx);
        const focus = this.focus(fp);
        if (focus && this.hold > 0) {
            const d = dist(f.eye, focus);
            if (ctx.ortho) f.size = this.hold / 2 / ctx.aspect;
            else if (d > 1e-3) f.fov = Math.max(1, Math.min(150, (2 * Math.atan(this.hold / 2 / ctx.aspect / d)) / DEG));
        }
        if (this.zoom !== 1 && this.zoom > 0) {
            f.fov = (2 * Math.atan(Math.tan((f.fov * DEG) / 2) / this.zoom)) / DEG;
            f.size /= this.zoom;
        }
        f.roll += this.dutch;
        if (this.room) clampRoom(f, this.room, this.rigid, 'room');
        if (focus && this.blocked) this.unblock(f, focus, dt);
        if (focus && this.guard) keep(f, focus, this.guard, ctx, this.rigid, 'box');
        if (this.shake && this.shake.amount > 0) shakeAt(f.wobble, f.nudge, ctx.time, this.shake.amount, this.shake, this.name.length * 13.1);
    }

    // Walls between camera and subject. A wall far enough off, the camera comes in in front of it: quickly in, slowly
    // back out. One so close to the subject that coming in would put the camera on top of it, the camera rises over
    // it or swings round it instead, the least it can, and never comes closer than `near`. It looks a moment ahead,
    // where the subject's going, so it starts round a wall before the wall's in the way, and goes round the side
    // that stays clear.
    private unblock(f: Frame, focus: V3, dt: number) {
        const test = this.blocked!, near = this.near;
        if (dist(f.eye, focus) < 1e-3) return;
        // how close a wall lets the camera come, looking from `from` out to `e`: the whole way if nothing's in it
        const clear = (from: Readonly<V3>, e: Readonly<V3>) => { const k = test(from, e), d = dist(e, from); return k === null ? d : d * k - 0.3; };
        sub(tmp, f.eye, focus);
        // the camera swung round the subject and raised
        const out = (o: V3, swing: number, rise: number) => {
            const c = Math.cos(swing), s = Math.sin(swing);
            return set(o, focus[0] + tmp[0] * c + tmp[2] * s, focus[1] + tmp[1] + rise, focus[2] - tmp[0] * s + tmp[2] * c);
        };
        // and the same a moment from now
        const v = this.velocity, moving = Math.hypot(v[0], v[2]) > 0.5;
        set(ahead, v[0] * LOOK_AHEAD, 0, v[2] * LOOK_AHEAD);
        add(soon, focus, ahead);
        const fine = (swing: number, rise: number, both: boolean) => {
            if (clear(focus, out(probe, swing, rise)) < near) return false;
            return !both || clear(soon, add(probe, probe, ahead)) >= near;
        };
        const aim = this.wallAim;
        const now = fine(0, 0, false), later = !moving || fine(0, 0, true);
        if (now && later) aim.swing = aim.rise = 0;
        else {
            // the cheapest way round that's clear now and in a moment; failing that, now; failing that, stay put.
            // Once it's gone round one side it stays that side: crossing to the other would sweep through the wall.
            const sw0 = this.wallSwing.value, side = sw0 < 0 ? -1 : 1, held = Math.abs(sw0) > 10 * DEG;
            let found = false;
            for (const both of moving ? [true, false] : [false]) {
                for (const sides of held ? [[side], [-side]] : [[side, -side]]) {
                    for (const [sw, ri] of AROUND) {
                        for (const sg of sw ? sides : [1]) {
                            if (fine(sw * sg, ri, both)) { aim.swing = sw * sg; aim.rise = ri; found = true; break; }
                        }
                        if (found) break;
                    }
                    if (found) break;
                }
                if (found) break;
            }
            if (!found && now) aim.swing = aim.rise = 0;
        }
        // get there smoothly: away from a wall quickly, back again slowly, and not back through it: if the next step
        // home is in the wall and this one isn't, wait here
        const sw0 = this.wallSwing.value, ri0 = this.wallRise.value;
        this.wallSwing.to(aim.swing, Math.abs(aim.swing) > Math.abs(sw0) ? 0.12 : 0.7, dt);
        this.wallRise.to(aim.rise, aim.rise > ri0 ? 0.12 : 0.7, dt);
        const homeward = Math.abs(this.wallSwing.value) < Math.abs(sw0) || this.wallRise.value < ri0;
        if (homeward && clear(focus, out(probe, this.wallSwing.value, this.wallRise.value)) < near && clear(focus, out(probe, sw0, ri0)) >= near) {
            this.wallSwing.snap(sw0);
            this.wallRise.snap(ri0);
        }
        out(f.eye, this.wallSwing.value, this.wallRise.value);
        // and on the way, still never see through a wall
        const full = dist(f.eye, focus);
        const want = Math.max(Math.min(near, full), Math.min(full, clear(focus, f.eye)));
        const at = Number.isFinite(this.reach.value) && this.reach.value > 0 ? this.reach.value : full;
        if (want < at) this.reach.snap(Math.max(want, at - (at - want) * Math.min(1, dt * 25)));
        else this.reach.to(want, 0.5, dt);
        const r = Math.min(this.reach.value, full) / full;
        sub(tmp, f.eye, focus);
        set(f.eye, focus[0] + tmp[0] * r, focus[1] + tmp[1] * r, focus[2] + tmp[2] * r);
        if (aim.swing || aim.rise) trips.wall++;
    }
}

const LOOK_AHEAD = 0.4;

// ways round a wall, cheapest first: a swing round the subject (radians) and a rise (world units)
const AROUND: [number, number][] = (() => {
    const all: [number, number, number][] = [];
    for (const sw of [0, 20, 40, 60, 80, 100]) for (const ri of [0, 1.5, 3, 5, 8]) if (sw || ri) all.push([sw * DEG, ri, sw / 30 + ri / 3]);
    return all.sort((a, b) => a[2] - b[2]).map(([sw, ri]) => [sw, ri]);
})();

const fp = v3(), tmp = v3(), d1 = v3(), p1 = v3(), probe = v3(), ahead = v3(), soon = v3();
const probeView: View = newView();

export function clampRoom(f: Frame, room: Box, rigid: boolean, tally: keyof typeof trips) {
    const e = f.eye;
    let dx = 0, dy = 0, dz = 0;
    const c = (i: number) => Math.min(room[i + 3]!, Math.max(room[i]!, e[i]!)) - e[i]!;
    dx = c(0); dy = c(1); dz = c(2);
    if (!dx && !dy && !dz) return;
    e[0] += dx; e[1] += dy; e[2] += dz;
    if (rigid) { f.at[0] += dx; f.at[1] += dy; f.at[2] += dz; }
    trips[tally]++;
}

/**
 * Keeps `focus` on screen: inside `box`, and the camera within `far`. Turns the camera the least it needs (moving
 * the point it looks at), or for a rigid shot slides it. Leaves the frame alone when all's well.
 */
export function keep(f: Frame, focus: Readonly<V3>, g: GuardOptions, ctx: Ctx, rigid: boolean, tally: keyof typeof trips) {
    const box = g.box ?? 0.8;
    if (g.far && dist(f.eye, focus) > g.far) {
        sub(d1, f.eye, focus);
        const k = g.far / len(d1);
        const ex = focus[0] + d1[0] * k - f.eye[0], ey = focus[1] + d1[1] * k - f.eye[1], ez = focus[2] + d1[2] * k - f.eye[2];
        f.eye[0] += ex; f.eye[1] += ey; f.eye[2] += ez;
        if (rigid) { f.at[0] += ex; f.at[1] += ey; f.at[2] += ez; }
        trips[tally === 'final' ? 'final' : 'far']++;
    }
    let tripped = false;
    for (let pass = 0; pass < 3; pass++) {
        probeView.aspect = ctx.aspect;
        probeView.ortho = ctx.ortho;
        toView(probeView, f);
        const s = project(probeView, focus, p1);
        // where it is in the picture, shift and all
        const behind = s[2] <= 1e-3;
        const sx = s[0], sy = s[1];
        const cx = Math.max(-box, Math.min(box, sx)), cy = Math.max(-box, Math.min(box, sy));
        if (!behind && cx === sx && cy === sy) break;
        tripped = true;
        if (behind && !rigid) { copy(f.at, focus); continue; }
        const q = probeView.rotation as Q;
        if (rigid || ctx.ortho) {
            // slide in the camera's own plane, at the subject's depth
            const depth = Math.max(1e-3, s[2]);
            const hw = ctx.ortho ? probeView.size * ctx.aspect : depth * Math.tan((probeView.fov * DEG) / 2) * ctx.aspect;
            const hh = ctx.ortho ? probeView.size : depth * Math.tan((probeView.fov * DEG) / 2);
            rotate(d1, q, [(sx - cx) * hw, (sy - cy) * hh, 0]);
            add(f.eye, f.eye, d1);
            add(f.at, f.at, d1);
            continue;
        }
        // turn: aim at the point that puts the subject on the edge of the box
        const th = Math.tan((probeView.fov * DEG) / 2), tw = th * ctx.aspect;
        sub(d1, focus, f.eye);
        unrotate(d1, q, d1);
        // where the subject is, and where it should be, as directions from the camera
        const want = norm(v3(), [(cx - f.shift[0]) * tw, (cy - f.shift[1]) * th, -1]);
        const have = norm(v3(), d1);
        // turn the camera by what takes where it should be onto where it is, and the subject lands where it should
        const r = fromTo(want, have);
        const fwd = unrotate(v3(), q, sub(v3(), f.at, f.eye));
        rotate(fwd, r, fwd);
        rotate(fwd, q, fwd);
        add(f.at, f.eye, fwd);
    }
    if (tripped) trips[tally]++;
}

function fromTo(a: Readonly<V3>, b: Readonly<V3>): Q {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (d < -0.9999) return [0, 1, 0, 0];
    const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0], w = 1 + d;
    const l = Math.hypot(x, y, z, w);
    return [x / l, y / l, z / l, w / l];
}

