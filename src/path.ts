// A smooth curve through points (centripetal Catmull-Rom), measured by distance along it, for camera rails, dollies,
// cranes and tours. Distances past the ends stop at them, or go round on a closed path.
import { type V3, v3, set, sub, norm, len } from './math';

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

export function path(points: V3[], closed = false): Path {
    const n = points.length;
    if (n < 2) throw new Error('A path needs two points');
    const segs = closed ? n : n - 1;
    const pt = (i: number) => points[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))]!;

    // a point on segment i at u in 0..1
    const raw = (i: number, u: number, out: V3): V3 => {
        const p0 = pt(i - 1), p1 = pt(i), p2 = pt(i + 1), p3 = pt(i + 2);
        // centripetal knots, which keep the curve from looping or overshooting at sharp corners
        const k = (a: V3, b: V3) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])));
        const t1 = k(p0, p1), t2 = t1 + k(p1, p2), t3 = t2 + k(p2, p3);
        const t = t1 + (t2 - t1) * u;
        for (let c = 0; c < 3; c++) {
            const a1 = ((t1 - t) * p0[c]! + t * p1[c]!) / t1;
            const a2 = ((t2 - t) * p1[c]! + (t - t1) * p2[c]!) / (t2 - t1);
            const a3 = ((t3 - t) * p2[c]! + (t - t2) * p3[c]!) / (t3 - t2);
            const b1 = ((t2 - t) * a1 + t * a2) / t2;
            const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
            out[c] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
        }
        return out;
    };

    // a table of distance against (segment, u), for even speed
    const STEPS = 24;
    const table: { d: number; i: number; u: number }[] = [];
    let total = 0;
    const a = v3(), b = v3();
    raw(0, 0, a);
    table.push({ d: 0, i: 0, u: 0 });
    for (let i = 0; i < segs; i++) {
        for (let s = 1; s <= STEPS; s++) {
            raw(i, s / STEPS, b);
            total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
            table.push({ d: total, i, u: s / STEPS });
            set(a, b[0], b[1], b[2]);
        }
    }
    const length = total;
    const wrapD = (d: number) => closed ? ((d % length) + length) % length : Math.max(0, Math.min(length, d));
    const locate = (d: number) => {
        d = wrapD(d);
        let lo = 0, hi = table.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (table[mid]!.d <= d) lo = mid; else hi = mid; }
        const A = table[lo]!, B = table[hi]!;
        const f = B.d > A.d ? (d - A.d) / (B.d - A.d) : 0;
        // across a join, A is the end of one segment, which is the start (u 0) of the next one, B's
        if (B.i !== A.i) return { i: B.i, u: B.u * f };
        return { i: A.i, u: A.u + (B.u - A.u) * f };
    };
    const at = (d: number, out: V3 = v3()) => { const l = locate(d); return raw(l.i, l.u, out); };
    const e1 = v3(), e2 = v3();
    const along = (d: number, out: V3 = v3()) => {
        const h = Math.max(0.01, length * 1e-4);
        const lo = closed ? d - h : Math.max(0, d - h), hi = closed ? d + h : Math.min(length, d + h);
        at(lo, e1); at(hi, e2);
        sub(out, e2, e1);
        return len(out) > 1e-9 ? norm(out, out) : set(out, 0, 0, -1);
    };
    const probe = v3();
    const nearest = (p: Readonly<V3>) => {
        // coarse then fine
        let best = 0, bd = Infinity;
        const coarse = Math.max(64, Math.ceil(length / 2));
        for (let s = 0; s <= coarse; s++) {
            const d = (s / coarse) * length;
            at(d, probe);
            const q = (probe[0] - p[0]) ** 2 + (probe[1] - p[1]) ** 2 + (probe[2] - p[2]) ** 2;
            if (q < bd) { bd = q; best = d; }
        }
        let step = length / coarse;
        for (let k = 0; k < 12; k++) {
            step /= 2;
            for (const d of [best - step, best + step]) {
                at(d, probe);
                const q = (probe[0] - p[0]) ** 2 + (probe[1] - p[1]) ** 2 + (probe[2] - p[2]) ** 2;
                if (q < bd) { bd = q; best = wrapD(d); }
            }
        }
        return best;
    };
    return { points, closed, length, at, along, nearest };
}
