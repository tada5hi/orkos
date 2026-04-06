/*
 * Copyright (c) 2025-2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

import type { ErrorInput } from '@ebec/core';
import { BaseError } from '@ebec/core';

/**
 * Thrown on circular dependencies, missing required modules, version constraint
 * violations, or external module resolution failures.
 *
 * Uses error codes from {@link ApplicationErrorCode} for programmatic handling.
 */
export class ApplicationError extends BaseError {
    constructor(input?: ErrorInput) {
        super(input);
    }
}
