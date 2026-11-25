// The director: which shot is on screen, how it gets there, and what goes to the real camera.
//
// No priorities to juggle. You say what you want: cut to a shot, blend to one over a time, mix several by weight,
// or play a sequence of them. Nothing can tie for a moment and hand the screen to the wrong camera, which happened
// in Klipp Lab twice. Whatever comes out, the live shot's subject is kept in the picture one last time before it
// leaves (unless the shot is free), and the rotation is rebuilt from scratch, so it can't drift or break.
import { type Frame, type View, frame, copyFrame, blendFrame, toView, view, project } from './frame';
import { type Ease, ease as eases, type V3, v3, set } from './math';
import { Shaker, type Kick } from './shake';
import { type Ctx, type Shot, type Zone, keep, trips } from './shot';

export type BlendOptions = {
    /** How the blend runs: a name from `ease` or a function. Default smooth. */
    ease?: Ease | keyof typeof eases;
    /** Swing round the subject instead of cutting across: for two shots of it from different sides. */
    arc?: boolean;
};

export type Step = {
    /** The shot to show. */
    shot: string;
    /** Seconds to hold it, once the blend into it has finished. */
    hold: number;
    /** Seconds to blend into it: 0, the default, cuts. */
    blend?: number;
} & BlendOptions;

export type SequenceOptions = {
    /** The shot to go to when it's over. */
    then?: string;
    /** Seconds to blend to `then`: 0 cuts. */
    blendOut?: number;
    /** Starts over at the end instead. */
    loop?: boolean;
    /** Called as each shot comes on. */
    onShot?: (name: string, index: number) => void;
    /** Called once it's over. */
    onEnd?: () => void;
};

type Blend = { from: Shot | null; still: Frame; to: Shot; time: number; t: number; ease: Ease; arc: boolean };
type Sequence = { steps: Step[]; index: number; held: number; options: SequenceOptions };

export type Inspection = {
    live: string | null;
    blend: { from: string | null; to: string; t: number } | null;
    mix: Record<string, number> | null;
    sequence: { index: number; shot: string; held: number; hold: number; steps: number } | null;
    trips: typeof trips;
    trauma: number;
};

export class Director {
    /** The viewport's width over its height: keep it up to date. */
    aspect = 16 / 9;
    /** Whether the real camera is orthographic. */
    ortho = false;
    /** What to put on the real camera, after every `update`. */
    readonly view: View = view();
    /** The final frame, before shake. */
    readonly frame: Frame = frame();
    readonly shaker = new Shaker();
    /** The live shot. */
    live: Shot | null = null;
    /** How fast the director's clock runs against the `dt` it's given: 0 holds the picture still, as a paused timeline does. */
    rate = 1;

    private shots = new Map<string, Shot>();
    private frames = new Map<Shot, Frame>();
    private fade: Blend | null = null;
    private weights: Record<string, number> | null = null;
    private seq: Sequence | null = null;
    private time = 0;
    private scratch = frame();
    private ctx: Ctx = { aspect: 1, ortho: false, time: 0 };

    /** Adds shots, named. Returns the first, for chaining. */
    add<T extends Shot>(name: string, shot: T): T {
        shot.name = name;
        this.shots.set(name, shot);
        this.frames.set(shot, frame());
        return shot;
    }
    get(name: string): Shot | undefined { return this.shots.get(name); }

    /** Straight to a shot, starting it fresh. */
    cut(name: string) {
        const s = this.need(name);
        this.fade = null;
        this.weights = null;
        this.wake(s);
    }

    /** To a shot over `time` seconds. A blend already running carries on from wherever it had got to. */
    blend(name: string, time: number, o: BlendOptions = {}) {
        const to = this.need(name);
        if (time <= 0 || !this.live) return this.cut(name);
        if (to === this.live && !this.fade) return;
        const still = copyFrame(frame(), this.frame);
        // from the live shot if it's simply on screen; from where things stood if a blend or a mix was running
        const from = this.fade || this.weights ? null : this.live;
        this.weights = null;
        this.fade = { from, still, to, time, t: 0, ease: typeof o.ease === 'function' ? o.ease : eases[o.ease ?? 'smooth'], arc: o.arc ?? false };
        this.wake(to);
    }

    /** Mixes shots by weight, every frame, for as long as it's set: [name, weight]. `null` stops it. */
    mix(weights: Record<string, number> | null) {
        if (!weights) { this.weights = null; return; }
        if (!this.weights) {
            this.fade = null;
            for (const n in weights) this.need(n).reset();
        }
        this.weights = weights;
        let best = '', bw = -Infinity;
        for (const n in weights) if (weights[n]! > bw) { bw = weights[n]!; best = n; }
        this.live = this.need(best);
    }

    /** Plays shots one after another. `skip()` ends it early. */
    play(steps: Step[], o: SequenceOptions = {}) {
        if (!steps.length) return;
        this.seq = { steps, index: -1, held: 0, options: o };
        this.next();
    }
    /** Ends a sequence now, as if it had finished. */
    skip() { if (this.seq) this.finish(); }
    get playing() { return !!this.seq; }
    /** True while a blend is running. */
    get blending() { return !!this.fade; }

    /** A one-off push: a blast, a hit, recoil. See Kick. */
    kick(k: Kick) { this.shaker.kick(k); }
    /** Adds trauma, 0 to 1, for shake that fades by itself. */
    shake(amount: number) { this.shaker.add(amount); }
    /** Snaps the live shot to where it should be: after teleporting the player, say. */
    snap() { this.live?.reset(); }

