// A timeline for games: camera shots, values, sounds, events and kicks laid out against time, the way a video editor
// lays out clips. A script is plain data (JSON), so it can be written by hand or by a tool, saved, and read in a
// diff. Played, it drives a Director and calls you back. Scrubbed, it lands exactly where playing would have: it
// replays the camera from the last cut rather than guessing where a moving shot would be.
import type { Director } from '../director';
import { ease as eases } from '../math';
import type { Kick } from '../shake';

export type EaseName = keyof typeof eases;
export type Value = number | number[];
/** A keyframe: a time, a value, and how it gets there from the key before. Default 'smooth'; 'cut' holds, then jumps. */
export type Key = [at: number, value: Value, ease?: EaseName];

/** A shot on screen from `at` for `length` seconds, blending in from the picture before over `blend` seconds. */
export type CameraClip = { at: number; length: number; shot: string; blend?: number; ease?: EaseName; arc?: boolean };
/** A sound from `at`, `offset` seconds into it, for `length` seconds or until it ends. */
export type SoundClip = { at: number; sound: string; length?: number; offset?: number; gain?: number };
/** A moment to tell the game about. */
export type Mark = { at: number; name: string; data?: unknown };
/** A kick to the camera at a moment: see Kick. */
export type KickMark = Kick & { at: number };

export type CameraTrack = { kind: 'camera'; name?: string; clips: CameraClip[] };
/** A value the game reads or binds to: a number, or a list of them (a position, a colour). */
export type ValueTrack = { kind: 'value'; name: string; keys: Key[] };
export type SoundTrack = { kind: 'sound'; name?: string; clips: SoundClip[] };
export type EventTrack = { kind: 'event'; name?: string; marks: Mark[] };
export type ShakeTrack = { kind: 'shake'; name?: string; kicks: KickMark[] };
export type Track = CameraTrack | ValueTrack | SoundTrack | EventTrack | ShakeTrack;

export type Script = { name?: string; length?: number; tracks: Track[] };

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

export class Timeline {
    readonly script: Script;
    readonly name: string;
    readonly length: number;
    /** Seconds in. */
    time = 0;
    playing = false;
    /** Playback speed: 0.5 is half speed. The camera follows it. */
    speed = 1;
    loop: boolean;
    director: Director | null;
    sounds: SoundPlayer | null;
    step: number;
    /** Every event mark, as playback passes it. Seeking passes none. */
    onEvent: ((mark: Mark) => void) | null = null;
    /** Playback reached the end, or `skip()` jumped there. Not called while looping. */
    onEnd: (() => void) | null = null;

    readonly cameraTrack: CameraTrack | null;
    private binds = new Map<string, ((v: Value) => void)[]>();
    private listeners = new Map<string, ((m: Mark) => void)[]>();
    private values = new Map<string, ValueTrack>();
    private clip = -1;
    private live: { clip: SoundClip; handle: unknown }[] = [];

    constructor(script: Script, o: TimelineOptions = {}) {
        this.script = script;
        this.name = script.name ?? 'Timeline';
        this.director = o.director ?? null;
        this.sounds = o.sounds ?? null;
        this.loop = o.loop ?? false;
        this.step = o.step ?? 1 / 60;
        const byAt = (a: { at: number }, b: { at: number }) => a.at - b.at;
        let end = 0;
        for (const t of script.tracks) {
            if (t.kind === 'camera') { t.clips.sort(byAt); for (const c of t.clips) end = Math.max(end, c.at + c.length); }
            else if (t.kind === 'value') { t.keys.sort((a, b) => a[0] - b[0]); this.values.set(t.name, t); for (const k of t.keys) end = Math.max(end, k[0]); }
            else if (t.kind === 'sound') { t.clips.sort(byAt); for (const c of t.clips) end = Math.max(end, c.at + (c.length ?? 0)); }
            else if (t.kind === 'event') { t.marks.sort(byAt); for (const m of t.marks) end = Math.max(end, m.at); }
            else { t.kicks.sort(byAt); for (const k of t.kicks) end = Math.max(end, k.at + (k.time ?? 0.4)); }
        }
        this.length = script.length ?? end;
        this.cameraTrack = (script.tracks.find(t => t.kind === 'camera') as CameraTrack | undefined) ?? null;
    }

