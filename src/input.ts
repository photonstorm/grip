// Mouse and touch for the shots people steer: drag to turn an orbit, scroll or pinch to zoom, right-drag or two
// fingers to pan; or drag (or capture the mouse) to look round in first person. Kept apart from the rest, so the
// camera itself never touches the page.
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

type Opts = { turn?: number; zoom?: number; pan?: boolean };

/** Drag to orbit, right-drag (or shift-drag, or two fingers) to pan, scroll or pinch to zoom. */
export function orbitHand(el: HTMLElement, shot: Orbit, o: Opts = {}): Hand {
    const turn = o.turn ?? 0.3, zoom = o.zoom ?? 0.0015, canPan = o.pan ?? false;
    const pts = new Map<number, { x: number; y: number }>();
    let panning = false, moved = 0, pinch = 0;
    const hand = {
        enabled: true,
        get down() { return pts.size > 0; },
        get moved() { return moved; },
        stop: () => { for (const [t, f] of offs) el.removeEventListener(t, f as EventListener); }
    };
    const panPixels = (dx: number, dy: number) => {
        // a pixel's worth of world at the orbit's distance
        const k = (2 * shot.distance * Math.tan((shot.fov * Math.PI) / 360)) / Math.max(1, el.clientHeight);
        shot.panBy(-dx * k, dy * k);
    };
    const down = (e: PointerEvent) => {
        if (!hand.enabled) return;
        try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = 0;
        panning = canPan && (e.button === 2 || e.shiftKey);
        if (pts.size === 2) pinch = spread();
    };
    const move = (e: PointerEvent) => {
        const p = pts.get(e.pointerId);
        if (!p || !hand.enabled) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        moved += Math.hypot(dx, dy);
        if (pts.size === 2) {
            const s = spread();
            if (pinch > 0 && s > 0) shot.zoomBy(s / pinch);
            pinch = s;
            if (canPan) panPixels(dx / 2, dy / 2);
            return;
        }
        if (panning) panPixels(dx, dy);
        else shot.turn(dx * turn, dy * turn);
    };
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
    const wheel = (e: WheelEvent) => {
        if (!hand.enabled) return;
        e.preventDefault();
        shot.zoomBy(Math.exp(-e.deltaY * zoom));
    };
    const spread = () => { const [a, b] = [...pts.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
    const menu = (e: Event) => { if (canPan) e.preventDefault(); };
    const offs: [string, (e: never) => void][] = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['wheel', wheel], ['contextmenu', menu]];
    for (const [t, f] of offs) el.addEventListener(t, f as EventListener, { passive: false });
    el.style.touchAction = 'none';
    return hand;
}

/**
 * Look round in first person: with `capture`, a click captures the mouse where the browser allows it, and plain
 * movement looks; otherwise, and on touch, drag.
 */
export function lookHand(el: HTMLElement, shot: Look, o: { turn?: number; capture?: boolean } = {}): Hand & { readonly captured: boolean } {
    const turn = o.turn ?? 0.15, capture = o.capture ?? true;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    const hand = {
        enabled: true,
        get down() { return pts.size > 0; },
        get moved() { return moved; },
        get captured() { return document.pointerLockElement === el; },
        stop: () => {
            for (const [t, f] of offs) (t === 'mousemove' ? document : el).removeEventListener(t, f as EventListener);
            if (document.pointerLockElement === el) document.exitPointerLock();
        }
    };
    // a zoomed lens turns slower, so the same hand movement covers the same part of the picture
    const k = () => turn / Math.max(1, shot.zoom);
    const down = (e: PointerEvent) => {
        if (!hand.enabled) return;
        moved = 0;
        if (capture && e.pointerType === 'mouse' && document.pointerLockElement !== el) {
            try { void Promise.resolve(el.requestPointerLock?.()).catch(() => {}); } catch { /* refused: drag instead */ }
        }
        try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const move = (e: PointerEvent) => {
        if (!hand.enabled || document.pointerLockElement === el) return;
        const p = pts.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        moved += Math.hypot(dx, dy);
        shot.turn(dx * k(), -dy * k());
    };
    const locked = (e: MouseEvent) => {
        if (!hand.enabled || document.pointerLockElement !== el) return;
        shot.turn(e.movementX * k(), -e.movementY * k());
    };
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); };
    const offs: [string, (e: never) => void][] = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['mousemove', locked]];
    for (const [t, f] of offs) (t === 'mousemove' ? document : el).addEventListener(t, f as EventListener);
    el.style.touchAction = 'none';
    return hand;
}
