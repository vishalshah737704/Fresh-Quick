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
    // Neither Node's spawn({detached:true, windowsHide:true}) nor
    // PowerShell's Start-Process -WindowStyle Hidden actually escape a
    // Windows Job Object -- and VS Code's integrated terminal (and many
    // other terminal apps) assigns EVERY child process it spawns to a
    // Job Object with kill-on-close semantics, which applies recursively
    // to the whole descendant tree regardless of console
    // detachment/hiding. Confirmed live: a Start-Process-launched service
    // still died when the launching terminal was closed.
    //
    // The fix is to not be a descendant of the calling shell at all.
    // Win32_Process::Create via WMI creates the process as a child of
    // WmiPrvSE.exe (the WMI provider host, a standing OS service), not
    // of whatever called it -- confirmed live via CIM (ParentProcessId
    // pointed at WmiPrvSE.exe, several process-tree hops away from this
    // script's own shell). That's a real, structural escape from any
    // job object the calling terminal belongs to, not just a console/
    // window-visibility trick.
    //
    // Parenthesize so `>` redirects the WHOLE command, not just its last
    // `&&`-chained segment -- cmd.exe's redirection binds to the final
    // segment otherwise, silently dropping earlier segments' output.
    // Win32_Process::Create escapes the job object, but unlike
    // Start-Process it has no built-in "hidden" switch -- without an
    // explicit Win32_ProcessStartup with ShowWindow=0 (SW_HIDE) passed as
    // ProcessStartupInformation, it allocates a normal VISIBLE console
    // for cmd.exe, defeating the point of the separate log-viewer window
    // (confirmed live: an extra "next-server"-titled window appeared
    // showing raw output alongside the intended viewer).
    const cmdLine = `cmd.exe /c "(${command}) > ${logPath} 2>&1"`;
    const psCreate =
      `$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0}; ` +
      `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{` +
      `CommandLine=${psQuote(cmdLine)}; CurrentDirectory=${psQuote(cwd)}; ProcessStartupInformation=$si }; ` +
      `if ($r.ReturnValue -ne 0) { Write-Host "Failed to start '${title}', Win32_Process.Create returned $($r.ReturnValue)" } ` +
      `else { Write-Host "Started '${title}' as PID $($r.ProcessId), independent of this shell" }`;
    spawnSync("powershell", ["-NoProfile", "-Command", psCreate], {
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
