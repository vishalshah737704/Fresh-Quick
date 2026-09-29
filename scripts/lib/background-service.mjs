// Starts a long-running dev command (Next.js dev server, Expo, etc.) as a
// TRUE background process, detached from any console window, with its
// output redirected to a log file. A separate window is then opened that
// only tails that log -- closing the window stops watching the log, it
// does NOT stop the underlying service, since the service was never a
// child of that window's process in the first place.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";

export function logsDir(root) {
  const dir = join(root, ".dev-logs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * @param {string} title Window title, and log file base name.
 * @param {string} command Shell command to run (e.g. "npm run dev -- -p 3000").
 * @param {string} logPath Full path to the log file to write to / tail.
 * @param {{ cwd?: string }} [opts]
 */
export function startBackgroundService(title, command, logPath, opts = {}) {
  mkdirSync(dirname(logPath), { recursive: true });
  const out = openSync(logPath, "w");

  // The service itself: detached + unref'd so it outlives this script and
  // is not a child of whatever window we open next to view its logs.
  // windowsHide is required on Windows -- without it, a detached child
  // gets its OWN visible console window from the OS regardless of the
  // stdio redirection below, so its real output goes there instead of
  // the log file, leaving the log-viewer window blank.
  const child = spawn(command, {
    shell: true,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", out, out],
    cwd: opts.cwd,
  });
  child.unref();

  // The viewer: just tails the log file. Its own lifecycle is completely
  // independent of the service process above -- closing this window has
  // no effect on `child`.
  if (process.platform === "win32") {
    // A plain `Get-Content -Wait` hard-errors and exits if the file is
    // deleted/rotated while being watched -- wrap it in a retry loop so
    // the viewer window survives that instead of dying with a red error.
    const psTail =
      `while ($true) { ` +
      `if (Test-Path '${logPath}') { Get-Content -Path '${logPath}' -Wait -Tail 100 } ` +
      `else { Write-Host 'Waiting for log file...'; Start-Sleep -Seconds 1 } }`;
    spawnSync(`start "${title}" powershell -NoExit -Command "${psTail}"`, {
      stdio: "inherit",
      shell: true,
    });
  } else {
    const tailCmd = `tail -n 100 -f '${logPath}'`;
    const viewer = spawn(
      "bash",
      ["-c", `gnome-terminal --title="${title}" -- bash -c "${tailCmd}" 2>/dev/null || xterm -T "${title}" -e bash -c "${tailCmd}"`],
      { detached: true, stdio: "ignore" }
    );
    viewer.unref();
  }

  console.log(`  ${title}: running in background, log at ${logPath}`);
  return child;
}
