import { describe, expect, it } from 'vitest';
import { ApplicationError } from '../../src';

describe('ApplicationError', () => {
    it('should extend Error', () => {
        const error = new ApplicationError('test');
        expect(error).toBeInstanceOf(Error);
    });

    it('should have name set to ApplicationError', () => {
        const error = new ApplicationError('test');
        expect(error.name).toBe('ApplicationError');
    });

    it('should work with instanceof', () => {
        const error = new ApplicationError('test');
        expect(error instanceof ApplicationError).toBe(true);
    });

    it('should preserve the message', () => {
        const error = new ApplicationError('something went wrong');
        expect(error.message).toBe('something went wrong');
    });
});
