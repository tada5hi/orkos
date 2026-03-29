import { describe, expect, it } from 'vitest';
import { BaseError } from 'ebec';
import { ApplicationError, ApplicationErrorCode } from '../../src';

describe('ApplicationError', () => {
    it('should extend BaseError', () => {
        const error = new ApplicationError('test');
        expect(error).toBeInstanceOf(BaseError);
    });

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

    it('should accept options with code', () => {
        const error = new ApplicationError({
            message: 'circular dependency',
            code: ApplicationErrorCode.CIRCULAR_DEPENDENCY,
        });
        expect(error.message).toBe('circular dependency');
        expect(error.code).toBe(ApplicationErrorCode.CIRCULAR_DEPENDENCY);
    });

    it('should accept string and options arguments', () => {
        const error = new ApplicationError('test', {
            code: ApplicationErrorCode.MODULE_NOT_FOUND,
        });
        expect(error.message).toBe('test');
        expect(error.code).toBe(ApplicationErrorCode.MODULE_NOT_FOUND);
    });
});
