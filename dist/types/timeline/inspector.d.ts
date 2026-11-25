import { type Timeline } from './timeline';
export type InspectorOptions = {
    /** Where it goes. Default document.body. */
    parent?: HTMLElement;
    /** Names to show for tracks, by track name. */
    labels?: Record<string, string>;
};
export type Inspector = {
    el: HTMLElement;
    /** Shows or hides it. */
    show(on: boolean): void;
    /** Takes it off the page for good. */
    stop(): void;
};
export declare function inspector(tl: Timeline, o?: InspectorOptions): Inspector;
