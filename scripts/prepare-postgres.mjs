#!/usr/bin/env zx
/**
 * 将 embedded-postgres 包复制到 resources/postgres/embedded-postgres，
 * 便于离线分发（运行时仍由 paperclip 依赖树加载；此副本可用于后续优化或校验）。
 */
import 'zx/globals';

const ROOT = path.resolve(__dirname, '..');
const src = path.join(ROOT, 'node_modules', 'embedded-postgres');
const dst = path.join(ROOT, 'resources', 'postgres', 'embedded-postgres');

fs.mkdirSync(path.dirname(dst), { recursive: true });

if (!fs.existsSync(src)) {
  echo`⚠️  node_modules/embedded-postgres not found — created placeholder ${dst}`;
  fs.mkdirSync(dst, { recursive: true });
  fs.writeFileSync(
    path.join(dst, 'README.txt'),
    'embedded-postgres 未从 node_modules 复制。请确保已 pnpm install。\n',
    'utf8',
  );
  process.exit(0);
}

if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, dereference: true });
echo`✅ Copied embedded-postgres → ${dst}`;
