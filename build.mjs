import * as esbuild from 'esbuild';
import { glob } from 'glob';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build all packages
const packages = ['db', 'embeddings', 'evolution', 'llm', 'rag', 'stt'];
const apps = ['api', 'worker'];

async function buildPackage(name, type = 'packages') {
  const base = join(__dirname, type, name);
  const src = join(base, 'src');
  const dist = join(base, 'dist');

  // Create dist dir
  if (!fs.existsSync(dist)) {
    fs.mkdirSync(dist, { recursive: true });
  }

  // Find all .ts files
  const files = await glob('**/*.ts', { cwd: src });

  console.log(`Building ${name}: ${files.length} files`);

  for (const file of files) {
    const input = join(src, file);
    const output = join(dist, file.replace('.ts', '.js'));

    // Ensure output directory exists
    const outDir = dirname(output);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    await esbuild.build({
      entryPoints: [input],
      outfile: output,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      bundle: false,
      minify: false,
      sourcemap: false,
    });
  }

  console.log(`✓ ${name} built`);
}

async function main() {
  console.log('Building packages...');
  for (const pkg of packages) {
    await buildPackage(pkg, 'packages');
  }

  console.log('\nBuilding apps...');
  for (const app of apps) {
    await buildPackage(app, 'apps');
  }

  console.log('\n✓ Build complete!');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
