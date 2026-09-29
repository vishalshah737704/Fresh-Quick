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

// Escapes a value for safe use inside a PowerShell single-quoted string
// (the only special case is doubling an embedded single quote).
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * @param {string} title Window title, and log file base name.
 * @param {string} command Shell command to run (e.g. "npm run dev -- -p 3000").
 * @param {string} logPath Full path to the log file to write to / tail.
 * @param {{ cwd?: string }} [opts]
 */
export function startBackgroundService(title, command, logPath, opts = {}) {
  mkdirSync(dirname(logPath), { recursive: true });
  const cwd = opts.cwd ?? process.cwd();

  if (process.platform === "win32") {
    // Node's own spawn({ detached: true, windowsHide: true }) isn't
    // reliable here: commands like "npm run dev" spawn several nested
    // layers (npm -> node -> next -> Turbopack workers) and one of those
    // inner layers can still allocate its own visible console regardless
    // of the top-level windowsHide flag. PowerShell's
    // Start-Process -WindowStyle Hidden reliably suppresses the console
    // for the whole process tree it launches, and genuinely detaches it
    // from the launching shell (closing that shell does not stop it).
    // cmd does its own `>` redirection to the log file rather than
    // relying on Node's stdio plumbing, since Start-Process's own
    // -RedirectStandardOutput/-RedirectStandardError can't both target
    // the same file.
    // Parenthesize so `>` redirects the WHOLE command, not just its last
    // `&&`-chained segment -- cmd.exe's redirection binds to the final
    // segment otherwise, silently dropping earlier segments' output.
    const cmdLine = `(${command}) > ${logPath} 2>&1`;
    const psStart =
      `Start-Process -FilePath cmd.exe -ArgumentList '/c', ${psQuote(cmdLine)} ` +
      `-WorkingDirectory ${psQuote(cwd)} -WindowStyle Hidden`;
    spawnSync("powershell", ["-NoProfile", "-Command", psStart], {
      stdio: "inherit",
      windowsHide: true,
    });

    const psTail =
      `while ($true) { ` +
      `if (Test-Path '${logPath}') { Get-Content -Path '${logPath}' -Wait -Tail 100 } ` +
      `else { Write-Host 'Waiting for log file...'; Start-Sleep -Seconds 1 } }`;
    spawnSync(`start "${title}" powershell -NoExit -Command "${psTail}"`, {
      stdio: "inherit",
      shell: true,
    });
  } else {
    const out = openSync(logPath, "w");
    const child = spawn(command, {
      shell: true,
      detached: true,
      stdio: ["ignore", out, out],
      cwd,
    });
    child.unref();

    const tailCmd = `tail -n 100 -f '${logPath}'`;
    const viewer = spawn(
      "bash",
      ["-c", `gnome-terminal --title="${title}" -- bash -c "${tailCmd}" 2>/dev/null || xterm -T "${title}" -e bash -c "${tailCmd}"`],
      { detached: true, stdio: "ignore" }
    );
    viewer.unref();
  }

  console.log(`  ${title}: running in background, log at ${logPath}`);
}
