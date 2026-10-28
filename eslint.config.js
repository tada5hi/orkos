import config from '@tada5hi/eslint-config';

export default [
    ...await config(),
    {
        ignores: ['dist/**'],
    },
    {
        rules: {
            // maintainer: declined 2026-10-28
            '@stylistic/object-curly-newline': 'off',
        },
    },
];