    /** Calls `fn` with the value of track `name` every time it's worked out: on every update and seek, and now. */
    bind(name: string, fn: (v: Value) => void): this {
        const list = this.binds.get(name) ?? [];
        list.push(fn);
        this.binds.set(name, list);
        const v = this.value(name);
        if (v !== undefined) fn(v);
        return this;
    }
    /** Calls `fn` when playback passes a mark called `name`. */
    on(name: string, fn: (m: Mark) => void): this {
        const list = this.listeners.get(name) ?? [];
        list.push(fn);
        this.listeners.set(name, list);
        return this;
    }
    /** Track `name`'s value at time `t` (now, by default). */
    value(name: string, t = this.time): Value | undefined {
        const track = this.values.get(name);
        if (!track || !track.keys.length) return undefined;
        const keys = track.keys;
        if (t <= keys[0]![0]) return keys[0]![1];
        for (let i = 1; i < keys.length; i++) {
            const b = keys[i]!;
            if (t > b[0]) continue;
            const a = keys[i - 1]!, span = b[0] - a[0];
            const k = span > 0 ? eases[b[2] ?? 'smooth']((t - a[0]) / span) : 1;
            return mixValue(a[1], b[1], k);
        }
        return keys[keys.length - 1]![1];
    }

    /** Plays from `from`, or from where it is (the start, once it's over). */
    play(from?: number) {
        if (from !== undefined || this.clip < 0 || this.time >= this.length) this.seek(from ?? (this.time >= this.length ? 0 : this.time));
        this.playing = true;
        if (this.director) this.director.rate = this.speed;
        this.startSounds();
    }
    /** Holds still: the picture too. */
    pause() {
        this.playing = false;
        if (this.director) this.director.rate = 0;
        this.stopSounds();
    }
    /** Stops playing and lets the director's clock go again, without calling `onEnd`: for leaving a timeline half way. */
    stop() {
        this.playing = false;
        if (this.director) this.director.rate = 1;
        this.stopSounds();
    }
    /** Jumps to the end, telling the game about nothing on the way, and calls `onEnd`. */
    skip() {
        this.stopSounds();
        this.time = this.length;
        this.apply();
        this.end();
    }

    /** Goes to time `t`, exactly as if it had played there, without events or sounds on the way. */
    seek(t: number) {
        t = Math.max(0, Math.min(this.length, t));
        this.stopSounds();
        const d = this.director, clips = this.cameraTrack?.clips ?? [];
        let i = -1;
        while (i + 1 < clips.length && clips[i + 1]!.at <= t) i++;
        if (d && i >= 0) {
            // replay from the last cut: a blend needs the picture it blends from
            let j = i;
            while (j > 0 && (clips[j]!.blend ?? 0) > 0) j--;
            const rate = d.rate;
            d.rate = 1;
            d.shaker.clear();
            this.time = clips[j]!.at;
            this.apply();
            this.clip = j;
            d.cut(clips[j]!.shot);
            while (this.time < t - 1e-9) {
                // in even steps, landing on every clip's start, and on t
                let b = Math.min(this.time + this.step, t);
                const next = clips[this.clip + 1];
                if (next && next.at > this.time && next.at < b) b = next.at;
                const a = this.time;
                this.advance(a, b, false);
                d.update(b - a);
            }
            d.rate = rate;
        } else {
            this.clip = i;
            this.time = t;
            this.apply();
        }
        if (this.playing) this.startSounds();
    }

    /** Moves on by `dt` seconds of game time while playing. Call it before the director's own update. */
    update(dt: number) {
        if (!this.playing || !(dt > 0)) return;
        if (this.director) this.director.rate = this.speed;
        const a = this.time, b = a + dt * this.speed;
        if (b < this.length) { this.advance(a, b, true); return; }
        this.advance(a, this.length, true);
        // marks right on the end
        this.passMarks(this.length, Infinity, true);
        if (this.loop) this.seek(b - this.length);
        else this.end();
    }

    /** Where it's at, for a panel or the console. */
    inspect(): TimelineState {
        const clip = this.cameraTrack?.clips[this.clip];
        const values: Record<string, Value> = {};
        for (const name of this.values.keys()) values[name] = this.value(name)!;
        return {
            name: this.name, time: this.time, length: this.length, playing: this.playing,
            shot: clip?.shot ?? null,
            blend: clip && clip.blend ? Math.min(1, (this.time - clip.at) / clip.blend) : 1,
            values,
            sounds: this.live.map(l => l.clip.sound)
        };
    }

    /** What's wrong with the script, as sentences: shots the director doesn't have, clips that overlap. Empty is good. */
    problems(): string[] {
        const out: string[] = [];
        const clips = this.cameraTrack?.clips ?? [];
        for (let i = 0; i < clips.length; i++) {
            const c = clips[i]!, n = clips[i + 1];
            if (this.director && !this.director.get(c.shot)) out.push(`No shot called "${c.shot}" at ${c.at}s`);
            if (n && c.at + c.length > n.at + 1e-6) out.push(`"${c.shot}" runs into "${n.shot}" at ${n.at}s`);
            if ((c.blend ?? 0) > c.length) out.push(`"${c.shot}" blends in for longer than it's on`);
        }
        if (this.script.tracks.filter(t => t.kind === 'camera').length > 1) out.push('Only the first camera track is played');
        for (const t of this.script.tracks) {
            if (t.kind !== 'value') continue;
            const kinds = new Set(t.keys.map(k => (Array.isArray(k[1]) ? k[1].length : 0)));
            if (kinds.size > 1) out.push(`"${t.name}" mixes numbers and lists`);
        }
        return out;
    }

