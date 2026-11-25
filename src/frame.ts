// A frame is a shot as a camera operator thinks of it: where the camera is, what it looks at, which way is up, how
// far it's rolled, and the lens. Every shot makes one each frame; blends and mixes work on frames, so a blend
// between two shots of the same subject looks at a point between them: the subject can't slip out of a blend the
// way it did out of Klipp's MixingCamera. The rotation is only worked out at the very end, from scratch.
import { type Q, type V3, v3, set, copy, lerp, lerpV, lookAt, norm, sub, len, rotate, unrotate, qmul, axisAngle, DEG, dist } from './math';

export type Frame = {
    eye: V3;
    at: V3;
    up: V3;
    /** Roll about the view, in degrees: positive tilts the camera's head right, so the picture leans left. */
    roll: number;
    /** Vertical field of view, in degrees. */
    fov: number;
    /** Half the view's height in world units, for an orthographic camera. */
    size: number;
    /** Slides the picture without turning the camera, as a share of half the view: [0, 0] is centred. */
    shift: [number, number];
    /** A last turn on top, in degrees: yaw, pitch, roll. Shake lives here. */
    wobble: V3;
    /** A last move on top, in the camera's own space: right, up, back. Kicks live here. */
    nudge: V3;
};

export function frame(): Frame {
    return { eye: v3(0, 2, 10), at: v3(0, 1, 0), up: v3(0, 1, 0), roll: 0, fov: 50, size: 5, shift: [0, 0], wobble: v3(), nudge: v3() };
}

export function copyFrame(o: Frame, a: Readonly<Frame>): Frame {
    copy(o.eye, a.eye); copy(o.at, a.at); copy(o.up, a.up);
    o.roll = a.roll; o.fov = a.fov; o.size = a.size;
    o.shift[0] = a.shift[0]; o.shift[1] = a.shift[1];
    copy(o.wobble, a.wobble); copy(o.nudge, a.nudge);
    return o;
}

const ea = v3(), eb = v3();
/**
 * Between frame a and frame b. With `around`, the eye swings round that point at a blended distance instead of
 * cutting straight across: two shots of a subject from opposite sides don't pass through it.
 */
export function blendFrame(o: Frame, a: Readonly<Frame>, b: Readonly<Frame>, t: number, around?: Readonly<V3> | null): Frame {
    if (around) {
        sub(ea, a.eye, around); sub(eb, b.eye, around);
        const ra = len(ea), rb = len(eb);
        if (ra > 1e-4 && rb > 1e-4) {
            norm(ea, ea); norm(eb, eb);
            const d = Math.max(-1, Math.min(1, ea[0] * eb[0] + ea[1] * eb[1] + ea[2] * eb[2]));
            const w = Math.acos(d);
            let ka = 1 - t, kb = t;
            if (w > 1e-4 && w < Math.PI - 1e-3) { ka = Math.sin((1 - t) * w) / Math.sin(w); kb = Math.sin(t * w) / Math.sin(w); }
            const r = lerp(ra, rb, t);
            set(o.eye, around[0] + (ea[0] * ka + eb[0] * kb) * r, around[1] + (ea[1] * ka + eb[1] * kb) * r, around[2] + (ea[2] * ka + eb[2] * kb) * r);
        } else lerpV(o.eye, a.eye, b.eye, t);
    } else lerpV(o.eye, a.eye, b.eye, t);
    lerpV(o.at, a.at, b.at, t);
    lerpV(o.up, a.up, b.up, t);
    if (len(o.up) < 1e-6) copy(o.up, b.up);
    o.roll = lerp(a.roll, b.roll, t);
    o.fov = lerp(a.fov, b.fov, t);
    o.size = lerp(a.size, b.size, t);
    o.shift[0] = lerp(a.shift[0], b.shift[0], t);
    o.shift[1] = lerp(a.shift[1], b.shift[1], t);
    lerpV(o.wobble, a.wobble, b.wobble, t);
    lerpV(o.nudge, a.nudge, b.nudge, t);
    return o;
}

/** What goes on the real camera: a position, a unit rotation and a lens. */
export type View = {
    position: V3;
    /** Unit quaternion; the camera looks down its own -z. */
    rotation: Q;
    fov: number;
    size: number;
    shift: [number, number];
    ortho: boolean;
    aspect: number;
};

export function view(): View {
    return { position: v3(0, 2, 10), rotation: [0, 0, 0, 1], fov: 50, size: 5, shift: [0, 0], ortho: false, aspect: 1 };
}

const qa: Q = [0, 0, 0, 1], qb: Q = [0, 0, 0, 1], nudged = v3();
/** Turns a frame into a view. If the frame has no direction to look in, the last rotation stands. */
export function toView(o: View, f: Readonly<Frame>): View {
    if (lookAt(qa, f.eye, f.at, f.up, f.roll * DEG)) {
        o.rotation[0] = qa[0]; o.rotation[1] = qa[1]; o.rotation[2] = qa[2]; o.rotation[3] = qa[3];
    }
    const w = f.wobble;
    if (w[0] || w[1] || w[2]) {
        // yaw about the camera's up, pitch about its right, roll about its view
        qmul(o.rotation, o.rotation, axisAngle(qb, 0, 1, 0, w[0] * DEG));
        qmul(o.rotation, o.rotation, axisAngle(qb, 1, 0, 0, w[1] * DEG));
        qmul(o.rotation, o.rotation, axisAngle(qb, 0, 0, 1, w[2] * DEG));
        const l = Math.hypot(...o.rotation) || 1;
        o.rotation[0] /= l; o.rotation[1] /= l; o.rotation[2] /= l; o.rotation[3] /= l;
    }
    rotate(nudged, o.rotation, f.nudge);
    set(o.position, f.eye[0] + nudged[0], f.eye[1] + nudged[1], f.eye[2] + nudged[2]);
    o.fov = Math.max(1, Math.min(170, f.fov));
    o.size = Math.max(1e-3, f.size);
    o.shift[0] = f.shift[0];
    o.shift[1] = f.shift[1];
    return o;
}

const rel = v3();
/**
 * Where a point lands in a view: x and y from -1 to 1 across and up the picture, and depth in front of the camera
 * (negative is behind).
 */
export function project(v: Readonly<View>, p: Readonly<V3>, out: V3 = v3()): V3 {
    sub(rel, p, v.position);
    unrotate(rel, v.rotation, rel);
    const depth = -rel[2];
    if (v.ortho) return set(out, rel[0] / (v.size * v.aspect) + v.shift[0], rel[1] / v.size + v.shift[1], depth);
    const th = Math.tan((v.fov * DEG) / 2);
    if (depth <= 1e-6) return set(out, Math.sign(rel[0]) * 1e3, Math.sign(rel[1]) * 1e3, depth);
    return set(out, rel[0] / depth / (th * v.aspect) + v.shift[0], rel[1] / depth / th + v.shift[1], depth);
}

/** How far apart two frames' eyes are: for telling a jump from a move. */
export const frameGap = (a: Readonly<Frame>, b: Readonly<Frame>) => dist(a.eye, b.eye);
