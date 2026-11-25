// The shots. Each one is a way of placing a camera; the lens, the rules and shake come from Shot.
//
//   follow  behind a subject that moves and turns: chase cameras, third person
//   orbit   round a point or subject, turned by the player or by code: third person, viewers, menus
//   side    a fixed direction, sliding to keep the subject in a dead zone: side-on, top-down, 2D
//   fixed   a camera that stays put and turns to watch: security cameras, survival horror rooms
//   rail    along a path: cranes, dollies, fly-throughs, coasters, tracking shots
//   look    first person, from a head
//   group   fits several subjects in the picture: brawlers, co-op
//   still   a locked-off shot
import { type Frame } from './frame';
import { type Path } from './path';
import { type Ctx, Shot, type ShotOptions, type Subject, type Zone } from './shot';
import { Smooth, SmoothAngle, SmoothV3 } from './smooth';
import { type V3, v3, set, copy, add, sub, scale, addScaled, dot, cross, norm, len, lerp, clamp, turn, heading, headingOf, DEG, type Ease, ease as eases } from './math';

const tmp = v3(), tmp2 = v3(), tmp3 = v3();

/** The forward, right and up of a camera facing `yaw` (radians, 0 down -z) pitched `pitch` (radians, up positive). */
function basis(yaw: number, pitch: number, f: V3, r: V3, u: V3) {
    const cp = Math.cos(pitch);
    set(f, -Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    set(r, Math.cos(yaw), 0, -Math.sin(yaw));
    cross(u, r, f);
}

// ------------------------------------------------------------------------------------------------ follow

export type FollowOptions = ShotOptions & {
    /** How far behind. */
    distance?: number;
    /** How far above. */
    height?: number;
    /** How far to the side: positive is right, for an over-the-shoulder look. */
    side?: number;
    /** Seconds of the subject's movement to look ahead by. */
    ahead?: number;
    /** Seconds the camera takes to catch up where it should be. */
    lag?: number;
    /** The furthest it may ever trail, whatever the speed. */
    leash?: number;
    /** Seconds it takes to swing round behind as the subject turns. */
    swing?: number;
    /** The most it may lag the subject's turning, in degrees. */
    maxSwing?: number;
};

export class Follow extends Shot {
    readonly kind = 'follow';
    distance: number; height: number; side: number; ahead: number; lag: number; leash: number; swing: number; maxSwing: number;
    private eye = new SmoothV3();
    private aim = new SmoothV3();
    private dir = new SmoothAngle();
    private facing = 0;
    constructor(subject: Subject, o: FollowOptions = {}) {
        super(subject, o);
        this.distance = o.distance ?? 8; this.height = o.height ?? 3; this.side = o.side ?? 0; this.ahead = o.ahead ?? 0;
        this.lag = o.lag ?? 0.05; this.leash = o.leash ?? 1.5; this.swing = o.swing ?? 0.15; this.maxSwing = o.maxSwing ?? 30;
    }
    protected override forget() { this.eye.reset(); this.aim.reset(); this.dir.reset(); }
    protected place(f: Frame, dt: number) {
        const s = this.subject!, p = s.position, v = this.velocity;
        const speed = Math.hypot(v[0], v[2]);
        if (s.heading !== undefined) this.facing = s.heading;
        else if (speed > 0.5) this.facing = headingOf(v);
        // swing round behind, never more than maxSwing late
        let h = this.dir.to(this.facing, this.swing, dt);
        const late = turn(this.facing, h), most = this.maxSwing * DEG;
        if (Math.abs(late) > most) { h = this.facing + Math.sign(late) * most; this.dir.snap(h); }
        heading(tmp, h);
        set(tmp2, Math.cos(h), 0, -Math.sin(h));
        set(tmp3, p[0] - tmp[0] * this.distance + tmp2[0] * this.side, p[1] + this.height, p[2] - tmp[2] * this.distance + tmp2[2] * this.side);
        copy(f.eye, this.eye.to(tmp3, this.lag, dt, this.leash));
        set(tmp3, p[0] + v[0] * this.ahead, p[1] + this.lift + v[1] * this.ahead * 0.3, p[2] + v[2] * this.ahead);
        copy(f.at, this.aim.to(tmp3, this.lag, dt, this.leash));
    }
}

// ------------------------------------------------------------------------------------------------ orbit

export type OrbitOptions = ShotOptions & {
    /** Where it starts: degrees round (0 is behind something facing -z), degrees up, and how far. */
    yaw?: number;
    pitch?: number;
    distance?: number;
    pitchRange?: [number, number];
    distanceRange?: [number, number];
    /** Seconds to catch up a moving subject. */
    lag?: number;
    leash?: number;
    /** Seconds the turns and zooms take to settle: 0 follows the hand exactly. */
    ease?: number;
    /** Degrees a second it turns by itself once nobody's touching it. */
    drift?: number;
    /** Where the centre may be panned to: min x, y, z, max x, y, z. */
    panRoom?: [number, number, number, number, number, number];
    /** Pans along the ground, as a map does: up the picture moves the centre forward, not up. */
    flat?: boolean;
};

export class Orbit extends Shot {
    readonly kind = 'orbit';
    /** The point it orbits when there's no subject. */
    readonly center: V3 = v3();
    /** How far it's been panned from the subject or centre. */
    readonly pan: V3 = v3();
    yaw: number; pitch: number; distance: number;
    pitchRange: [number, number]; distanceRange: [number, number];
    lag: number; leash: number; ease: number; drift: number; panRoom: OrbitOptions['panRoom'] | null; flat: boolean;
    /** Seconds since the player last touched it. */
    idle = 99;
    private sy = new SmoothAngle(); private sp = new Smooth(); private sd = new Smooth();
    private c = new SmoothV3();
    private easeTo: { yaw: number; pitch: number; distance: number; pan: V3; time: number } | null = null;
    constructor(subject: Subject | null, o: OrbitOptions = {}) {
        super(subject, o);
        this.yaw = o.yaw ?? 0; this.pitch = o.pitch ?? 20; this.distance = o.distance ?? 10;
        this.pitchRange = o.pitchRange ?? [-10, 80]; this.distanceRange = o.distanceRange ?? [2, 60];
        this.lag = o.lag ?? 0.1; this.leash = o.leash ?? 2; this.ease = o.ease ?? 0.08; this.drift = o.drift ?? 0;
        this.panRoom = o.panRoom ?? null;
        this.flat = o.flat ?? false;
    }
    protected override forget() { this.sy.reset(); this.sp.reset(); this.sd.reset(); this.c.reset(); }
    /** Turns it, in degrees: right and up. */
    turn(yaw: number, pitch: number) { this.yaw -= yaw; this.pitch += pitch; this.idle = 0; this.easeTo = null; this.clampAxes(); }
    /** Zooms by a factor: 2 is twice as close. */
    zoomBy(k: number) { this.distance /= k; this.idle = 0; this.easeTo = null; this.clampAxes(); }
    /** Pans the centre across the picture, in world units: right and up as the camera sees them. */
    panBy(right: number, up: number) {
        const y = this.yaw * DEG;
        this.pan[0] += Math.cos(y) * right;
        this.pan[2] += -Math.sin(y) * right;
        if (this.flat) {
            // up the picture is forward along the ground; scaled, as the ground is seen at a slant
            const k = 1 / Math.max(0.2, Math.sin(this.pitch * DEG));
            this.pan[0] += -Math.sin(y) * up * k;
            this.pan[2] += -Math.cos(y) * up * k;
        } else this.pan[1] += up;
        this.idle = 0;
        this.easeTo = null;
    }
    /** Eases to a view over `time` seconds: degrees round, up, a distance, and a pan. */
    goTo(yaw: number, pitch: number, distance: number, pan: Readonly<V3> = this.pan, time = 0.6) {
        this.easeTo = { yaw, pitch, distance, pan: [...pan], time };
    }
    /** Swings round behind the subject over `time` seconds. */
    behind(time = 0.6) {
        const h = this.subject?.heading ?? (Math.hypot(this.velocity[0], this.velocity[2]) > 0.5 ? headingOf(this.velocity) : this.yaw * DEG);
        this.goTo(h / DEG, this.pitch, this.distance, this.pan, time);
    }
    /** Fits a sphere in the picture, keeping the angle. */
    fit(center: Readonly<V3>, radius: number, fov = this.fov, time = 0.6) {
        const base = this.subject ? this.subject.position : this.center;
        const d = radius / Math.sin((fov * DEG) / 2);
        this.goTo(this.yaw, this.pitch, d, [center[0] - base[0], center[1] - base[1] - (this.subject ? this.lift : 0), center[2] - base[2]], time);
    }
    /** The way the camera faces: flat for walking the way it looks. */
    forward(out: V3, flat = true): V3 {
        const y = this.sy.value, p = flat ? 0 : -this.sp.value;
        return set(out, -Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
    }
    private clampAxes() {
        this.pitch = clamp(this.pitch, this.pitchRange[0], this.pitchRange[1]);
        this.distance = clamp(this.distance, this.distanceRange[0], this.distanceRange[1]);
        if (this.panRoom) for (let i = 0; i < 3; i++) {
            const base = this.subject ? this.subject.position[i]! : this.center[i]!;
            this.pan[i] = clamp(base + this.pan[i]!, this.panRoom[i]!, this.panRoom[i + 3]!) - base;
        }
    }
    protected place(f: Frame, dt: number) {
        this.idle += dt;
        if (this.easeTo) {
            const e = this.easeTo, k = 1 - Math.exp(-dt / Math.max(0.02, e.time / 3));
            this.yaw += turn(this.yaw * DEG, e.yaw * DEG) / DEG * k;
            this.pitch += (e.pitch - this.pitch) * k;
            this.distance += (e.distance - this.distance) * k;
            for (let i = 0; i < 3; i++) this.pan[i] = this.pan[i]! + (e.pan[i]! - this.pan[i]!) * k;
            if (Math.abs(turn(this.yaw * DEG, e.yaw * DEG)) < 1e-3 && Math.abs(e.distance - this.distance) < 1e-3) this.easeTo = null;
        } else if (this.drift && this.idle > 2) this.yaw += this.drift * dt * Math.min(1, (this.idle - 2) / 1.5);
        this.clampAxes();
        const y = this.sy.to(this.yaw * DEG, this.ease, dt), p = this.sp.to(this.pitch * DEG, this.ease, dt), d = this.sd.to(this.distance, this.ease, dt);
        const base = this.subject ? this.subject.position : this.center;
        set(tmp, base[0] + this.pan[0], base[1] + this.pan[1] + (this.subject ? this.lift : 0), base[2] + this.pan[2]);
        const c = this.c.to(tmp, this.subject ? this.lag : 0, dt, this.leash);
        copy(f.at, c);
        const cp = Math.cos(p);
        set(f.eye, c[0] + Math.sin(y) * cp * d, c[1] + Math.sin(p) * d, c[2] + Math.cos(y) * cp * d);
    }
}

// ------------------------------------------------------------------------------------------------ side

export type SideOptions = ShotOptions & {
    /** Which way the camera looks, in degrees round: 0 down -z, the side-on default. */
    yaw?: number;
    /** Degrees up or down it looks: -90 is straight down, for top-down. */
    pitch?: number;
    /** How far back. */
    distance?: number;
    /** Where the subject sits in the picture: [x, y], -1 to 1. */
    screen?: [number, number];
    /** How far it can wander from there before the camera moves: [x, y] each way, as shares of half the view. */
    deadZone?: [number, number];
    /** Seconds of movement to frame ahead of the subject, sideways only. */
    ahead?: number;
    lag?: number;
    leash?: number;
};

export class Side extends Shot {
    readonly kind = 'side';
    yaw: number; pitch: number; distance: number; screen: [number, number]; deadZone: [number, number]; ahead: number; lag: number; leash: number;
    private c = new SmoothV3();
    private center = v3();
    private fresh = true;
    private lead = new SmoothV3();
    constructor(subject: Subject, o: SideOptions = {}) {
        super(subject, o);
        this.rigid = true;
        this.yaw = o.yaw ?? 0; this.pitch = o.pitch ?? -5; this.distance = o.distance ?? 20;
        this.screen = o.screen ?? [0, 0]; this.deadZone = o.deadZone ?? [0.1, 0.15]; this.ahead = o.ahead ?? 0;
        this.lag = o.lag ?? 0.35; this.leash = o.leash ?? 4;
    }
    protected override forget() { this.c.reset(); this.lead.reset(); this.fresh = true; }
    override zones(): Zone[] {
        return [{ kind: 'dead', x: this.screen[0], y: this.screen[1], w: this.deadZone[0] * 2, h: this.deadZone[1] * 2 }, ...super.zones()];
    }
    protected place(f: Frame, dt: number, ctx: Ctx) {
        const fw = v3(), r = v3(), u = v3();
        basis(this.yaw * DEG, this.pitch * DEG, fw, r, u);
        const s = this.subject!.position;
        // the point to frame: the subject, and room ahead of where it's going, sideways only
        const sideways = dot(this.velocity, r);
        set(tmp, sideways * this.ahead * r[0], sideways * this.ahead * r[1], sideways * this.ahead * r[2]);
        const lead = this.lead.to(tmp, 0.4, dt);
        set(tmp2, s[0] + lead[0], s[1] + this.lift + lead[1], s[2] + lead[2]);
        if (this.fresh) {
            // start with the subject where it should sit
            const hh = ctx.ortho ? this.size : this.distance * Math.tan((this.fov * DEG) / 2), hw = hh * ctx.aspect;
            set(this.center, tmp2[0] - r[0] * this.screen[0] * hw - u[0] * this.screen[1] * hh, tmp2[1] - r[1] * this.screen[0] * hw - u[1] * this.screen[1] * hh, tmp2[2] - r[2] * this.screen[0] * hw - u[2] * this.screen[1] * hh);
            this.fresh = false;
        }
        const hh = ctx.ortho ? f.size : this.distance * Math.tan((f.fov * DEG) / 2), hw = hh * ctx.aspect;
        const c = this.center;
        // where the subject sits now, as a share of half the view, and how far outside the dead zone
        sub(tmp3, tmp2, c);
        const ux = dot(tmp3, r) / hw, uy = dot(tmp3, u) / hh;
        const ex = ux - clamp(ux, this.screen[0] - this.deadZone[0], this.screen[0] + this.deadZone[0]);
        const ey = uy - clamp(uy, this.screen[1] - this.deadZone[1], this.screen[1] + this.deadZone[1]);
        addScaled(c, c, r, ex * hw);
        addScaled(c, c, u, ey * hh);
        // and keep level with it in depth
        addScaled(c, c, fw, dot(tmp3, fw));
        const sm = this.c.to(c, this.lag, dt, this.leash);
        copy(f.at, sm);
        set(f.eye, sm[0] - fw[0] * this.distance, sm[1] - fw[1] * this.distance, sm[2] - fw[2] * this.distance);
    }
    /** Where the camera's centre is aiming: for a 2D game, the middle of the picture. */
    get middle(): Readonly<V3> { return this.c.value; }
}

// ------------------------------------------------------------------------------------------------ fixed

export type FixedOptions = ShotOptions & {
    /** How far the subject may drift from the middle before it turns: [x, y] as shares of half the view. */
    deadZone?: [number, number];
    /** Seconds to turn. */
    lag?: number;
};

export class Fixed extends Shot {
    readonly kind = 'fixed';
    readonly eye: V3;
    deadZone: [number, number]; lag: number;
    private aim = new SmoothV3();
    private looking = v3();
    private fresh = true;
    constructor(eye: Readonly<V3>, subject: Subject, o: FixedOptions = {}) {
        super(subject, o);
        this.eye = [...eye];
        this.deadZone = o.deadZone ?? [0, 0];
        this.lag = o.lag ?? 0.3;
    }
    protected override forget() { this.aim.reset(); this.fresh = true; }
    override zones(): Zone[] { return [{ kind: 'dead', x: 0, y: 0, w: this.deadZone[0] * 2, h: this.deadZone[1] * 2 }, ...super.zones()]; }
    protected place(f: Frame, dt: number, ctx: Ctx) {
        copy(f.eye, this.eye);
        const target = this.focus(tmp)!;
        if (this.fresh) { copy(this.looking, target); this.fresh = false; }
        // turn only once the subject leaves the dead zone, by the angle it's outside it
        const th = Math.tan((f.fov * DEG) / 2), tw = th * ctx.aspect;
        const ly = Math.atan2(this.looking[0] - this.eye[0], this.looking[2] - this.eye[2]);
        const ty = Math.atan2(target[0] - this.eye[0], target[2] - this.eye[2]);
        const lp = Math.atan2(this.looking[1] - this.eye[1], Math.hypot(this.looking[0] - this.eye[0], this.looking[2] - this.eye[2]));
        const tp = Math.atan2(target[1] - this.eye[1], Math.hypot(target[0] - this.eye[0], target[2] - this.eye[2]));
        const dzx = Math.atan(this.deadZone[0] * tw), dzy = Math.atan(this.deadZone[1] * th);
        let dy = turn(ly, ty), dp = tp - lp;
        dy = Math.abs(dy) > dzx ? dy - Math.sign(dy) * dzx : 0;
        dp = Math.abs(dp) > dzy ? dp - Math.sign(dp) * dzy : 0;
        const yaw = ly + dy, pitch = lp + dp, r = Math.max(1, Math.hypot(target[0] - this.eye[0], target[1] - this.eye[1], target[2] - this.eye[2]));
        set(this.looking, this.eye[0] + Math.sin(yaw) * Math.cos(pitch) * r, this.eye[1] + Math.sin(pitch) * r, this.eye[2] + Math.cos(yaw) * Math.cos(pitch) * r);
        copy(f.at, this.aim.to(this.looking, this.lag, dt));
    }
}

// ------------------------------------------------------------------------------------------------ rail

export type LookPoint = { at: number; look: V3 };
export type RailOptions = ShotOptions & {
    /** Where it starts, as a distance along. */
    travel?: number;
    /** Moves by itself from `from` to `to` (shares of the way, 0 to 1) in `duration` seconds, each time it goes live. */
    from?: number;
    to?: number;
    duration?: number;
    ease?: Ease;
    loop?: boolean;
    /** Or at this many units a second. */
    speed?: number;
    /** Or keeps level with a subject: the nearest point, plus `trackAhead`. */
    track?: Subject;
    trackAhead?: number;
    /** Offset from the path: right, up, along. */
    offset?: V3;
    /**
     * What it looks at: 'along' the path; a subject; or points placed along it, turning from one to the next as it
     * passes ({ at: distance as a share of the way, look }). Default 'along'.
     */
    look?: 'along' | Subject | LookPoint[];
    /** How long it holds each look point, 0 to 1: 0 turns evenly, 1 holds and turns late. */
    lookHold?: number;
    /** Banks into turns, like a coaster: degrees of roll for each degree a unit it turns, leaning into the turn. 0 is level. */
    bank?: number;
    maxBank?: number;
    /** Seconds to ease to a new place on the path. */
    lag?: number;
};

export class Rail extends Shot {
    readonly kind = 'rail';
    readonly path: Path;
    /** Where it is, as a distance along. Set it yourself, or let it move by itself. */
    travel: number;
    from: number; to: number; duration: number; easeOf: Ease; loop: boolean; speed: number; track: Subject | null; trackAhead: number;
    offset: V3; look: RailOptions['look']; lookHold: number; bank: number; maxBank: number; lag: number;
    /** Seconds since it went live. */
    age = 0;
    private t = new Smooth();
    private banked = new Smooth();
    constructor(p: Path, o: RailOptions = {}) {
        super(o.look && !Array.isArray(o.look) && o.look !== 'along' ? o.look : null, { free: true, ...o });
        this.path = p;
        this.travel = o.travel ?? 0; this.from = o.from ?? 0; this.to = o.to ?? 1; this.duration = o.duration ?? 0;
        this.easeOf = o.ease ?? eases.smooth; this.loop = o.loop ?? false; this.speed = o.speed ?? 0;
        this.track = o.track ?? null; this.trackAhead = o.trackAhead ?? 0; this.offset = o.offset ?? v3();
        this.look = o.look ?? 'along'; this.lookHold = o.lookHold ?? 0; this.bank = o.bank ?? 0; this.maxBank = o.maxBank ?? 45;
        this.lag = o.lag ?? 0;
    }
    override wake() { this.age = 0; }
    protected override forget() { this.t.reset(); this.banked.reset(); }
    /** How far it has left to go on a timed move, in seconds. */
    get left() { return this.duration ? Math.max(0, this.duration - this.age) : 0; }
    /** How far it banks, in degrees, a distance along: for drawing the track to match. */
    bankAt(d: number): number {
        if (!this.bank) return 0;
        const h1 = headingOf(this.path.along(d - 3, tmp)), h2 = headingOf(this.path.along(d + 3, tmp2));
        return clamp((-turn(h1, h2) / 6 / DEG) * this.bank, -this.maxBank, this.maxBank);
    }
    protected place(f: Frame, dt: number) {
        this.age += dt;
        const L = this.path.length;
        if (this.duration > 0) {
            let u = this.age / this.duration;
            u = this.loop ? u % 1 : Math.min(1, u);
            this.travel = lerp(this.from, this.to, this.easeOf(u)) * L;
        } else if (this.speed) this.travel += this.speed * dt;
        else if (this.track) this.travel = this.path.nearest(this.track.position) + this.trackAhead;
        const d = this.t.to(this.travel, this.lag, dt);
        const p = this.path.at(d, v3()), a = this.path.along(d, v3());
        const right = norm(v3(), cross(v3(), a, [0, 1, 0]));
        if (len(right) < 1e-6) set(right, 1, 0, 0);
        const up = cross(v3(), right, a);
        // banking: roll by how hard the path turns here, and lean the offset with it, as a rider leans
        if (this.bank) {
            const r = this.banked.to(this.bankAt(d), 0.25, dt);
            f.roll += r;
            const c = Math.cos(r * DEG), sn = Math.sin(r * DEG);
            for (let i = 0; i < 3; i++) { const x = right[i]!, y = up[i]!; right[i] = x * c - y * sn; up[i] = y * c + x * sn; }
        }
        const o = this.offset;
        set(f.eye, p[0] + right[0] * o[0] + up[0] * o[1] + a[0] * o[2], p[1] + right[1] * o[0] + up[1] * o[1] + a[1] * o[2], p[2] + right[2] * o[0] + up[2] * o[1] + a[2] * o[2]);
        const look = this.look;
        if (look === 'along' || !look) add(f.at, f.eye, scale(tmp, a, 10));
        else if (Array.isArray(look)) {
            const u = d / L;
            let i = 0;
            while (i < look.length - 1 && look[i + 1]!.at <= u) i++;
            const A = look[i]!, B = look[Math.min(look.length - 1, i + 1)]!;
            let k = B.at > A.at ? clamp((u - A.at) / (B.at - A.at), 0, 1) : 0;
            if (this.lookHold) { const s = eases.smooth(k); k = lerp(k, s * s * (3 - 2 * s), this.lookHold); }
            set(f.at, lerp(A.look[0], B.look[0], k), lerp(A.look[1], B.look[1], k), lerp(A.look[2], B.look[2], k));
        } else {
            const s = look.position;
            set(f.at, s[0], s[1] + this.lift, s[2]);
        }
    }
}

// ------------------------------------------------------------------------------------------------ look

export type LookOptions = ShotOptions & {
    /** Degrees round and up it starts at. */
    yaw?: number;
    pitch?: number;
    pitchRange?: [number, number];
    /** Seconds the turns take to settle. 0 follows the hand exactly. */
    ease?: number;
};

export class Look extends Shot {
    readonly kind = 'look';
    yaw: number; pitch: number; pitchRange: [number, number]; ease: number;
    private sy = new SmoothAngle(); private sp = new Smooth();
    constructor(head: Subject, o: LookOptions = {}) {
        super(head, { guard: false, lift: 0, ...o });
        this.yaw = o.yaw ?? 0; this.pitch = o.pitch ?? 0; this.pitchRange = o.pitchRange ?? [-80, 80]; this.ease = o.ease ?? 0.02;
    }
    protected override forget() { this.sy.reset(); this.sp.reset(); }
    /** Turns, in degrees: right and up. */
    turn(yaw: number, pitch: number) { this.yaw -= yaw; this.pitch = clamp(this.pitch + pitch, this.pitchRange[0], this.pitchRange[1]); }
    /** Faces a point. */
    face(p: Readonly<V3>) {
        const e = this.subject!.position;
        sub(tmp, p, e);
        this.yaw = headingOf(tmp) / DEG;
        this.pitch = clamp(Math.atan2(tmp[1], Math.hypot(tmp[0], tmp[2])) / DEG, this.pitchRange[0], this.pitchRange[1]);
    }
    forward(out: V3, flat = true): V3 {
        const y = this.sy.value, p = flat ? 0 : this.sp.value;
        return set(out, -Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
    }
    protected place(f: Frame, dt: number) {
        const y = this.sy.to(this.yaw * DEG, this.ease, dt), p = this.sp.to(this.pitch * DEG, this.ease, dt);
        const e = this.subject!.position;
        set(f.eye, e[0], e[1] + this.lift, e[2]);
        set(f.at, f.eye[0] - Math.sin(y) * Math.cos(p) * 10, f.eye[1] + Math.sin(p) * 10, f.eye[2] - Math.cos(y) * Math.cos(p) * 10);
    }
}

// ------------------------------------------------------------------------------------------------ group

export type Member = Subject & { active?: boolean };
export type GroupOptions = ShotOptions & {
    yaw?: number;
    pitch?: number;
    /** How far back, for perspective; it moves further to fit. */
    distance?: number;
    /** Room round the members, in world units. */
    padding?: number;
    /** The tightest and widest it frames: half heights, in world units. */
    sizeRange?: [number, number];
    lag?: number;
    /** The one who must always be in the picture, whatever else: usually the player. */
    keep?: Subject;
};

export class Group extends Shot {
    readonly kind = 'group';
    members: Member[];
    yaw: number; pitch: number; distance: number; padding: number; sizeRange: [number, number]; lag: number;
    private c = new SmoothV3();
    private h = new Smooth();
    constructor(members: Member[], o: GroupOptions = {}) {
        super(o.keep ?? null, { lift: 0, ...o });
        this.rigid = true;
        this.members = members;
        this.yaw = o.yaw ?? 0; this.pitch = o.pitch ?? -45; this.distance = o.distance ?? 30; this.padding = o.padding ?? 1.5;
        this.sizeRange = o.sizeRange ?? [3, 40]; this.lag = o.lag ?? 0.3;
    }
    protected override forget() { this.c.reset(); this.h.reset(); }
    protected place(f: Frame, dt: number, ctx: Ctx) {
        const fw = v3(), r = v3(), u = v3();
        basis(this.yaw * DEG, this.pitch * DEG, fw, r, u);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z = 0, n = 0;
        for (const m of this.members) {
            if (m.active === false) continue;
            const rad = m.radius ?? 0.5, p = m.position;
            const x = dot(p, r), y = dot(p, u);
            x0 = Math.min(x0, x - rad); x1 = Math.max(x1, x + rad); y0 = Math.min(y0, y - rad); y1 = Math.max(y1, y + rad);
            z += dot(p, fw); n++;
        }
        if (!n) { x0 = x1 = y0 = y1 = 0; }
        else z /= n;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        set(tmp, r[0] * cx + u[0] * cy + fw[0] * z, r[1] * cx + u[1] * cy + fw[1] * z, r[2] * cx + u[2] * cy + fw[2] * z);
        const half = clamp(Math.max((y1 - y0) / 2, (x1 - x0) / 2 / ctx.aspect) + this.padding, this.sizeRange[0], this.sizeRange[1]);
        const hs = this.h.to(half, this.lag, dt);
        const c = this.c.to(tmp, this.lag, dt);
        let back = this.distance;
        if (ctx.ortho) f.size = hs;
        else back = Math.max(this.distance, hs / Math.tan((f.fov * DEG) / 2));
        copy(f.at, c);
        set(f.eye, c[0] - fw[0] * back, c[1] - fw[1] * back, c[2] - fw[2] * back);
    }
}

// ------------------------------------------------------------------------------------------------ still

export class Still extends Shot {
    readonly kind = 'still';
    readonly eye: V3;
    readonly target: V3;
    constructor(eye: Readonly<V3>, at: Readonly<V3>, o: ShotOptions = {}) {
        super(null, { free: true, ...o });
        this.eye = [...eye];
        this.target = [...at];
    }
    protected place(f: Frame) { copy(f.eye, this.eye); copy(f.at, this.target); }
}

// ------------------------------------------------------------------------------------------------ makers

export const follow = (s: Subject, o?: FollowOptions) => new Follow(s, o);
export const orbit = (s: Subject | null, o?: OrbitOptions) => new Orbit(s, o);
export const side = (s: Subject, o?: SideOptions) => new Side(s, o);
export const fixed = (eye: Readonly<V3>, s: Subject, o?: FixedOptions) => new Fixed(eye, s, o);
export const rail = (p: Path, o?: RailOptions) => new Rail(p, o);
export const look = (head: Subject, o?: LookOptions) => new Look(head, o);
export const group = (m: Member[], o?: GroupOptions) => new Group(m, o);
export const still = (eye: Readonly<V3>, at: Readonly<V3>, o?: ShotOptions) => new Still(eye, at, o);
