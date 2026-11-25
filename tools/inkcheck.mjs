import { loadSources } from './ink.mjs';
import { Compiler, CompilerOptions } from 'inkjs/full';
const { source, map } = loadSources(process.cwd());
const locate = (n) => { let c = map[0]; for (const m of map) if (m[0] <= n) c = m; return `${c[1]}:${n - c[0] + 1}`; };
const errs = [];
const opts = new CompilerOptions(null, [], false, (msg, type) => errs.push([type, msg]), null);
try { new Compiler(source, opts).Compile(); } catch (e) { errs.push(['EXC', String(e)]); }
for (const [t, m] of errs) console.log(t, m.replace(/line (\d+)/g, (_, n) => `line ${n} [${locate(+n)}]`));
