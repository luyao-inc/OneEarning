#!/usr/bin/env zx
/**
 * 下载官方 Node 二进制到 resources/bin/<platform-arch>/，供打包后的 Electron 调用。
 * （不要用 Electron 自带的 Node 跑带原生模块的 paperclipai；且 macOS 从 Finder 启动时 PATH 往往不含 Homebrew 的 node。）
 */
import 'zx/globals';
import { chmodSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT_DIR = path.resolve(__dirname, '..');
const NODE_VERSION = '22.16.0';
const BASE_URL = `https://nodejs.org/dist/v${NODE_VERSION}`;

/** @type {Record<string, { archive: string; innerDir: string; binary: string; kind: 'zip' | 'tgz' }>} */
const TARGETS = {
  'win32-x64': {
    archive: `node-v${NODE_VERSION}-win-x64.zip`,
    innerDir: `node-v${NODE_VERSION}-win-x64`,
    binary: 'node.exe',
    kind: 'zip',
  },
  'darwin-arm64': {
    archive: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    innerDir: `node-v${NODE_VERSION}-darwin-arm64`,
    binary: path.join('bin', 'node'),
    kind: 'tgz',
  },
  'darwin-x64': {
    archive: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    innerDir: `node-v${NODE_VERSION}-darwin-x64`,
    binary: path.join('bin', 'node'),
    kind: 'tgz',
  },
};

const DOWNLOAD_ATTEMPTS = 5;
const RETRY_DELAY_MS = 4000;

/** 官方 darwin .tar.gz 约 40MB+，过小视为截断 */
const MIN_TGZ_BYTES = 25 * 1024 * 1024;
const MIN_ZIP_BYTES = 20 * 1024 * 1024;

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function downloadWithFetchStream(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const body = res.body;
  if (!body) throw new Error('响应无 body');
  await pipeline(Readable.fromWeb(body), createWriteStream(dest));
}

/**
 * macOS/Linux：优先 curl（对代理/弱网更友好，且自带 --retry）
 */
async function downloadWithCurl(url, dest) {
  /** -sS：不刷进度到 stderr，避免 execFile 默认 buffer 被撑爆；失败时仍输出错误 */
  await execFileAsync(
    'curl',
    [
      '-fsSL',
      '--retry',
      '8',
      '--retry-delay',
      '3',
      '--retry-all-errors',
      '--connect-timeout',
      '30',
      '-o',
      dest,
      url,
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
}

async function downloadArchive(url, dest, kind) {
  const minSize = kind === 'zip' ? MIN_ZIP_BYTES : MIN_TGZ_BYTES;
  let lastErr;

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    await fs.remove(dest).catch(() => {});
    try {
      if (process.platform !== 'win32') {
        await downloadWithCurl(url, dest);
      } else {
        await downloadWithFetchStream(url, dest);
      }
      const st = await fs.stat(dest);
      if (st.size < minSize) {
        throw new Error(`文件不完整（${st.size} bytes，预期 ≥ ${minSize}）`);
      }
      return;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      echo(chalk.yellow(`下载失败 (${attempt}/${DOWNLOAD_ATTEMPTS})：${msg}`));
      if (attempt < DOWNLOAD_ATTEMPTS) {
        echo(
          chalk.gray(
            `等待 ${RETRY_DELAY_MS / 1000}s 后重试…（若使用 VPN/代理仍失败，可暂时关闭全局代理或换网络后再执行）`,
          ),
        );
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  /**
   * curl 失败时再试 fetch 流式（某些环境只有其一可用）
   */
  if (process.platform !== 'win32') {
    echo(chalk.blue`curl 多次失败，改用 fetch 流式下载重试…`);
    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
      await fs.remove(dest).catch(() => {});
      try {
        await downloadWithFetchStream(url, dest);
        const st = await fs.stat(dest);
        if (st.size < minSize) {
          throw new Error(`文件不完整（${st.size} bytes）`);
        }
        return;
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        echo(chalk.yellow(`fetch 下载失败 (${attempt}/${DOWNLOAD_ATTEMPTS})：${msg}`));
        if (attempt < DOWNLOAD_ATTEMPTS) await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastErr ?? new Error('下载失败');
}

async function setupTarget(id) {
  const target = TARGETS[id];
  if (!target) {
    echo(chalk.yellow(`Unknown target ${id}`));
    return;
  }
  const targetDir = path.join(ROOT_DIR, 'resources', 'bin', id);
  const tempDir = path.join(ROOT_DIR, 'temp_node_extract');
  const archivePath = path.join(ROOT_DIR, target.archive);
  const downloadUrl = `${BASE_URL}/${target.archive}`;

  echo(chalk.blue(`\n📦 Node.js ${id}...`));
  await fs.remove(tempDir);
  await fs.ensureDir(targetDir);
  await fs.ensureDir(tempDir);

  echo`⬇️ ${downloadUrl}`;
  await downloadArchive(downloadUrl, archivePath, target.kind);

  if (target.kind === 'zip') {
    if (os.platform() === 'win32') {
      const { execFileSync } = await import('node:child_process');
      const psCommand = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${archivePath.replace(/'/g, "''")}', '${tempDir.replace(/'/g, "''")}')`;
      execFileSync('powershell.exe', ['-NoProfile', '-Command', psCommand], { stdio: 'inherit' });
    } else {
      await $`unzip -q -o ${archivePath} -d ${tempDir}`;
    }
  } else {
    await $`tar -xzf ${archivePath} -C ${tempDir}`;
  }

  const expectedNode = path.join(tempDir, target.innerDir, target.binary);
  const outputName = path.basename(target.binary);
  const outputNode = path.join(targetDir, outputName);
  if (!(await fs.pathExists(expectedNode))) {
    throw new Error(`解压后未找到 Node：${expectedNode}`);
  }
  await fs.move(expectedNode, outputNode, { overwrite: true });
  if (!outputNode.endsWith('.exe')) {
    chmodSync(outputNode, 0o755);
  }

  await fs.remove(archivePath);
  await fs.remove(tempDir);
  echo(chalk.green(`✅ ${outputNode}`));
}

const platform = argv.platform;
if (platform === 'win') {
  await setupTarget('win32-x64');
} else if (platform === 'mac') {
  await setupTarget('darwin-arm64');
  await setupTarget('darwin-x64');
} else {
  echo`Usage: zx scripts/download-bundled-node.mjs --platform=win | --platform=mac`;
  process.exitCode = 1;
}
