import type { Look, Orbit } from './shots';
export type Hand = {
    /** Turns input on and off without letting go of the element. */
    enabled: boolean;
    /** Lets go of the element for good. */
    stop(): void;
    /** True while a finger or button is down: for telling a tap from a drag, the game asks `moved`. */
    readonly down: boolean;
    /** How far the current or last press travelled, in pixels. */
    readonly moved: number;
};
type Opts = {
    turn?: number;
    zoom?: number;
    pan?: boolean;
};
/** Drag to orbit, right-drag (or shift-drag, or two fingers) to pan, scroll or pinch to zoom. */
export declare function orbitHand(el: HTMLElement, shot: Orbit, o?: Opts): Hand;
/**
 * Look round in first person: with `capture`, a click captures the mouse where the browser allows it, and plain
 * movement looks; otherwise, and on touch, drag.
 */
export declare function lookHand(el: HTMLElement, shot: Look, o?: {
    turn?: number;
    capture?: boolean;
}): Hand & {
    readonly captured: boolean;
};
export {};
