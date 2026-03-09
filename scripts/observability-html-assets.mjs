import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function publishHtmlAssets({ htmlFile, assets }) {
  const assetsDir = path.resolve(path.dirname(htmlFile), 'assets');
  await ensureDir(assetsDir);

  const manifest = {};
  for (const asset of assets) {
    const sourceFile = path.resolve(process.cwd(), asset.sourceFile);
    const fileName = asset.fileName;
    const targetFile = path.resolve(assetsDir, fileName);
    await fs.copyFile(sourceFile, targetFile);
    manifest[asset.key || fileName] = {
      fileName,
      relativePath: `./assets/${fileName}`,
      absolutePath: targetFile,
    };
  }

  return {
    assetsDir,
    manifest,
  };
}

export function escapeHtmlJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
