// Сборка игры.
//  dist/index.html            — автономный файл: движок, сценарий, шрифты и все иллюстрации внутри.
//                               Открывается двойным кликом, работает без интернета и без папок рядом.
//  build-artifact/index.html  — веб-версия: иллюстрации грузятся отдельными файлами из assets/.
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStory } from './ink.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

function assetMap(inline) {
  const map = {};
  if (!inline) return map;
  for (const sub of ['bg', 'portraits']) {
    for (const f of readdirSync(join(root, 'assets', sub))) {
      if (!f.endsWith('.webp')) continue;
      map[`assets/${sub}/${f}`] = 'data:image/webp;base64,' + readFileSync(join(root, 'assets', sub, f)).toString('base64');
    }
  }
  return map;
}

const storyPlugin = {
  name: 'story',
  setup(b) {
    b.onResolve({ filter: /^virtual:story$/ }, () => ({ path: 'story', namespace: 'story' }));
    b.onLoad({ filter: /.*/, namespace: 'story' }, () => {
      const { json, errors, warnings, files } = compileStory(root);
      if (errors.length) return { errors: errors.map((e) => ({ text: e })) };
      for (const w of warnings) console.warn('[ink warning]', w);
      return { contents: `export default ${JSON.stringify(json)};`, loader: 'js', watchFiles: files };
    });
  },
};
const assetsPlugin = (inline) => ({
  name: 'assets',
  setup(b) {
    b.onResolve({ filter: /^virtual:assets$/ }, () => ({ path: 'assets', namespace: 'assets' }));
    b.onLoad({ filter: /.*/, namespace: 'assets' }, () => ({ contents: `export default ${JSON.stringify(assetMap(inline))};`, loader: 'js' }));
  },
});

function page(result, mode) {
  const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
  const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
  const tpl = readFileSync(join(root, 'src/index.html'), 'utf8');
  if (mode === 'dist') return tpl.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
  // веб-версия публикуется внутри готовой обёртки документа — без <html>/<head>/<body>
  const body = tpl.slice(tpl.indexOf('<body>') + 6, tpl.indexOf('</body>'));
  return `<title>Afterimage</title>\n<style>${css}</style>\n${body.replace('/*__JS__*/', () => js)}`;
}

const base = (inline) => ({
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  minify: !watch,
  format: 'iife',
  target: ['es2020'],
  outdir: join(root, 'build-tmp'),
  write: false,
  loader: { '.woff2': 'dataurl' },
  plugins: [storyPlugin, assetsPlugin(inline)],
  logLevel: 'warning',
  legalComments: 'none',
});

async function buildAll() {
  const [a, b] = await Promise.all([build(base(true)), build(base(false))]);
  const html = page(a, 'dist');
  writeFileSync(join(dist, 'index.html'), html);
  if (existsSync(join(dist, 'assets'))) rmSync(join(dist, 'assets'), { recursive: true });
  mkdirSync(join(root, 'build-artifact'), { recursive: true });
  writeFileSync(join(root, 'build-artifact', 'index.html'), page(b, 'web'));
  // Android: полный документ, иллюстрации лежат рядом в assets/ (внутри APK)
  mkdirSync(join(root, 'build-android'), { recursive: true });
  writeFileSync(join(root, 'build-android', 'index.html'), page(b, 'dist'));
  console.log(`[build] dist/index.html — ${(Buffer.byteLength(html) / 1048576).toFixed(1)} MB (автономный)`);
}

if (watch) {
  const ctx = await context({ ...base(false), plugins: [...base(false).plugins, { name: 'w', setup(b) { b.onEnd((r) => { if (!r.errors.length) { writeFileSync(join(root, 'dev.html'), page(r, 'dist')); console.log('[watch] dev.html'); } }); } }] });
  await ctx.watch();
} else {
  await buildAll();
}
