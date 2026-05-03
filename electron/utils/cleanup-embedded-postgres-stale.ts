import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Windows 上常见：上次 embedded Postgres 未干净退出，留下 postmaster.pid / 共享内存，
 * 再次 `paperclipai run` 会 FATAL: pre-existing shared memory block is still in use。
 * 优先用嵌入式包自带的 pg_ctl stop（比单纯 taskkill 更易释放共享内存），再删陈旧 pid。
 */

function readEmbeddedPostgresPortsToSweep(dataDir: string): number[] {
  let configured = 54329;
  try {
    const p = join(dataDir, 'instances', 'default', 'config.json');
    if (existsSync(p)) {
      const j = JSON.parse(readFileSync(p, 'utf8')) as { database?: { embeddedPostgresPort?: number } };
      const n = j?.database?.embeddedPostgresPort;
      if (typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 65536) configured = Math.floor(n);
    }
  } catch {
    /* ignore */
  }
  const set = new Set<number>();
  for (let p = 54325; p <= 54345; p++) set.add(p);
  set.add(configured);
  if (configured > 1024) set.add(configured - 1);
  if (configured < 65534) set.add(configured + 1);
  return [...set].filter((p) => p >= 1024 && p < 65536);
}

/** 结束仍占用 embedded 常用端口的 LISTEN 进程（截图中 54329 占用会触发换端口 + 共享内存冲突） */
function killWindowsListenPidsOnPorts(ports: number[]): {
  pids: number[];
  stderr: string;
  stdout: string;
  spawnError?: string;
} {
  const uniq = [...new Set(ports)].filter((p) => p >= 1024 && p < 65536);
  if (uniq.length === 0) return { pids: [], stderr: '', stdout: '' };
  const list = uniq.join(',');
  /**
   * 日志曾出现仅 Stop-Process 仍共享内存失败：OwningProcess 可能是父进程，子 postgres 仍存活。
   * 仅当 ProcessName 为 postgres 时用 taskkill /T 结束整棵树；避免误杀占用同端口的非 PG 进程。
   */
  const ps = [
    `$ports=@(${list})`,
    `$out=@()`,
    `foreach($port in $ports){Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue|ForEach-Object{$pid=$_.OwningProcess;if(-not $pid -or $pid -eq 0){return};$proc=Get-Process -Id $pid -ErrorAction SilentlyContinue;if(-not $proc){return};if($proc.ProcessName -ne 'postgres'){return};Start-Process -FilePath taskkill.exe -ArgumentList @('/PID',[string]$pid,'/F','/T') -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue;$out+=$pid}}`,
    `$u=@($out|Sort-Object -Unique)`,
    `Write-Output ('PORTKILLCOUNT='+$u.Count)`,
    `Write-Output ('PORTS='+'${list}')`,
    `$u`,
  ].join(';');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 30_000,
  });
  const pids: number[] = [];
  for (const line of (r.stdout ?? '').trim().split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('PORTKILLCOUNT=') || t.startsWith('PORTS=')) continue;
    const pid = Number(t);
    if (Number.isInteger(pid) && pid > 0) pids.push(pid);
  }
  return {
    pids,
    stderr: (r.stderr ?? '').slice(0, 600),
    stdout: (r.stdout ?? '').slice(0, 400),
    spawnError: r.error?.message,
  };
}

