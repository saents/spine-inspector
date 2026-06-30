import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const watch = process.argv.includes('--watch');
const root = path.dirname(fileURLToPath(import.meta.url));

function copyAssets() {
  mkdirSync('dist', { recursive: true });
  mkdirSync('media', { recursive: true });
  copyFileSync('src/webview/main.css', 'dist/webview.css');
  copyFileSync(
    path.join(root, 'node_modules/@pixi/unsafe-eval/dist/browser/unsafe-eval.js'),
    path.join(root, 'media/unsafe-eval.js')
  );
}

const extensionCtx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
  target: 'es2020',
});

const webviewCtx = await esbuild.context({
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  sourcemap: true,
  target: 'es2020',
});

copyAssets();

if (watch) {
  await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
  console.log('watching...');
} else {
  await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
  await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
}
