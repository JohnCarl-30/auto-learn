// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Type-aware linting for the contract package.
 *
 * This is the code most worth checking — segment, apply and reuse all corrupt
 * output silently when wrong — and it was the one package with no lint config
 * at all.
 *
 * Prettier is deliberately not wired in here, unlike apps/api. Formatting
 * failures blocking a merge is friction; the rules below catch behaviour.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
