import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

if (!existsSync(".env.local")) {
  console.error(
    ".env.local not found. Run 'npx supabase start' then create .env.local from its output (see docs/DEPLOYMENT.md)."
  );
  process.exit(1);
}

const result = spawnSync("npm run build", { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
