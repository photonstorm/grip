import { type V3 } from './math';
export declare function noise(x: number): number;
export type ShakeStyle = {
    /** Most turn, in degrees: yaw, pitch, roll. */
    angle?: V3;
    /** Most move, in world units: right, up, back. */
    move?: V3;
    /** How fast it wanders, roughly shakes a second. */
    speed?: number;
};
/** Writes one moment of shake at strength `k` into a wobble and a nudge. */
export declare function shakeAt(wobble: V3, nudge: V3, t: number, k: number, style: ShakeStyle, seed?: number): void;
export type KickShape = 'bump' | 'boom' | 'recoil' | 'rumble';
export type Kick = {
    /** Where it starts, in the world. Leave it out for a kick felt the same everywhere, like recoil. */
    from?: V3;
    /** Which way and how far it pushes the camera at its height, in the camera's own space: right, up, back. */
    push: V3;
    /** How it rises and falls. */
    shape?: KickShape;
    /** Seconds it lasts. */
    time?: number;
    /** Units a second it travels out from `from`. Infinity is felt at once. */
    speed?: number;
    /** Full strength within this distance. */
    radius?: number;
    /** It fades to nothing over this far beyond `radius`. */
    fade?: number;
    /** Trauma it leaves behind as well, 0 to 1, for a rattle on top of the push. */
    trauma?: number;
};
export declare class Shaker {
    /** 0 to 1. Fades on its own. */
    trauma: number;
    /** Trauma lost a second. */
    recover: number;
    style: ShakeStyle;
    private kicks;
    private clock;
    kick(k: Kick): void;
    add(trauma: number): void;
    /** Stops every kick and all trauma at once. */
    clear(): void;
    /** Advances the clock and writes this moment's shake for a camera at `eye`. */
    apply(dt: number, eye: Readonly<V3>, wobble: V3, nudge: V3): void;
}
export declare const ZERO: Readonly<V3>;