    update(dt: number): View {
        // a clock that jumped backwards, or broke, counts as no time
        dt *= this.rate;
        if (!(dt > 0)) dt = 0;
        this.time += dt;
        const ctx = this.ctx;
        ctx.aspect = this.aspect; ctx.ortho = this.ortho; ctx.time = this.time;
        const out = this.frame;

        // a sequence moves on once a step has been held for its time
        const seq = this.seq;
        if (seq && !this.fade) {
            seq.held += dt;
            if (seq.held >= seq.steps[seq.index]!.hold) this.next();
        }

        if (this.weights) {
            let total = 0;
            for (const n in this.weights) {
                const w = this.weights[n]!;
                if (!(w > 0)) continue;
                const s = this.shots.get(n);
                if (!s) continue;
                const f = this.frames.get(s)!;
                s.update(f, dt, ctx);
                total += w;
                if (total === w) copyFrame(out, f);
                else { copyFrame(this.scratch, out); blendFrame(out, this.scratch, f, w / total); }
            }
        } else if (this.live) {
            const to = this.frames.get(this.live)!;
            this.live.update(to, dt, ctx);
            const b = this.fade;
            if (b) {
                b.t += dt / b.time;
                const from = b.from ? this.frames.get(b.from)! : b.still;
                if (b.from) b.from.update(from, dt, ctx);
                const around = b.arc ? this.live.focus(v3()) : null;
                blendFrame(out, from, to, b.ease(Math.min(1, b.t)), around);
                if (b.t >= 1) this.fade = null;
            } else copyFrame(out, to);
        }

        // the last lock: the live shot's subject is in the picture, whatever the blends and mixes did
        const live = this.live;
        if (live && live.guard && !live.free) {
            const focus = live.focus(fp);
            if (focus) keep(out, focus, { box: Math.max(live.guard.box ?? 0.8, 0.9), far: live.guard.far }, ctx, false, 'final');
        }

        // shake and kicks on top, then the rotation from scratch
        set(sw, out.wobble[0], out.wobble[1], out.wobble[2]);
        set(sn, out.nudge[0], out.nudge[1], out.nudge[2]);
        this.shaker.apply(dt, out.eye, out.wobble, out.nudge);
        this.view.aspect = this.aspect;
        this.view.ortho = this.ortho;
        toView(this.view, out);
        // the frame keeps what the shots made; shake only goes to the view
        set(out.wobble, sw[0], sw[1], sw[2]);
        set(out.nudge, sn[0], sn[1], sn[2]);
        return this.view;
    }

    /** Where a point lands in the picture: x and y from -1 to 1, and its depth in front of the camera. */
    project(p: Readonly<V3>, out?: V3): V3 { return project(this.view, p, out); }

    /** What's going on, for a panel or the console. */
    inspect(): Inspection {
        const b = this.fade, s = this.seq;
        return {
            live: this.live?.name ?? null,
            blend: b ? { from: b.from?.name ?? null, to: b.to.name, t: Math.min(1, b.t) } : null,
            mix: this.weights ? { ...this.weights } : null,
            sequence: s ? { index: s.index, shot: s.steps[s.index]!.shot, held: s.held, hold: s.steps[s.index]!.hold, steps: s.steps.length } : null,
            trips: { ...trips },
            trauma: this.shaker.trauma
        };
    }
    /** The live shot's zones on screen, for drawing over the picture. */
    zones(): Zone[] { return this.live?.zones() ?? []; }
    /** How much of the picture each shot has, 0 to 1. */
    weightOf(name: string): number {
        const s = this.shots.get(name);
        if (!s) return 0;
        if (this.weights) {
            let total = 0;
            for (const n in this.weights) total += Math.max(0, this.weights[n]!);
            return total > 0 ? Math.max(0, this.weights[name] ?? 0) / total : 0;
        }
        const b = this.fade;
        if (b) {
            const k = b.ease(Math.min(1, b.t));
            if (b.to === s) return k;
            if (b.from === s) return 1 - k;
            return 0;
        }
        return this.live === s ? 1 : 0;
    }
    /** Every shot, by name. */
    names(): string[] { return [...this.shots.keys()]; }
    /** A shot's last frame: where it was, for drawing it in the scene. */
    frameOf(name: string): Frame | undefined { const s = this.shots.get(name); return s && this.frames.get(s); }

    private need(name: string): Shot {
        const s = this.shots.get(name);
        if (!s) throw new Error(`No shot called "${name}"`);
        return s;
    }
    private wake(s: Shot) {
        s.reset();
        s.wake();
        this.live = s;
    }
    private next() {
        const seq = this.seq!;
        seq.index++;
        if (seq.index >= seq.steps.length) {
            if (seq.options.loop) seq.index = 0;
            else return this.finish();
        }
        const step = seq.steps[seq.index]!;
        seq.held = 0;
        if (step.blend && step.blend > 0 && this.live) this.blend(step.shot, step.blend, step);
        else this.cut(step.shot);
        seq.options.onShot?.(step.shot, seq.index);
    }
    private finish() {
        const o = this.seq!.options;
        this.seq = null;
        if (o.then) {
            if (o.blendOut && o.blendOut > 0) this.blend(o.then, o.blendOut);
            else this.cut(o.then);
        }
        o.onEnd?.();
    }
}

const fp = v3(), sw = v3(), sn = v3();
