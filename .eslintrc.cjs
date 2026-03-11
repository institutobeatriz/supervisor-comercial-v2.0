module.exports = {
  root: true,
  ignorePatterns: [
    'node_modules/**',
    'logs/**',
    'dist/**',
    'apps/**/dist/**',
    'packages/**/dist/**',
    'apps/dashboard/node_modules/**',
  ],
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint', 'react-hooks'],
      rules: {},
    },
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      rules: {},
    },
  ],
};
