import { type Frame } from './frame';
import { type V3 } from './math';
import { type ShakeStyle } from './shake';
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
    shake?: ShakeStyle & {
        amount: number;
    };
    /** The rules: on by default for a shot with a subject. */
    guard?: GuardOptions | false;
    /** A cinematic shot that may look away from its subject. */
    free?: boolean;
    /** A subject jump bigger than this in one frame is a teleport: the shot snaps. Default 6. */
    teleport?: number;
};
export type Ctx = {
    aspect: number;
    ortho: boolean;
    time: number;
};
/** How often the rules had to step in: a shot that's set up right never trips them. */
export declare const trips: {
    box: number;
    far: number;
    room: number;
    wall: number;
    final: number;
};
export type Zone = {
    kind: 'dead' | 'box';
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare abstract class Shot {
    abstract readonly kind: string;
    name: string;
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
    shake: (ShakeStyle & {
        amount: number;
    }) | null;
    guard: GuardOptions | null;
    free: boolean;
    teleport: number;
    /** The subject's speed, smoothed, as Grip measured it. */
    readonly velocity: V3;
    /** True for shots that keep a fixed direction (side-on, top-down, group): rules slide them instead of turning them. */
    protected rigid: boolean;
    private last;
    private seen;
    private reach;
    private wallRise;
    private wallSwing;
    private wallAim;
    constructor(subject: Subject | null, o?: ShotOptions);
    /** Sets the eye, the point looked at and the up. The frame comes in with the lens already set. */
    protected abstract place(f: Frame, dt: number, ctx: Ctx): void;
    /** Forgets any smoothing: the next frame goes straight to where it should be. */
    protected forget(): void;
    /** Called as the shot goes live, for moves that start over with each showing. */
    wake(): void;
    /** Its zones on screen, for drawing over the picture. */
    zones(): Zone[];
    /** Snaps: for a cut, a teleport, or a fresh start. */
    reset(): void;
    /** The point on the subject to keep in view, or null. */
    focus(out: V3): V3 | null;
    private observe;
    /** Builds this frame of the shot. */
    update(f: Frame, dt: number, ctx: Ctx): void;
    private unblock;
}
export declare function clampRoom(f: Frame, room: Box, rigid: boolean, tally: keyof typeof trips): void;
/**
 * Keeps `focus` on screen: inside `box`, and the camera within `far`. Turns the camera the least it needs (moving
 * the point it looks at), or for a rigid shot slides it. Leaves the frame alone when all's well.
 */
export declare function keep(f: Frame, focus: Readonly<V3>, g: GuardOptions, ctx: Ctx, rigid: boolean, tally: keyof typeof trips): void;
