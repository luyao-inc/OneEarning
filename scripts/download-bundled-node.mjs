#!/usr/bin/env zx
/**
 * Windows：下载官方 Node 便携 zip，解压 node.exe 到 resources/bin/win32-x64/（与 EarningClaw 思路一致）。
 */
import 'zx/globals';

const ROOT_DIR = path.resolve(__dirname, '..');
const NODE_VERSION = '22.16.0';
const BASE_URL = `https://nodejs.org/dist/v${NODE_VERSION}`;

const TARGETS = {
  'win32-x64': {
    filename: `node-v${NODE_VERSION}-win-x64.zip`,
    sourceDir: `node-v${NODE_VERSION}-win-x64`,
  },
};

async function setupTarget(id) {
  const target = TARGETS[id];
  if (!target) {
    echo(chalk.yellow`Unknown target ${id}`);
    return;
  }
  const targetDir = path.join(ROOT_DIR, 'resources', 'bin', id);
  const tempDir = path.join(ROOT_DIR, 'temp_node_extract');
  const archivePath = path.join(ROOT_DIR, target.filename);
  const downloadUrl = `${BASE_URL}/${target.filename}`;

  echo(chalk.blue`\n📦 Node.js ${id}...`);
  await fs.remove(tempDir);
  await fs.ensureDir(targetDir);
  await fs.ensureDir(tempDir);

  echo`⬇️ ${downloadUrl}`;
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error(response.statusText);
  await fs.writeFile(archivePath, Buffer.from(await response.arrayBuffer()));

  if (os.platform() === 'win32') {
    const { execFileSync } = await import('node:child_process');
    const psCommand = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${archivePath.replace(/'/g, "''")}', '${tempDir.replace(/'/g, "''")}')`;
    execFileSync('powershell.exe', ['-NoProfile', '-Command', psCommand], { stdio: 'inherit' });
  } else {
    await $`unzip -q -o ${archivePath} -d ${tempDir}`;
  }

  const expectedNode = path.join(tempDir, target.sourceDir, 'node.exe');
  const outputNode = path.join(targetDir, 'node.exe');
  if (await fs.pathExists(expectedNode)) {
    await fs.move(expectedNode, outputNode, { overwrite: true });
  }
  await fs.remove(archivePath);
  await fs.remove(tempDir);
  echo(chalk.green`✅ ${outputNode}`);
}

const platform = argv.platform;
if (platform === 'win') {
  await setupTarget('win32-x64');
} else {
  echo`Usage: zx scripts/download-bundled-node.mjs --platform=win`;
}