function resolvePgCtlExe(paperclipRoot: string): string | null {
  if (process.platform !== 'win32') return null;
  const rel = join('node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin', 'pg_ctl.exe');
  for (const base of [process.cwd(), paperclipRoot]) {
    const direct = join(base, rel);
    if (existsSync(direct)) return direct;
  }
  for (const base of [process.cwd(), paperclipRoot]) {
    try {
      const r = createRequire(join(base, 'package.json'));
      const pkgDir = dirname(r.resolve('@embedded-postgres/windows-x64/package.json'));
      const p = join(pkgDir, 'native', 'bin', 'pg_ctl.exe');
      if (existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** 无 postmaster.pid 时 pg_ctl 无法停库；仍可能有 postgres.exe 占用该 -D 目录（命令行含数据路径） */
function killWindowsPostgresForClusterDir(clusterDir: string): {
  pids: number[];
  postgresExeCount: number;
  cmdHitCount: number;
  embHitCount: number;
  stderr: string;
  error?: string;
} {
  const norm = clusterDir.replace(/\//g, '\\');
  const b64 = Buffer.from(norm, 'utf8').toString('base64');
  /**
   * 1) CommandLine 含数据目录（常见）。
   * 2) 不少环境下 Win32_Process.CommandLine 为空，但 ExecutablePath 仍指向 node_modules 里的 embedded-postgres（日志曾：COUNT=11、CMD 匹配 0）。
   */
  const ps = [
    `$n=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')).ToLowerInvariant().Replace('/','\\')`,
    `$t='oneearning\\paperclip\\instances\\default\\db'`,
    `$c=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue|Where-Object{$_.Name -eq 'postgres.exe'})`,
    `$h=@($c|Where-Object{$_.CommandLine -and (($_.CommandLine.ToLowerInvariant().Replace('/','\\').Contains($n)) -or ($_.CommandLine.ToLowerInvariant().Replace('/','\\').Contains($t)))})`,
    `$emb=@($c|Where-Object{$_.ExecutablePath -and ($_.ExecutablePath.ToLowerInvariant().Contains('embedded-postgres'))})`,
    `$kill=@($h+$emb|Sort-Object ProcessId -Unique)`,
    `Write-Output ('COUNT='+$c.Count)`,
    `Write-Output ('CMDHIT='+$h.Count)`,
    `Write-Output ('EMB='+$emb.Count)`,
    `$kill|ForEach-Object{Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue;$_.ProcessId}`,
  ].join(';');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 45_000,
  });
  let postgresExeCount = -1;
  let cmdHitCount = -1;
  let embHitCount = -1;
  const pids: number[] = [];
  for (const line of (r.stdout ?? '').trim().split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('COUNT=')) {
      const n = Number(t.slice(6));
      if (Number.isFinite(n) && n >= 0) postgresExeCount = n;
    } else if (t.startsWith('CMDHIT=')) {
      const n = Number(t.slice(7));
      if (Number.isFinite(n) && n >= 0) cmdHitCount = n;
    } else if (t.startsWith('EMB=')) {
      const n = Number(t.slice(4));
      if (Number.isFinite(n) && n >= 0) embHitCount = n;
    } else {
      const pid = Number(t);
      if (Number.isInteger(pid) && pid > 0) pids.push(pid);
    }
  }
  return {
    pids,
    postgresExeCount,
    cmdHitCount,
    embHitCount,
    stderr: (r.stderr ?? '').slice(0, 600),
    error: r.error?.message,
  };
}

export function cleanupStaleEmbeddedPostgres(dataDir: string, paperclipRoot: string): void {
  const clusterDir = join(dataDir, 'instances', 'default', 'db');
  const pidFile = join(clusterDir, 'postmaster.pid');
  const pgVersion = join(clusterDir, 'PG_VERSION');

  if (!existsSync(pgVersion)) return;

  const pgCtl = resolvePgCtlExe(paperclipRoot);

  if (pgCtl) {
    const r = spawnSync(pgCtl, ['stop', '-D', clusterDir, '-m', 'fast', '-w'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 30_000,
    });
  }

  if (process.platform === 'win32') {
    killWindowsPostgresForClusterDir(clusterDir);

    const sweepPorts = readEmbeddedPostgresPortsToSweep(dataDir);
    killWindowsListenPidsOnPorts(sweepPorts);
  }

  if (!existsSync(pidFile)) {
    return;
  }

  let pid: number | null = null;
  try {
    const first = readFileSync(pidFile, 'utf8').split(/\r?\n/)[0]?.trim();
    const n = first ? Number(first) : NaN;
    pid = Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return;
  }

  if (pid === null) {
    try {
      unlinkSync(pidFile);
    } catch {
      /* ignore */
    }
    return;
  }

  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {
    alive = false;
  }

  if (alive) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/F', '/T'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* ignore */
      }
    }
  }

  try {
    if (existsSync(pidFile)) {
      unlinkSync(pidFile);
    }
  } catch {
    /* ignore */
  }
}
