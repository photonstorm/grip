import { type Frame, type View } from './frame';
import { type Ease, ease as eases, type V3 } from './math';
import { Shaker, type Kick } from './shake';
import { type Shot, type Zone, trips } from './shot';
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
export type Inspection = {
    live: string | null;
    blend: {
        from: string | null;
        to: string;
        t: number;
    } | null;
    mix: Record<string, number> | null;
    sequence: {
        index: number;
        shot: string;
        held: number;
        hold: number;
        steps: number;
    } | null;
    trips: typeof trips;
    trauma: number;
};
export declare class Director {
    /** The viewport's width over its height: keep it up to date. */
    aspect: number;
    /** Whether the real camera is orthographic. */
    ortho: boolean;
    /** What to put on the real camera, after every `update`. */
    readonly view: View;
    /** The final frame, before shake. */
    readonly frame: Frame;
    readonly shaker: Shaker;
    /** The live shot. */
    live: Shot | null;
    private shots;
    private frames;
    private fade;
    private weights;
    private seq;
    private time;
    private scratch;
    private ctx;
    /** Adds shots, named. Returns the first, for chaining. */
    add<T extends Shot>(name: string, shot: T): T;
    get(name: string): Shot | undefined;
    /** Straight to a shot, starting it fresh. */
    cut(name: string): void;
    /** To a shot over `time` seconds. A blend already running carries on from wherever it had got to. */
    blend(name: string, time: number, o?: BlendOptions): void;
    /** Mixes shots by weight, every frame, for as long as it's set: [name, weight]. `null` stops it. */
    mix(weights: Record<string, number> | null): void;
    /** Plays shots one after another. `skip()` ends it early. */
    play(steps: Step[], o?: SequenceOptions): void;
    /** Ends a sequence now, as if it had finished. */
    skip(): void;
    get playing(): boolean;
    /** True while a blend is running. */
    get blending(): boolean;
    /** A one-off push: a blast, a hit, recoil. See Kick. */
    kick(k: Kick): void;
    /** Adds trauma, 0 to 1, for shake that fades by itself. */
    shake(amount: number): void;
    /** Snaps the live shot to where it should be: after teleporting the player, say. */
    snap(): void;
    update(dt: number): View;
    /** Where a point lands in the picture: x and y from -1 to 1, and its depth in front of the camera. */
    project(p: Readonly<V3>, out?: V3): V3;
    /** What's going on, for a panel or the console. */
    inspect(): Inspection;
    /** The live shot's zones on screen, for drawing over the picture. */
    zones(): Zone[];
    /** How much of the picture each shot has, 0 to 1. */
    weightOf(name: string): number;
    /** Every shot, by name. */
    names(): string[];
    /** A shot's last frame: where it was, for drawing it in the scene. */
    frameOf(name: string): Frame | undefined;
    private need;
    private wake;
    private next;
    private finish;
}
