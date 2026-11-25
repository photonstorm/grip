import { type Frame } from './frame';
import { type Path } from './path';
import { type Ctx, Shot, type ShotOptions, type Subject, type Zone } from './shot';
import { type V3, type Ease } from './math';
export type FollowOptions = ShotOptions & {
    /** How far behind. */
    distance?: number;
    /** How far above. */
    height?: number;
    /** How far to the side: positive is right, for an over-the-shoulder look. */
    side?: number;
    /** Seconds of the subject's movement to look ahead by. */
    ahead?: number;
    /** Seconds the camera takes to catch up where it should be. */
    lag?: number;
    /** The furthest it may ever trail, whatever the speed. */
    leash?: number;
    /** Seconds it takes to swing round behind as the subject turns. */
    swing?: number;
    /** The most it may lag the subject's turning, in degrees. */
    maxSwing?: number;
};
export declare class Follow extends Shot {
    readonly kind = "follow";
    distance: number;
    height: number;
    side: number;
    ahead: number;
    lag: number;
    leash: number;
    swing: number;
    maxSwing: number;
    private eye;
    private aim;
    private dir;
    private facing;
    constructor(subject: Subject, o?: FollowOptions);
    protected forget(): void;
    protected place(f: Frame, dt: number): void;
}
export type OrbitOptions = ShotOptions & {
    /** Where it starts: degrees round (0 is behind something facing -z), degrees up, and how far. */
    yaw?: number;
    pitch?: number;
    distance?: number;
    pitchRange?: [number, number];
    distanceRange?: [number, number];
    /** Seconds to catch up a moving subject. */
    lag?: number;
    leash?: number;
    /** Seconds the turns and zooms take to settle: 0 follows the hand exactly. */
    ease?: number;
    /** Degrees a second it turns by itself once nobody's touching it. */
    drift?: number;
    /** Where the centre may be panned to: min x, y, z, max x, y, z. */
    panRoom?: [number, number, number, number, number, number];
    /** Pans along the ground, as a map does: up the picture moves the centre forward, not up. */
    flat?: boolean;
};
export declare class Orbit extends Shot {
    readonly kind = "orbit";
    /** The point it orbits when there's no subject. */
    readonly center: V3;
    /** How far it's been panned from the subject or centre. */
    readonly pan: V3;
    yaw: number;
    pitch: number;
    distance: number;
    pitchRange: [number, number];
    distanceRange: [number, number];
    lag: number;
    leash: number;
    ease: number;
    drift: number;
    panRoom: OrbitOptions['panRoom'] | null;
    flat: boolean;
    /** Seconds since the player last touched it. */
    idle: number;
    private sy;
    private sp;
    private sd;
    private c;
    private easeTo;
    constructor(subject: Subject | null, o?: OrbitOptions);
    protected forget(): void;
    /** Turns it, in degrees: right and up. */
    turn(yaw: number, pitch: number): void;
    /** Zooms by a factor: 2 is twice as close. */
    zoomBy(k: number): void;
    /** Pans the centre across the picture, in world units: right and up as the camera sees them. */
    panBy(right: number, up: number): void;
    /** Eases to a view over `time` seconds: degrees round, up, a distance, and a pan. */
    goTo(yaw: number, pitch: number, distance: number, pan?: Readonly<V3>, time?: number): void;
    /** Swings round behind the subject over `time` seconds. */
    behind(time?: number): void;
    /** Fits a sphere in the picture, keeping the angle. */
    fit(center: Readonly<V3>, radius: number, fov?: number, time?: number): void;
    /** The way the camera faces: flat for walking the way it looks. */
    forward(out: V3, flat?: boolean): V3;
    private clampAxes;
    protected place(f: Frame, dt: number): void;
}
export type SideOptions = ShotOptions & {
    /** Which way the camera looks, in degrees round: 0 down -z, the side-on default. */
    yaw?: number;
    /** Degrees up or down it looks: -90 is straight down, for top-down. */
    pitch?: number;
    /** How far back. */
    distance?: number;
    /** Where the subject sits in the picture: [x, y], -1 to 1. */
    screen?: [number, number];
    /** How far it can wander from there before the camera moves: [x, y] each way, as shares of half the view. */
    deadZone?: [number, number];
    /** Seconds of movement to frame ahead of the subject, sideways only. */
    ahead?: number;
    lag?: number;
    leash?: number;
};
export declare class Side extends Shot {
    readonly kind = "side";
    yaw: number;
    pitch: number;
    distance: number;
    screen: [number, number];
    deadZone: [number, number];
    ahead: number;
    lag: number;
    leash: number;
    private c;
    private center;
    private fresh;
    private lead;
    constructor(subject: Subject, o?: SideOptions);
    protected forget(): void;
    zones(): Zone[];
    protected place(f: Frame, dt: number, ctx: Ctx): void;
    /** Where the camera's centre is aiming: for a 2D game, the middle of the picture. */
    get middle(): Readonly<V3>;
}
export type FixedOptions = ShotOptions & {
    /** How far the subject may drift from the middle before it turns: [x, y] as shares of half the view. */
    deadZone?: [number, number];
    /** Seconds to turn. */
    lag?: number;
};
export declare class Fixed extends Shot {
    readonly kind = "fixed";
    readonly eye: V3;
    deadZone: [number, number];
    lag: number;
    private aim;
    private looking;
    private fresh;
    constructor(eye: Readonly<V3>, subject: Subject, o?: FixedOptions);
    protected forget(): void;
    zones(): Zone[];
    protected place(f: Frame, dt: number, ctx: Ctx): void;
}
export type LookPoint = {
    at: number;
    look: V3;
};
export type RailOptions = ShotOptions & {
    /** Where it starts, as a distance along. */
    travel?: number;
    /** Moves by itself from `from` to `to` (shares of the way, 0 to 1) in `duration` seconds, each time it goes live. */
    from?: number;
    to?: number;
    duration?: number;
    ease?: Ease;
    loop?: boolean;
    /** Or at this many units a second. */
    speed?: number;
    /** Or keeps level with a subject: the nearest point, plus `trackAhead`. */
    track?: Subject;
    trackAhead?: number;
    /** Offset from the path: right, up, along. */
    offset?: V3;
    /**
     * What it looks at: 'along' the path; a subject; or points placed along it, turning from one to the next as it
     * passes ({ at: distance as a share of the way, look }). Default 'along'.
     */
    look?: 'along' | Subject | LookPoint[];
    /** How long it holds each look point, 0 to 1: 0 turns evenly, 1 holds and turns late. */
    lookHold?: number;
    /** Banks into turns, like a coaster: degrees of roll for each degree a unit it turns, leaning into the turn. 0 is level. */
    bank?: number;
    maxBank?: number;
    /** Seconds to ease to a new place on the path. */
    lag?: number;
};
export declare class Rail extends Shot {
    readonly kind = "rail";
    readonly path: Path;
    /** Where it is, as a distance along. Set it yourself, or let it move by itself. */
    travel: number;
    from: number;
    to: number;
    duration: number;
    easeOf: Ease;
    loop: boolean;
    speed: number;
    track: Subject | null;
    trackAhead: number;
    offset: V3;
    look: RailOptions['look'];
    lookHold: number;
    bank: number;
    maxBank: number;
    lag: number;
    /** Seconds since it went live. */
    age: number;
    private t;
    private banked;
    constructor(p: Path, o?: RailOptions);
    wake(): void;
    protected forget(): void;
    /** How far it has left to go on a timed move, in seconds. */
    get left(): number;
    /** How far it banks, in degrees, a distance along: for drawing the track to match. */
    bankAt(d: number): number;
    protected place(f: Frame, dt: number): void;
}
export type LookOptions = ShotOptions & {
    /** Degrees round and up it starts at. */
    yaw?: number;
    pitch?: number;
    pitchRange?: [number, number];
    /** Seconds the turns take to settle. 0 follows the hand exactly. */
    ease?: number;
};
export declare class Look extends Shot {
    readonly kind = "look";
    yaw: number;
    pitch: number;
    pitchRange: [number, number];
    ease: number;
    private sy;
    private sp;
    constructor(head: Subject, o?: LookOptions);
    protected forget(): void;
    /** Turns, in degrees: right and up. */
    turn(yaw: number, pitch: number): void;
    /** Faces a point. */
    face(p: Readonly<V3>): void;
    forward(out: V3, flat?: boolean): V3;
    protected place(f: Frame, dt: number): void;
}
export type Member = Subject & {
    active?: boolean;
};
export type GroupOptions = ShotOptions & {
    yaw?: number;
    pitch?: number;
    /** How far back, for perspective; it moves further to fit. */
    distance?: number;
    /** Room round the members, in world units. */
    padding?: number;
    /** The tightest and widest it frames: half heights, in world units. */
    sizeRange?: [number, number];
    lag?: number;
    /** The one who must always be in the picture, whatever else: usually the player. */
    keep?: Subject;
};
export declare class Group extends Shot {
    readonly kind = "group";
    members: Member[];
    yaw: number;
    pitch: number;
    distance: number;
    padding: number;
    sizeRange: [number, number];
    lag: number;
    private c;
    private h;
    constructor(members: Member[], o?: GroupOptions);
    protected forget(): void;
    protected place(f: Frame, dt: number, ctx: Ctx): void;
}
export declare class Still extends Shot {
    readonly kind = "still";
    readonly eye: V3;
    readonly target: V3;
    constructor(eye: Readonly<V3>, at: Readonly<V3>, o?: ShotOptions);
    protected place(f: Frame): void;
}
export declare const follow: (s: Subject, o?: FollowOptions) => Follow;
export declare const orbit: (s: Subject | null, o?: OrbitOptions) => Orbit;
export declare const side: (s: Subject, o?: SideOptions) => Side;
export declare const fixed: (eye: Readonly<V3>, s: Subject, o?: FixedOptions) => Fixed;
export declare const rail: (p: Path, o?: RailOptions) => Rail;
export declare const look: (head: Subject, o?: LookOptions) => Look;
export declare const group: (m: Member[], o?: GroupOptions) => Group;
export declare const still: (eye: Readonly<V3>, at: Readonly<V3>, o?: ShotOptions) => Still;
