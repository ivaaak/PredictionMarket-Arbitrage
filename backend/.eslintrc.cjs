module.exports = {
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  env: { node: true, es2022: true },
  plugins: ['@typescript-eslint'],
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    // LLM responses and worker messages are parsed from untyped JSON, so `any`
    // is deliberate at those boundaries.
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  root: true,
};
