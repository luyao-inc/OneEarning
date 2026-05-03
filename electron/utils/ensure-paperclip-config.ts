import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 在无交互环境下为 Paperclip 写入最小可用 config.json（等价于 quickstart 本地 loopback），
 * 以便 `paperclipai run` 在非 TTY 下可启动。路径均落在 --data-dir（PAPERCLIP_HOME）下。
 */
export function ensurePaperclipConfig(dataDir: string): void {
  const instanceRoot = join(dataDir, 'instances', 'default');
  const configPath = join(instanceRoot, 'config.json');
  if (existsSync(configPath)) return;

  mkdirSync(join(instanceRoot, 'db'), { recursive: true });
  mkdirSync(join(instanceRoot, 'logs'), { recursive: true });
  mkdirSync(join(instanceRoot, 'data', 'storage'), { recursive: true });
  mkdirSync(join(instanceRoot, 'data', 'backups'), { recursive: true });
  mkdirSync(join(instanceRoot, 'secrets'), { recursive: true });

  const now = new Date().toISOString();
  const config = {
    $meta: { version: 1 as const, updatedAt: now, source: 'onboard' as const },
    database: {
      mode: 'embedded-postgres' as const,
      embeddedPostgresDataDir: join(instanceRoot, 'db'),
      embeddedPostgresPort: 54329,
      backup: {
        enabled: true,
        intervalMinutes: 60,
        retentionDays: 7,
        dir: join(instanceRoot, 'data', 'backups'),
      },
    },
    logging: {
      mode: 'file' as const,
      logDir: join(instanceRoot, 'logs'),
    },
    server: {
      deploymentMode: 'local_trusted' as const,
      exposure: 'private' as const,
      bind: 'loopback' as const,
      host: '127.0.0.1',
      port: 3100,
      allowedHostnames: [] as string[],
      serveUi: true,
    },
    telemetry: { enabled: false },
    auth: {
      baseUrlMode: 'auto' as const,
      disableSignUp: false,
    },
    storage: {
      provider: 'local_disk' as const,
      localDisk: { baseDir: join(instanceRoot, 'data', 'storage') },
      s3: {
        bucket: 'paperclip',
        region: 'us-east-1',
        prefix: '',
        forcePathStyle: false,
      },
    },
    secrets: {
      provider: 'local_encrypted' as const,
      strictMode: false,
      localEncrypted: { keyFilePath: join(instanceRoot, 'secrets', 'master.key') },
    },
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}
