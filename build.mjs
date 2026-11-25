// Builds Grip: TypeScript's checker over everything, then esbuild packs dist/grip.js, input.js and timeline.js, with types.
//
//   node build.mjs            check, then build dist/ (stops on any type error)
//   node build.mjs --check    check only
//   node build.mjs --test     check, then run the tests headless in Node
//   node build.mjs --size     what Grip weighs, minified and gzipped
import * as esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const args = process.argv.slice(2);
const run = (...a) => spawnSync(process.execPath, [tsc, ...a], { stdio: 'inherit', cwd: here }).status === 0;

if (!run('--noEmit', '-p', here)) { console.error('Type errors: not built.'); process.exit(1); }

if (args.includes('--size')) {
    for (const [name, contents] of [['Grip', `export * from './src/index';`], ['with input', `export * from './src/index'; export * from './src/input';`], ['the timeline', `export * from './src/timeline/timeline';`], ['and its inspector', `export * from './src/timeline/index';`]]) {
        const r = await esbuild.build({ stdin: { contents, resolveDir: here, loader: 'ts' }, bundle: true, minify: true, format: 'esm', write: false, logLevel: 'silent' });
        const code = r.outputFiles[0].contents;
        console.log(`${name}: ${(code.length / 1024).toFixed(1)} KB minified, ${(gzipSync(code, { level: 9 }).length / 1024).toFixed(1)} KB gzipped`);
    }
} else if (args.includes('--test')) {
    const out = join(here, 'test/.run.mjs');
    let failed = false;
    for (const name of ['grip', 'timeline']) {
        await esbuild.build({ entryPoints: [join(here, `test/${name}.ts`)], outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'warning' });
        if (spawnSync(process.execPath, [out], { stdio: 'inherit' }).status !== 0) failed = true;
    }
    process.exit(failed ? 1 : 0);
} else if (!args.includes('--check')) {
    const dist = join(here, 'dist');
    rmSync(dist, { recursive: true, force: true });
    await esbuild.build({
        entryPoints: { grip: join(here, 'src/index.ts'), input: join(here, 'src/input.ts'), timeline: join(here, 'src/timeline/index.ts') },
        outdir: dist, bundle: true, format: 'esm', target: 'es2022', minify: true, sourcemap: 'linked', logLevel: 'info'
    });
    if (!run('-p', join(here, 'tsconfig.build.json'))) process.exit(1);
}
