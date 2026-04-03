import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const staticPath = 'dist/';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: `${staticPath}tilia-link.js`,
      format: 'umd',
      name: 'TiliaLink',
      sourcemap: true,
    },
    {
      file: `${staticPath}tilia-link.esm.js`,
      format: 'es',
      sourcemap: true,
    },
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
    }),
  ],
};
