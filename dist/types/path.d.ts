import { type V3 } from './math';
export type Path = {
    points: V3[];
    closed: boolean;
    /** Its length in world units. */
    length: number;
    /** Where it is, a distance along. */
    at(d: number, out?: V3): V3;
    /** Which way it runs, a distance along: unit length. */
    along(d: number, out?: V3): V3;
    /** The distance along it of the point nearest `p`. */
    nearest(p: Readonly<V3>): number;
};
export declare function path(points: V3[], closed?: boolean): Path;
