#!/usr/bin/env node
// Cross-platform Gradle-wrapper launcher.
//
// The pnpm scripts (build/dev/clean) shell out to the Gradle wrapper, but the
// wrapper's name differs per OS: `./gradlew` (a POSIX shell script) on
// Linux/macOS, `gradlew.bat` on Windows. A single bash-flavored npm script
// (`[ -x ./gradlew ] && ./gradlew …`) therefore can't run on Windows cmd. This
// launcher picks the right wrapper for the platform so a plain
// `pnpm --filter=mob-forge build` (and `dev`, `clean`) works identically on
// Linux, macOS, and Windows. Node is always present in this monorepo.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const wrapper = isWin ? "gradlew.bat" : "gradlew";

if (!existsSync(join(appDir, wrapper))) {
  console.log(
    "mob-forge is not bootstrapped yet - run: pnpm setup-minecraft",
  );
  process.exit(0);
}

// Node >= 20 refuses to spawn a .bat directly, so on Windows go through cmd.exe
// (which also resolves `gradlew.bat` from the working directory). On POSIX call
// the wrapper via its relative path since `.` is not on PATH.
const [cmd, args] = isWin
  ? ["cmd.exe", ["/c", "gradlew.bat", ...process.argv.slice(2)]]
  : ["./gradlew", process.argv.slice(2)];

const res = spawnSync(cmd, args, { cwd: appDir, stdio: "inherit" });
if (res.error) {
  console.error(res.error.message);
  process.exit(1);
}
process.exit(res.status ?? 0);
