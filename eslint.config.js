import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const REGLAS_COMUNES = {
    // allowTemplateLiterals: los backticks sin interpolar son deliberados en los snippets de HTML
    quotes: ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
    semi: ['warn', 'always'],
    // De la sangría manda Prettier, y esta regla discrepa de él en ternarios y encadenados anidados
    indent: 'off',
    'no-console': 'off',
    'no-debugger': 'warn',
    // null: 'ignore' permite el idiom `x != null`, que cubre null Y undefined de una
    eqeqeq: ['warn', 'always', { null: 'ignore' }],
    'no-var': 'error',
    'prefer-const': 'warn',
    'no-duplicate-imports': 'error',
    'no-unreachable': 'error',
    'no-constant-condition': 'warn',
    'no-empty': ['warn', { allowEmptyCatch: true }],
};

const SIN_USAR = ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }];

export default [
    js.configs.recommended,

    // Node: los tests de Playwright y la configuración
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: { ...REGLAS_COMUNES, 'no-unused-vars': SIN_USAR, 'no-undef': 'warn' },
    },

    // Lo que dentro de un test corre en el navegador (page.evaluate)
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
        },
    },

    // La app: TypeScript en el navegador
    ...tseslint.configs.recommended.map((config) => ({
        ...config,
        files: ['**/*.ts'],
    })),
    {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser },
        },
        rules: {
            ...REGLAS_COMUNES,
            '@typescript-eslint/no-unused-vars': SIN_USAR,
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
        },
    },

    {
        ignores: ['node_modules/**', 'dist/**', 'playwright-report/**', 'test-results/**', '**/*.d.ts'],
    },
];
