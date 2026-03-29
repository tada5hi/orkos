/*
 * Copyright (c) 2025-2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

import type { Input } from 'ebec';
import { BaseError } from 'ebec';

/**
 * Thrown on circular dependencies, missing required modules, version constraint
 * violations, or external module resolution failures.
 *
 * Uses error codes from {@link ApplicationErrorCode} for programmatic handling.
 */
export class ApplicationError extends BaseError {
    constructor(...input: Input[]) {
        super(...input);
    }
}
