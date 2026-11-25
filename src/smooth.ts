// Smoothing that can't run away. A critically damped spring (no overshoot) that takes `time` seconds to mostly
// catch up, with a leash: however fast the thing it follows moves, it's never further behind than `leash`.
// Plain damping trails by speed times time, which put Klipp Lab's chase camera 18 units behind a fast car.
import { type V3, v3, set, copy } from './math';

/** One number, smoothed. */
export class Smooth {
    value: number;
    private vel = 0;
    private fresh = true;
    constructor(value = 0) { this.value = value; }

    /** Moves towards `target`, taking about `time` seconds; never more than `leash` away from it. */
    to(target: number, time: number, dt: number, leash = Infinity): number {
        if (this.fresh || time <= 0 || dt <= 0) {
            if (this.fresh || time <= 0) { this.value = target; this.vel = 0; this.fresh = false; }
            return this.value;
        }
        const omega = 2 / time, x = omega * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        const change = this.value - target, tmp = (this.vel + omega * change) * dt;
        this.vel = (this.vel - omega * tmp) * e;
        let v = target + (change + tmp) * e;
        // no overshoot
        if ((target - this.value > 0) === (v > target)) { v = target; this.vel = 0; }
        if (Math.abs(v - target) > leash) { v = target + Math.sign(v - target) * leash; this.vel = 0; }
        this.value = v;
        return v;
    }
    /** Jumps straight to `value` and forgets any speed. */
    snap(value: number) { this.value = value; this.vel = 0; this.fresh = false; }
    /** The next `to` jumps straight to its target. */
    reset() { this.fresh = true; }
}

/** An angle in radians, smoothed the short way round. */
export class SmoothAngle {
    private s = new Smooth();
    get value() { return this.s.value; }
    to(target: number, time: number, dt: number, leash = Infinity): number {
        // bring the target within half a turn of where we are, then smooth as a plain number
        let t = target;
        const v = this.s.value;
        while (t - v > Math.PI) t -= Math.PI * 2;
        while (t - v < -Math.PI) t += Math.PI * 2;
        return this.s.to(t, time, dt, leash);
    }
    snap(value: number) { this.s.snap(value); }
    reset() { this.s.reset(); }
}

/** A point, smoothed as one: the leash is a distance. */
export class SmoothV3 {
    value: V3;
    private vel = v3();
    private fresh = true;
    constructor(value: V3 = v3()) { this.value = [...value]; }

    to(target: Readonly<V3>, time: number, dt: number, leash = Infinity): V3 {
        const p = this.value;
        if (this.fresh || time <= 0) { copy(p, target); set(this.vel, 0, 0, 0); this.fresh = false; return p; }
        if (dt <= 0) return p;
        const omega = 2 / time, x = omega * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        for (let i = 0; i < 3; i++) {
            const change = p[i]! - target[i]!, tmp = (this.vel[i]! + omega * change) * dt;
            this.vel[i] = (this.vel[i]! - omega * tmp) * e;
            p[i] = target[i]! + (change + tmp) * e;
        }
        const dx = p[0] - target[0], dy = p[1] - target[1], dz = p[2] - target[2], d = Math.hypot(dx, dy, dz);
        if (d > leash) {
            const k = leash / d;
            set(p, target[0] + dx * k, target[1] + dy * k, target[2] + dz * k);
        }
        return p;
    }
    snap(value: Readonly<V3>) { copy(this.value, value); set(this.vel, 0, 0, 0); this.fresh = false; }
    reset() { this.fresh = true; }
}
