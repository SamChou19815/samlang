// @ts-check

/**
 * @param {string} package
 * @returns {string | undefined}
 */
const conditionalResolve = (package) => {
  try {
    require.resolve(package);
    return package;
  } catch {
    return undefined;
  }
};

const jsxA11Y = conditionalResolve('eslint-plugin-jsx-a11y');
const react = conditionalResolve('eslint-plugin-react');
const reactHooks = conditionalResolve('eslint-plugin-react-hooks');

module.exports = (
  /** @type {string} */ resolvedTypescriptESLintParserModulePath,
  /** @type {string} */ resolvedESlintImportResolverNodeModulePath
) => ({
  env: { browser: true, node: true, jest: true },
  globals: { Deno: 'readonly' },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    ...[jsxA11Y, react].filter(Boolean).map((packageName) => `plugin:${packageName}/recommended`),
  ],
  parser: resolvedTypescriptESLintParserModulePath,
  plugins: ['@typescript-eslint', 'import', ...[jsxA11Y, react, reactHooks].filter(Boolean)],
  rules: {
    '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-require-imports': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { args: 'after-used', ignoreRestSiblings: true, vars: 'all', varsIgnorePattern: '_' },
    ],
    complexity: 'off',
    'class-methods-use-this': 'error',
    'consistent-return': 'off',
    curly: ['error', 'multi-line'],
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'guard-for-in': 'error',
    'import/first': 'error',
    'import/prefer-default-export': 'warn',
    'import/no-absolute-path': 'error',
    'import/no-anonymous-default-export': 'error',
    'import/no-duplicates': 'error',
    'import/no-dynamic-require': 'error',
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: true,
        peerDependencies: true,
        optionalDependencies: false,
      },
    ],
    'import/no-named-default': 'error',
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', ['parent', 'sibling', 'index']],
        pathGroupsExcludedImportTypes: ['builtin'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: false },
      },
    ],
    'no-alert': 'off',
    'no-console': 'warn',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-empty-function': 'off',
    'no-eq-null': 'off',
    'no-eval': 'error',
    'no-fallthrough': 'off', // TypeScript can already check this
    'no-implicit-coercion': ['off', { boolean: false, number: true, string: true, allow: [] }],
    'no-implied-eval': 'error',
    'no-labels': ['error', { allowLoop: true, allowSwitch: true }],
    'no-lone-blocks': 'off',
    'no-param-reassign': ['error', { props: false }],
    'no-proto': 'error',
    'no-return-assign': ['error', 'always'],
    'no-sequences': 'error',
    'no-shadow': 'error',
    'no-shadow-restricted-names': 'error',
    'no-template-curly-in-string': 'error',
    'no-underscore-dangle': 'off',
    'no-useless-constructor': 'off',
    'no-useless-return': 'off',
    'no-use-before-define': 'off', // Already covered by TypeScript
    'no-unused-expressions': 'off', // Already covered by typescript-eslint
    'no-var': 'error',
    'object-shorthand': ['error', 'always', { ignoreConstructors: false, avoidQuotes: true }],
    'prefer-const': ['error', { destructuring: 'any', ignoreReadBeforeAssign: true }],
    'prefer-template': 'error',
    radix: 'error',
    ...(react
      ? {
          'react/jsx-filename-extension': 'off', // Already covered by TypeScript
          'react/jsx-indent': 'off', // Already covered by Prettier
          'react/jsx-one-expression-per-line': 'off', // Already covered by Prettier
          'react/prop-types': 'off', // Already covered by TypeScript
          'react/react-in-jsx-scope': 'off', // no longer required after TS 4.1
        }
      : {}),
    ...(reactHooks
      ? { 'react-hooks/exhaustive-deps': 'error', 'react-hooks/rules-of-hooks': 'error' }
      : {}),
  },
  settings: {
    'import/resolver': {
      [resolvedESlintImportResolverNodeModulePath]: {
        extensions: ['.js', '.json', '.mjs', '.ts', '.tsx'],
      },
    },
    ...(react ? { react: { version: '16.13.0' } } : {}),
  },
  overrides: [
    {
      files: ['*.js'],
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    { files: ['*.ts', '*.tsx'] },
  ],
});
