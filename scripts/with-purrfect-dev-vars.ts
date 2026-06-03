import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const REQUIRED_KEYS = [
  "CONSULENZA360_SUPABASE_URL",
  "CONSULENZA360_SUPABASE_SERVICE_ROLE_KEY",
] as const;

function parseEnvValue(rawValue: string): string {
  let value = rawValue.trim();
  const quote = value[0];

  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
  }

  return value;
}

function readConsulenzaVars(filePath: string): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const match = withoutExport.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!key || !REQUIRED_KEYS.includes(key as (typeof REQUIRED_KEYS)[number])) continue;

    vars[key] = parseEnvValue(rawValue ?? "");
  }

  const missing = REQUIRED_KEYS.filter((key) => !vars[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required Consulenza360 vars in ${filePath}: ${missing.join(", ")}`);
  }

  return vars;
}

const command = process.argv.slice(2);
if (command.length === 0) {
  throw new Error("Usage: npm run with:purrfect-vars -- <command> [...args]");
}

const sharedVarsPath = path.resolve(
  process.env.CONSULENZA360_SHARED_DEV_VARS ?? "../purrfect-worker/.dev.vars",
);

if (!existsSync(sharedVarsPath)) {
  throw new Error(`Shared dev vars file not found: ${sharedVarsPath}`);
}

const child = spawn(command[0]!, command.slice(1), {
  env: {
    ...process.env,
    ...readConsulenzaVars(sharedVarsPath),
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
