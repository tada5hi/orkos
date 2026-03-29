/*
 * Copyright (c) 2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

export enum ModuleStatus {
    Pending = 'pending',
    SettingUp = 'setting-up',
    Ready = 'ready',
    TearingDown = 'tearing-down',
    TornDown = 'torn-down',
    Failed = 'failed',
}

export enum ApplicationErrorCode {
    CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
    MODULE_NOT_FOUND = 'MODULE_NOT_FOUND',
    INVALID_MODULE_EXPORT = 'INVALID_MODULE_EXPORT',
    MODULE_INSTALL_FAILED = 'MODULE_INSTALL_FAILED',
    OPTIONS_NOT_SUPPORTED = 'OPTIONS_NOT_SUPPORTED',
    RESOLUTION_DEPTH_EXCEEDED = 'RESOLUTION_DEPTH_EXCEEDED',
    VERSION_MISMATCH = 'VERSION_MISMATCH',
    MODULE_NOT_REGISTERED = 'MODULE_NOT_REGISTERED',
}
