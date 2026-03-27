import { describe, expect, it } from 'vitest';
import { satisfies } from '../../src/semver.ts';

describe('satisfies', () => {
    describe('exact match', () => {
        it('should match exact version', () => {
            expect(satisfies('1.2.3', '1.2.3')).toBe(true);
        });

        it('should not match different version', () => {
            expect(satisfies('1.2.4', '1.2.3')).toBe(false);
        });
    });

    describe('>= operator', () => {
        it('should match equal version', () => {
            expect(satisfies('2.0.0', '>=2.0.0')).toBe(true);
        });

        it('should match greater version', () => {
            expect(satisfies('2.1.0', '>=2.0.0')).toBe(true);
        });

        it('should not match lower version', () => {
            expect(satisfies('1.9.9', '>=2.0.0')).toBe(false);
        });
    });

    describe('> operator', () => {
        it('should match greater version', () => {
            expect(satisfies('2.0.1', '>2.0.0')).toBe(true);
        });

        it('should not match equal version', () => {
            expect(satisfies('2.0.0', '>2.0.0')).toBe(false);
        });
    });

    describe('<= operator', () => {
        it('should match equal version', () => {
            expect(satisfies('2.0.0', '<=2.0.0')).toBe(true);
        });

        it('should match lower version', () => {
            expect(satisfies('1.9.0', '<=2.0.0')).toBe(true);
        });

        it('should not match greater version', () => {
            expect(satisfies('2.0.1', '<=2.0.0')).toBe(false);
        });
    });

    describe('< operator', () => {
        it('should match lower version', () => {
            expect(satisfies('1.9.9', '<2.0.0')).toBe(true);
        });

        it('should not match equal version', () => {
            expect(satisfies('2.0.0', '<2.0.0')).toBe(false);
        });
    });

    describe('~ operator (patch-level)', () => {
        it('should match same minor with higher patch', () => {
            expect(satisfies('1.2.5', '~1.2.3')).toBe(true);
        });

        it('should match exact version', () => {
            expect(satisfies('1.2.3', '~1.2.3')).toBe(true);
        });

        it('should not match lower patch', () => {
            expect(satisfies('1.2.2', '~1.2.3')).toBe(false);
        });

        it('should not match different minor', () => {
            expect(satisfies('1.3.0', '~1.2.3')).toBe(false);
        });

        it('should not match different major', () => {
            expect(satisfies('2.2.3', '~1.2.3')).toBe(false);
        });
    });

    describe('^ operator (compatible)', () => {
        it('should match same major with higher minor', () => {
            expect(satisfies('1.3.0', '^1.2.3')).toBe(true);
        });

        it('should match exact version', () => {
            expect(satisfies('1.2.3', '^1.2.3')).toBe(true);
        });

        it('should not match different major', () => {
            expect(satisfies('2.0.0', '^1.2.3')).toBe(false);
        });

        it('should not match lower version', () => {
            expect(satisfies('1.2.2', '^1.2.3')).toBe(false);
        });

        describe('0.x special cases', () => {
            it('^0.2.3 should match 0.2.5', () => {
                expect(satisfies('0.2.5', '^0.2.3')).toBe(true);
            });

            it('^0.2.3 should not match 0.3.0', () => {
                expect(satisfies('0.3.0', '^0.2.3')).toBe(false);
            });

            it('^0.0.3 should match 0.0.3', () => {
                expect(satisfies('0.0.3', '^0.0.3')).toBe(true);
            });

            it('^0.0.3 should not match 0.0.4', () => {
                expect(satisfies('0.0.4', '^0.0.3')).toBe(false);
            });
        });
    });

    describe('invalid input', () => {
        it('should return false for invalid version', () => {
            expect(satisfies('not-a-version', '>=1.0.0')).toBe(false);
        });

        it('should return false for invalid range', () => {
            expect(satisfies('1.0.0', '>=not-valid')).toBe(false);
        });
    });
});
