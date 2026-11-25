// Vectors and rotations, as plain arrays. Cameras look down their own -z, with +y up, as in WebGL.

export type V3 = [number, number, number];
export type Q = [number, number, number, number];

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const set = (o: V3, x: number, y: number, z: number): V3 => { o[0] = x; o[1] = y; o[2] = z; return o; };
export const copy = (o: V3, a: Readonly<V3>): V3 => set(o, a[0], a[1], a[2]);
export const add = (o: V3, a: Readonly<V3>, b: Readonly<V3>): V3 => set(o, a[0] + b[0], a[1] + b[1], a[2] + b[2]);
export const sub = (o: V3, a: Readonly<V3>, b: Readonly<V3>): V3 => set(o, a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const scale = (o: V3, a: Readonly<V3>, s: number): V3 => set(o, a[0] * s, a[1] * s, a[2] * s);
export const addScaled = (o: V3, a: Readonly<V3>, b: Readonly<V3>, s: number): V3 => set(o, a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s);
export const dot = (a: Readonly<V3>, b: Readonly<V3>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: Readonly<V3>) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: Readonly<V3>, b: Readonly<V3>) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const cross = (o: V3, a: Readonly<V3>, b: Readonly<V3>): V3 =>
    set(o, a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
export function norm(o: V3, a: Readonly<V3>): V3 {
    const l = len(a);
    return l > 1e-12 ? scale(o, a, 1 / l) : set(o, 0, 0, 0);
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (o: V3, a: Readonly<V3>, b: Readonly<V3>, t: number): V3 =>
    set(o, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const finite = (a: Readonly<V3>) => Number.isFinite(a[0]) && Number.isFinite(a[1]) && Number.isFinite(a[2]);

export const DEG = Math.PI / 180;

/** The shortest signed turn from angle a to angle b, in radians. */
export function turn(a: number, b: number): number {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
}

/** The heading of a direction, flat: 0 looks down -z, turning left is positive. */
export const headingOf = (d: Readonly<V3>) => Math.atan2(-d[0], -d[2]);
/** The flat direction of a heading. */
export const heading = (o: V3, h: number): V3 => set(o, -Math.sin(h), 0, -Math.cos(h));

/** Rotates v by unit quaternion q. */
export function rotate(o: V3, q: Readonly<Q>, v: Readonly<V3>): V3 {
    const x = v[0], y = v[1], z = v[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    return set(o, x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx);
}
/** Rotates v by the inverse of unit quaternion q: from the world into q's own space. */
export function unrotate(o: V3, q: Readonly<Q>, v: Readonly<V3>): V3 {
    return rotate(o, [-q[0], -q[1], -q[2], q[3]], v);
}
export function qmul(o: Q, a: Readonly<Q>, b: Readonly<Q>): Q {
    const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
    o[0] = aw * bx + ax * bw + ay * bz - az * by;
    o[1] = aw * by - ax * bz + ay * bw + az * bx;
    o[2] = aw * bz + ax * by - ay * bx + az * bw;
    o[3] = aw * bw - ax * bx - ay * by - az * bz;
    return o;
}
export function axisAngle(o: Q, x: number, y: number, z: number, angle: number): Q {
    const s = Math.sin(angle / 2);
    o[0] = x * s; o[1] = y * s; o[2] = z * s; o[3] = Math.cos(angle / 2);
    return o;
}

/** The rotation whose axes are x, y and z, which must be at right angles and unit length. Always a unit quaternion. */
export function fromBasis(o: Q, x: Readonly<V3>, y: Readonly<V3>, z: Readonly<V3>): Q {
    const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
    const tr = m00 + m11 + m22;
    if (tr > 0) {
        const s = Math.sqrt(tr + 1) * 2;
        o[3] = 0.25 * s; o[0] = (m21 - m12) / s; o[1] = (m02 - m20) / s; o[2] = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        o[3] = (m21 - m12) / s; o[0] = 0.25 * s; o[1] = (m01 + m10) / s; o[2] = (m02 + m20) / s;
    } else if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        o[3] = (m02 - m20) / s; o[0] = (m01 + m10) / s; o[1] = 0.25 * s; o[2] = (m12 + m21) / s;
    } else {
        const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        o[3] = (m10 - m01) / s; o[0] = (m02 + m20) / s; o[1] = (m12 + m21) / s; o[2] = 0.25 * s;
    }
    const l = Math.hypot(o[0], o[1], o[2], o[3]) || 1;
    o[0] /= l; o[1] /= l; o[2] /= l; o[3] /= l;
    return o;
}

const fx = v3(), fy = v3(), fz = v3(), upTmp = v3();
/**
 * The rotation of a camera at `eye` looking at `at`, with `up` as near up as it can be and rolled by `roll` radians
 * about its view: positive tilts its head right. Rebuilt from scratch every frame, so it's always a true rotation: nothing to drift. Returns false,
 * leaving `o` alone, when there's no direction to look in.
 */
export function lookAt(o: Q, eye: Readonly<V3>, at: Readonly<V3>, up: Readonly<V3>, roll = 0): boolean {
    sub(fz, eye, at);
    if (len(fz) < 1e-9 || !finite(fz)) return false;
    norm(fz, fz);
    norm(upTmp, up);
    cross(fx, upTmp, fz);
    if (len(fx) < 1e-6) {
        // looking straight along up: pick any sideways
        cross(fx, Math.abs(fz[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1], fz);
    }
    norm(fx, fx);
    cross(fy, fz, fx);
    if (roll) {
        // positive tilts the camera's head right, as you lean into a right-hand turn
        const c = Math.cos(roll), s = Math.sin(roll);
        const ax = fx[0] * c - fy[0] * s, ay = fx[1] * c - fy[1] * s, az = fx[2] * c - fy[2] * s;
        set(fy, fy[0] * c + fx[0] * s, fy[1] * c + fx[1] * s, fy[2] * c + fx[2] * s);
        set(fx, ax, ay, az);
    }
    fromBasis(o, fx, fy, fz);
    return true;
}

/** A smooth curve through 0 to 1, for blends. */
export type Ease = (t: number) => number;
export const ease = {
    linear: (t: number) => t,
    smooth: (t: number) => t * t * (3 - 2 * t),
    in: (t: number) => t * t,
    out: (t: number) => 1 - (1 - t) * (1 - t),
    /** Holds, then jumps at the end. */
    cut: (t: number) => (t < 1 ? 0 : 1)
} satisfies Record<string, Ease>;
