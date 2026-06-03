import { createClient } from "@supabase/supabase-js";
import readXlsxFile from "read-excel-file/node";
import path from "node:path";
import process from "node:process";

type ImportRow = {
  isin: string;
  bond_name: string;
  source_row: number;
};

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function readRows(filePath: string): Promise<ImportRow[]> {
  const rawWorkbook = (await readXlsxFile(filePath)) as unknown;
  const rows = Array.isArray(rawWorkbook)
    && rawWorkbook.length === 1
    && typeof rawWorkbook[0] === "object"
    && rawWorkbook[0] !== null
    && "data" in rawWorkbook[0]
    ? ((rawWorkbook[0] as { data: unknown[][] }).data)
    : (rawWorkbook as unknown[][]);
  const parsed: ImportRow[] = [];
  const invalid: Array<{ row: number; isin: unknown }> = [];

  rows.slice(1).forEach((row, index) => {
    const sourceRow = index + 2;
    const bondName = String(row[1] ?? "").trim();
    const isin = String(row[2] ?? "").trim().toUpperCase();

    if (!bondName && !isin) return;
    if (!ISIN_PATTERN.test(isin)) {
      invalid.push({ row: sourceRow, isin });
      return;
    }

    parsed.push({
      isin,
      bond_name: bondName || isin,
      source_row: sourceRow,
    });
  });

  if (invalid.length > 0) {
    throw new Error(
      `Found ${invalid.length} invalid ISIN rows. First invalid row: ${invalid[0]?.row} (${String(
        invalid[0]?.isin,
      )})`,
    );
  }

  return parsed;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const filePath = path.resolve(fileArg ?? "500 ISINs obbligazionari.xlsx");
  const rows = await readRows(filePath);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          file: filePath,
          parsedRows: rows.length,
          firstRow: rows[0] ?? null,
        },
        null,
        2,
      ),
    );
    return;
  }

  const supabase = createClient(
    requireEnv("CONSULENZA360_SUPABASE_URL"),
    requireEnv("CONSULENZA360_SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { data, error } = await supabase.rpc("import_isins", { rows });
  if (error) {
    throw error;
  }

  console.log(
    JSON.stringify(
      {
        file: filePath,
        parsedRows: rows.length,
        result: data,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
