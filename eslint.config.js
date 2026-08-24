import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const transcendentals = ['sin','cos','tan','asin','acos','atan','atan2','exp','log','log2','log10','pow','sqrt','cbrt','sinh','cosh','tanh','random'];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['three', 'three/**', '**/render/**', '**/ui/**', '**/game/**', '**/audio/**'], message: 'src/sim must stay pure.' }],
      }],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'performance', 'requestAnimationFrame', 'localStorage'],
      'no-restricted-properties': ['error',
        ...transcendentals.map((p) => ({ object: 'Math', property: p, message: `Math.${p} is not cross-engine deterministic; forbidden in src/sim.` })),
      ],
    },
  },
);
