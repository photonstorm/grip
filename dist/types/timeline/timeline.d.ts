import type { Director } from '../director';
import { ease as eases } from '../math';
import type { Kick } from '../shake';
export type EaseName = keyof typeof eases;
export type Value = number | number[];
/** A keyframe: a time, a value, and how it gets there from the key before. Default 'smooth'; 'cut' holds, then jumps. */
export type Key = [at: number, value: Value, ease?: EaseName];
/** A shot on screen from `at` for `length` seconds, blending in from the picture before over `blend` seconds. */
export type CameraClip = {
    at: number;
    length: number;
    shot: string;
    blend?: number;
    ease?: EaseName;
    arc?: boolean;
};
/** A sound from `at`, `offset` seconds into it, for `length` seconds or until it ends. */
export type SoundClip = {
    at: number;
    sound: string;
    length?: number;
    offset?: number;
    gain?: number;
};
/** A moment to tell the game about. */
export type Mark = {
    at: number;
    name: string;
    data?: unknown;
};
/** A kick to the camera at a moment: see Kick. */
export type KickMark = Kick & {
    at: number;
};
export type CameraTrack = {
    kind: 'camera';
    name?: string;
    clips: CameraClip[];
};
/** A value the game reads or binds to: a number, or a list of them (a position, a colour). */
export type ValueTrack = {
    kind: 'value';
    name: string;
    keys: Key[];
};
export type SoundTrack = {
    kind: 'sound';
    name?: string;
    clips: SoundClip[];
};
export type EventTrack = {
    kind: 'event';
    name?: string;
    marks: Mark[];
};
export type ShakeTrack = {
    kind: 'shake';
    name?: string;
    kicks: KickMark[];
};
export type Track = CameraTrack | ValueTrack | SoundTrack | EventTrack | ShakeTrack;
export type Script = {
    name?: string;
    length?: number;
    tracks: Track[];
};
/** How a timeline makes sound: the game's own audio. `webAudio()` is one. */
export type SoundPlayer = {
    /** Starts `sound` now, `offset` seconds in. Returns whatever stops it. */
    play(sound: string, offset: number, gain: number): unknown;
    stop(handle: unknown): void;
    /** How long a sound is, if known: for drawing it. */
    duration?(sound: string): number | undefined;
};
export type TimelineOptions = {
    director?: Director | null;
    sounds?: SoundPlayer | null;
    /** Starts over at the end. */
    loop?: boolean;
    /** The step a seek replays the camera in, seconds. Default 1/60. */
    step?: number;
};
export type TimelineState = {
    name: string;
    time: number;
    length: number;
    playing: boolean;
    /** The camera clip on screen, and how far it's blended in (1 once it has). */
    shot: string | null;
    blend: number;
    values: Record<string, Value>;
    /** Sounds playing now. */
    sounds: string[];
};
export declare class Timeline {
    readonly script: Script;
    readonly name: string;
    readonly length: number;
    /** Seconds in. */
    time: number;
    playing: boolean;
    /** Playback speed: 0.5 is half speed. The camera follows it. */
    speed: number;
    loop: boolean;
    director: Director | null;
    sounds: SoundPlayer | null;
    step: number;
    /** Every event mark, as playback passes it. Seeking passes none. */
    onEvent: ((mark: Mark) => void) | null;
    /** Playback reached the end, or `skip()` jumped there. Not called while looping. */
    onEnd: (() => void) | null;
    readonly cameraTrack: CameraTrack | null;
    private binds;
    private listeners;
    private values;
    private clip;
    private live;
    constructor(script: Script, o?: TimelineOptions);
    /** Calls `fn` with the value of track `name` every time it's worked out: on every update and seek, and now. */
    bind(name: string, fn: (v: Value) => void): this;
    /** Calls `fn` when playback passes a mark called `name`. */
    on(name: string, fn: (m: Mark) => void): this;
    /** Track `name`'s value at time `t` (now, by default). */
    value(name: string, t?: number): Value | undefined;
    /** Plays from `from`, or from where it is (the start, once it's over). */
    play(from?: number): void;
    /** Holds still: the picture too. */
    pause(): void;
    /** Stops playing and lets the director's clock go again, without calling `onEnd`: for leaving a timeline half way. */
    stop(): void;
    /** Jumps to the end, telling the game about nothing on the way, and calls `onEnd`. */
    skip(): void;
    /** Goes to time `t`, exactly as if it had played there, without events or sounds on the way. */
    seek(t: number): void;
    /** Moves on by `dt` seconds of game time while playing. Call it before the director's own update. */
    update(dt: number): void;
    /** Where it's at, for a panel or the console. */
    inspect(): TimelineState;
    /** What's wrong with the script, as sentences: shots the director doesn't have, clips that overlap. Empty is good. */
    problems(): string[];
    private advance;
    private passMarks;
    private apply;
    private end;
    private startSound;
    private startSounds;
    private stopSounds;
}
/** Between two values: numbers, or lists of them, one by one. */
export declare function mixValue(a: Value, b: Value, k: number): Value;
/** Sound for a timeline from Web Audio: decoded buffers by name, played through `out`. */
export declare function webAudio(ctx: AudioContext, buffers: Record<string, AudioBuffer>, out?: AudioNode): SoundPlayer;
