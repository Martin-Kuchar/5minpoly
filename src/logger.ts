import * as fs from "fs";

let historyStream: fs.WriteStream | null = null;
let csvStream: fs.WriteStream | null = null;

export function initHistoryLog(path: string = "history.toml"): void {
  if (historyStream) return;
  historyStream = fs.createWriteStream(path, { flags: "a" });
}

export function logToHistory(message: string): void {
  process.stderr.write(message);
  if (historyStream) {
    historyStream.write(message);
    historyStream.emit("drain");
  }
}

function csvEscape(value: string | number | boolean | null): string {
  const raw = String(value ?? "");
  return `"${raw.replace(/"/g, '""')}"`;
}

export function initCsvLog(path: string = "trades.csv"): void {
  if (csvStream) return;
  const needsHeader = !fs.existsSync(path);
  csvStream = fs.createWriteStream(path, { flags: "a" });
  if (needsHeader) {
    csvStream.write(
      "timestamp,marketName,conditionId,periodTimestamp,remainingSeconds,side,tokenId,shares,price,event,resolution\n"
    );
  }
}

export function logCsvRow(columns: Array<string | number | boolean | null>): void {
  if (!csvStream) return;
  csvStream.write(columns.map(csvEscape).join(",") + "\n");
}

export function logPrintln(...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.map(String).join(" ")}\n`;
  logToHistory(message);
}
