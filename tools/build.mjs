// Сборка игры в один самодостаточный HTML-файл: dist/index.html
// 1) компилирует сценарий ink -> JSON
// 2) бандлит TypeScript + CSS (шрифты и изображения инлайнятся)
// 3) собирает HTML
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStory } from './ink.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

const storyPlugin = {
  name: 'story',
  setup(b) {
    b.onResolve({ filter: /^virtual:story$/ }, () => ({ path: 'story', namespace: 'story' }));
    b.onLoad({ filter: /.*/, namespace: 'story' }, () => {
      const { json, errors, warnings, files } = compileStory(root);
      if (errors.length) {
        return { errors: errors.map((e) => ({ text: e })) };
      }
      for (const w of warnings) console.warn('[ink warning]', w);
      return {
        contents: `export default ${JSON.stringify(json)};`,
        loader: 'js',
        watchFiles: files,
      };
    });
  },
};

const htmlPlugin = {
  name: 'html',
  setup(b) {
    b.onEnd((result) => {
      if (result.errors.length) return;
      const js = result.outputFiles.find((f) => f.path.endsWith('.js'));
      const css = result.outputFiles.find((f) => f.path.endsWith('.css'));
      const tpl = readFileSync(join(root, 'src/index.html'), 'utf8');
      const html = tpl
        .replace('/*__CSS__*/', () => (css ? css.text : ''))
        .replace('/*__JS__*/', () => js.text.replace(/<\/script/gi, '<\\/script'));
      writeFileSync(join(dist, 'index.html'), html);
      for (const sub of ['bg', 'portraits']) {
        const from = join(root, 'assets', sub), to = join(dist, 'assets', sub);
        mkdirSync(to, { recursive: true });
        for (const f of readdirSync(from)) if (f.endsWith('.webp')) copyFileSync(join(from, f), join(to, f));
      }
      const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
      console.log(`[build] dist/index.html — ${kb} KB`);
    });
  },
};

const options = {
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  minify: !watch,
  sourcemap: false,
  format: 'iife',
  target: ['es2020'],
  outdir: join(root, 'build-tmp'),
  write: false,
  loader: { '.woff2': 'dataurl', '.webp': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl' },
  plugins: [storyPlugin, htmlPlugin],
  logLevel: 'info',
  legalComments: 'none',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[build] watching…');
} else {
  await build(options);
}
if (!existsSync(join(dist, 'index.html'))) process.exit(1);
