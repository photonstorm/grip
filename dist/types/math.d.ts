export type V3 = [number, number, number];
export type Q = [number, number, number, number];
export declare const v3: (x?: number, y?: number, z?: number) => V3;
export declare const set: (o: V3, x: number, y: number, z: number) => V3;
export declare const copy: (o: V3, a: Readonly<V3>) => V3;
export declare const add: (o: V3, a: Readonly<V3>, b: Readonly<V3>) => V3;
export declare const sub: (o: V3, a: Readonly<V3>, b: Readonly<V3>) => V3;
export declare const scale: (o: V3, a: Readonly<V3>, s: number) => V3;
export declare const addScaled: (o: V3, a: Readonly<V3>, b: Readonly<V3>, s: number) => V3;
export declare const dot: (a: Readonly<V3>, b: Readonly<V3>) => number;
export declare const len: (a: Readonly<V3>) => number;
export declare const dist: (a: Readonly<V3>, b: Readonly<V3>) => number;
export declare const cross: (o: V3, a: Readonly<V3>, b: Readonly<V3>) => V3;
export declare function norm(o: V3, a: Readonly<V3>): V3;
export declare const lerp: (a: number, b: number, t: number) => number;
export declare const lerpV: (o: V3, a: Readonly<V3>, b: Readonly<V3>, t: number) => V3;
export declare const clamp: (v: number, lo: number, hi: number) => number;
export declare const finite: (a: Readonly<V3>) => boolean;
export declare const DEG: number;
/** The shortest signed turn from angle a to angle b, in radians. */
export declare function turn(a: number, b: number): number;
/** The heading of a direction, flat: 0 looks down -z, turning left is positive. */
export declare const headingOf: (d: Readonly<V3>) => number;
/** The flat direction of a heading. */
export declare const heading: (o: V3, h: number) => V3;
/** Rotates v by unit quaternion q. */
export declare function rotate(o: V3, q: Readonly<Q>, v: Readonly<V3>): V3;
/** Rotates v by the inverse of unit quaternion q: from the world into q's own space. */
export declare function unrotate(o: V3, q: Readonly<Q>, v: Readonly<V3>): V3;
export declare function qmul(o: Q, a: Readonly<Q>, b: Readonly<Q>): Q;
export declare function axisAngle(o: Q, x: number, y: number, z: number, angle: number): Q;
/** The rotation whose axes are x, y and z, which must be at right angles and unit length. Always a unit quaternion. */
export declare function fromBasis(o: Q, x: Readonly<V3>, y: Readonly<V3>, z: Readonly<V3>): Q;
/**
 * The rotation of a camera at `eye` looking at `at`, with `up` as near up as it can be and rolled by `roll` radians
 * about its view: positive tilts its head right. Rebuilt from scratch every frame, so it's always a true rotation: nothing to drift. Returns false,
 * leaving `o` alone, when there's no direction to look in.
 */
export declare function lookAt(o: Q, eye: Readonly<V3>, at: Readonly<V3>, up: Readonly<V3>, roll?: number): boolean;
/** A smooth curve through 0 to 1, for blends. */
export type Ease = (t: number) => number;
export declare const ease: {
    linear: (t: number) => number;
    smooth: (t: number) => number;
    in: (t: number) => number;
    out: (t: number) => number;
    /** Holds, then jumps at the end. */
    cut: (t: number) => 0 | 1;
};
