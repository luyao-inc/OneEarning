import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    access: vi.fn(async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }),
  };
});

import fs from "node:fs/promises";
import { prepareCursorHostCommand } from "./local-command.js";

describe("prepareCursorHostCommand", () => {
  it("does nothing on non-darwin", async () => {
    const result = await prepareCursorHostCommand({
      command: "agent",
      env: {},
      platform: "linux",
      homeDir: "/home/x",
    });
    expect(result.command).toBe("agent");
    expect(result.addedPathEntries).toEqual([]);
    expect(result.resolvedCommandPath).toBeNull();
  });

  it("prepends macOS PATH candidates for default commands", async () => {
    const result = await prepareCursorHostCommand({
      command: "agent",
      env: { PATH: "/usr/bin:/bin" },
      platform: "darwin",
      homeDir: "/Users/test",
    });
    expect(result.env.PATH).toContain("/Users/test/.local/bin");
    expect(result.env.PATH).toContain("/opt/homebrew/bin");
    expect(result.env.PATH).toContain("/Applications/Cursor.app/Contents/Resources/app/bin");
    expect(result.command).toBe("agent");
    expect(result.resolvedCommandPath).toBeNull();
  });

  it("resolves Cursor.app bin executable when present", async () => {
    const access = fs.access as unknown as ReturnType<typeof vi.fn>;
    access.mockImplementationOnce(async (p: string) => {
      // First candidate is /Applications/.../agent
      if (String(p).endsWith("/Cursor.app/Contents/Resources/app/bin/agent")) return;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    const result = await prepareCursorHostCommand({
      command: "agent",
      env: { PATH: "" },
      platform: "darwin",
      homeDir: "/Users/test",
    });
    expect(result.command).toBe("/Applications/Cursor.app/Contents/Resources/app/bin/agent");
    expect(result.resolvedCommandPath).toBe("/Applications/Cursor.app/Contents/Resources/app/bin/agent");
  });

  it("does not touch custom absolute commands", async () => {
    const result = await prepareCursorHostCommand({
      command: "/custom/agent",
      env: { PATH: "" },
      platform: "darwin",
      homeDir: "/Users/test",
    });
    expect(result.command).toBe("/custom/agent");
    expect(result.addedPathEntries).toEqual([]);
  });
});

