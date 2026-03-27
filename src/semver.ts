/*
 * Copyright (c) 2025-2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

type SemverTuple = [number, number, number];

function parse(version: string): SemverTuple | undefined {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
        return undefined;
    }

    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(a: SemverTuple, b: SemverTuple): number {
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    if (a[2] !== b[2]) return a[2] - b[2];

    return 0;
}

export function satisfies(version: string, range: string): boolean {
    const v = parse(version);
    if (!v) {
        return false;
    }

    if (range.startsWith('>=')) {
        const r = parse(range.slice(2));
        return !!r && compare(v, r) >= 0;
    }

    if (range.startsWith('>')) {
        const r = parse(range.slice(1));
        return !!r && compare(v, r) > 0;
    }

    if (range.startsWith('<=')) {
        const r = parse(range.slice(2));
        return !!r && compare(v, r) <= 0;
    }

    if (range.startsWith('<')) {
        const r = parse(range.slice(1));
        return !!r && compare(v, r) < 0;
    }

    if (range.startsWith('~')) {
        // ~1.2.3 := >=1.2.3 <1.3.0
        const r = parse(range.slice(1));
        return !!r && v[0] === r[0] && v[1] === r[1] && v[2] >= r[2];
    }

    if (range.startsWith('^')) {
        // ^1.2.3 := >=1.2.3 <2.0.0
        // ^0.2.3 := >=0.2.3 <0.3.0
        // ^0.0.3 := >=0.0.3 <0.0.4
        const r = parse(range.slice(1));
        if (!r) {
            return false;
        }

        if (compare(v, r) < 0) {
            return false;
        }

        if (r[0] !== 0) {
            return v[0] === r[0];
        }

        if (r[1] !== 0) {
            return v[0] === 0 && v[1] === r[1];
        }

        return v[0] === 0 && v[1] === 0 && v[2] === r[2];
    }

    // Exact match
    const r = parse(range);
    return !!r && compare(v, r) === 0;
}