    // a <= at < b, for everything that happens at a moment
    private advance(a: number, b: number, live: boolean) {
        const d = this.director;
        for (const t of this.script.tracks) if (t.kind === 'shake' && d) for (const k of t.kicks) if (k.at >= a && k.at < b) d.kick(k);
        this.time = b;
        this.apply();
        // the camera: the last clip that's started, from the one that's on
        const clips = this.cameraTrack?.clips;
        if (clips && d) {
            let n = this.clip;
            while (n + 1 < clips.length && clips[n + 1]!.at < b) n++;
            if (n !== this.clip) {
                this.clip = n;
                const c = clips[n]!;
                if ((c.blend ?? 0) > 0 && d.live) d.blend(c.shot, c.blend!, { ease: c.ease, arc: c.arc });
                else d.cut(c.shot);
            }
        }
        this.passMarks(a, b, live);
        if (!live || !this.sounds) return;
        for (const t of this.script.tracks) if (t.kind === 'sound') for (const c of t.clips) {
            if (c.at >= a && c.at < b) this.startSound(c, b - c.at);
        }
        for (let i = this.live.length - 1; i >= 0; i--) {
            const l = this.live[i]!;
            if (l.clip.length !== undefined && b >= l.clip.at + l.clip.length) { this.sounds.stop(l.handle); this.live.splice(i, 1); }
        }
    }
    private passMarks(a: number, b: number, live: boolean) {
        if (!live) return;
        for (const t of this.script.tracks) if (t.kind === 'event') for (const m of t.marks) {
            if (m.at < a || m.at >= b) continue;
            this.onEvent?.(m);
            for (const fn of this.listeners.get(m.name) ?? []) fn(m);
        }
    }
    private apply() {
        for (const [name, fns] of this.binds) {
            const v = this.value(name);
            if (v !== undefined) for (const fn of fns) fn(v);
        }
    }
    private end() {
        this.playing = false;
        if (this.director) this.director.rate = 1;
        this.onEnd?.();
    }
    private startSound(c: SoundClip, into: number) {
        if (!this.sounds) return;
        const offset = (c.offset ?? 0) + into;
        const known = this.sounds.duration?.(c.sound);
        if (known !== undefined && offset >= known) return;
        this.live.push({ clip: c, handle: this.sounds.play(c.sound, offset, c.gain ?? 1) });
    }
    // every sound that should be playing at this moment
    private startSounds() {
        this.stopSounds();
        if (!this.sounds || !this.playing) return;
        for (const t of this.script.tracks) if (t.kind === 'sound') for (const c of t.clips) {
            const into = this.time - c.at;
            if (into < 0 || (c.length !== undefined && into >= c.length)) continue;
            this.startSound(c, into);
        }
    }
    private stopSounds() {
        for (const l of this.live) this.sounds?.stop(l.handle);
        this.live.length = 0;
    }
}

/** Between two values: numbers, or lists of them, one by one. */
export function mixValue(a: Value, b: Value, k: number): Value {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * k;
    const la = typeof a === 'number' ? [a] : a, lb = typeof b === 'number' ? [b] : b;
    const out: number[] = [];
    for (let i = 0; i < Math.max(la.length, lb.length); i++) {
        const x = la[i] ?? la[la.length - 1] ?? 0, y = lb[i] ?? lb[lb.length - 1] ?? 0;
        out.push(x + (y - x) * k);
    }
    return out;
}

/** Sound for a timeline from Web Audio: decoded buffers by name, played through `out`. */
export function webAudio(ctx: AudioContext, buffers: Record<string, AudioBuffer>, out: AudioNode = ctx.destination): SoundPlayer {
    return {
        play(sound, offset, gain) {
            const buffer = buffers[sound];
            if (!buffer) return null;
            const src = ctx.createBufferSource(), g = ctx.createGain();
            src.buffer = buffer;
            g.gain.value = gain;
            src.connect(g).connect(out);
            src.start(0, Math.max(0, offset));
            return src;
        },
        stop(handle) { try { (handle as AudioBufferSourceNode | null)?.stop(); } catch { /* already over */ } },
        duration: sound => buffers[sound]?.duration
    };
}
