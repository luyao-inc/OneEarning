import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { ensurePathInEnv } from "@paperclipai/adapter-utils/server-utils";
import { isDefaultCursorCommand } from "./remote-command.js";

function commandBasename(command: string): string {
  return command.trim().split(/[\\/]/).pop()?.toLowerCase() ?? "";
}

function hasPathSeparator(command: string): boolean {
  return command.includes("/") || command.includes("\\");
}

function prependPathEntry(pathValue: string, entry: string, delimiter: string): string {
  const parts = pathValue.split(delimiter).filter(Boolean);
  if (parts.includes(entry)) return pathValue;
  const cleaned = parts.join(delimiter);
  return cleaned.length > 0 ? `${entry}${delimiter}${cleaned}` : entry;
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export type PreparedCursorHostCommand = {
  command: string;
  env: Record<string, string>;
  addedPathEntries: string[];
  resolvedCommandPath: string | null;
};

function buildDarwinPathCandidates(homeDir: string): string[] {
  return [
    path.join(homeDir, ".local", "bin"),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    "/Applications/Cursor.app/Contents/Resources/app/bin",
    path.join(homeDir, "Applications", "Cursor.app", "Contents", "Resources", "app", "bin"),
  ];
}

function buildDarwinExecutableCandidates(command: string, homeDir: string): string[] {
  const base = commandBasename(command);
  const candidateDirs = [
    path.join(homeDir, ".local", "bin"),
    "/Applications/Cursor.app/Contents/Resources/app/bin",
    path.join(homeDir, "Applications", "Cursor.app", "Contents", "Resources", "app", "bin"),
  ];
  const basenames = base === "agent" ? ["agent", "cursor-agent"] : ["cursor-agent", "agent"];
  const candidates: string[] = [];
  for (const dir of candidateDirs) {
    for (const exe of basenames) {
      candidates.push(path.join(dir, exe));
    }
  }
  return candidates;
}

export async function prepareCursorHostCommand(input: {
  command: string;
  env: Record<string, string>;
  platform?: string;
  homeDir?: string;
}): Promise<PreparedCursorHostCommand> {
  const platform = input.platform ?? process.platform;
  const homeDir = input.homeDir ?? os.homedir();

  if (platform !== "darwin") {
    return {
      command: input.command,
      env: input.env,
      addedPathEntries: [],
      resolvedCommandPath: null,
    };
  }

  if (!isDefaultCursorCommand(input.command) || hasPathSeparator(input.command)) {
    return {
      command: input.command,
      env: input.env,
      addedPathEntries: [],
      resolvedCommandPath: null,
    };
  }

  const runtimeEnv = ensurePathInEnv(input.env);
  const existingPath = runtimeEnv.PATH ?? runtimeEnv.Path ?? "";
  let nextPath = existingPath;
  const addedPathEntries: string[] = [];
  for (const entry of buildDarwinPathCandidates(homeDir)) {
    const updated = prependPathEntry(nextPath, entry, ":");
    if (updated !== nextPath) {
      nextPath = updated;
      addedPathEntries.push(entry);
    }
  }
  const env = nextPath === existingPath ? input.env : { ...input.env, PATH: nextPath };

  for (const candidate of buildDarwinExecutableCandidates(input.command, homeDir)) {
    if (await isExecutable(candidate)) {
      return {
        command: candidate,
        env,
        addedPathEntries,
        resolvedCommandPath: candidate,
      };
    }
  }

  return {
    command: input.command,
    env,
    addedPathEntries,
    resolvedCommandPath: null,
  };
}

