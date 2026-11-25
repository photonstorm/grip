import { type V3 } from './math';
/** One number, smoothed. */
export declare class Smooth {
    value: number;
    private vel;
    private fresh;
    constructor(value?: number);
    /** Moves towards `target`, taking about `time` seconds; never more than `leash` away from it. */
    to(target: number, time: number, dt: number, leash?: number): number;
    /** Jumps straight to `value` and forgets any speed. */
    snap(value: number): void;
    /** The next `to` jumps straight to its target. */
    reset(): void;
}
/** An angle in radians, smoothed the short way round. */
export declare class SmoothAngle {
    private s;
    get value(): number;
    to(target: number, time: number, dt: number, leash?: number): number;
    snap(value: number): void;
    reset(): void;
}
/** A point, smoothed as one: the leash is a distance. */
export declare class SmoothV3 {
    value: V3;
    private vel;
    private fresh;
    constructor(value?: V3);
    to(target: Readonly<V3>, time: number, dt: number, leash?: number): V3;
    snap(value: Readonly<V3>): void;
    reset(): void;
}
