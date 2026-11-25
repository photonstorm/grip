import { type Q, type V3 } from './math';
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
export declare function frame(): Frame;
export declare function copyFrame(o: Frame, a: Readonly<Frame>): Frame;
/**
 * Between frame a and frame b. With `around`, the eye swings round that point at a blended distance instead of
 * cutting straight across: two shots of a subject from opposite sides don't pass through it.
 */
export declare function blendFrame(o: Frame, a: Readonly<Frame>, b: Readonly<Frame>, t: number, around?: Readonly<V3> | null): Frame;
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
export declare function view(): View;
/** Turns a frame into a view. If the frame has no direction to look in, the last rotation stands. */
export declare function toView(o: View, f: Readonly<Frame>): View;
/**
 * Where a point lands in a view: x and y from -1 to 1 across and up the picture, and depth in front of the camera
 * (negative is behind).
 */
export declare function project(v: Readonly<View>, p: Readonly<V3>, out?: V3): V3;
/** How far apart two frames' eyes are: for telling a jump from a move. */
export declare const frameGap: (a: Readonly<Frame>, b: Readonly<Frame>) => number;
