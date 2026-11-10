/**
 * Drives Word + EndNote through PowerShell so EndNote can turn temporary
 * citations into its own fields. The PowerShell script ships next to main.js
 * in `bridge/format-docx.ps1` (UTF-8 **with BOM** — Windows PowerShell 5.1
 * decodes BOM-less files with the ANSI code page and then fails to parse the
 * Chinese strings).
 */

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { t } from "./i18n";

export interface BridgeResult {
  ok: boolean;
  message: string;
  fields: number;
  started_endnote?: boolean;
}

export function bridgeScriptPath(pluginDir: string): string {
  return path.join(pluginDir, "bridge", "format-docx.ps1");
}

export function formatWithEndNote(opts: {
  scriptPath: string;
  input: string;
  output: string;
  libraryPath: string;
  endNoteExe?: string;
  timeoutSeconds?: number;
}): Promise<BridgeResult> {
  return new Promise((resolve) => {
    if (!fs.existsSync(opts.scriptPath)) {
      resolve({
        ok: false,
        message: t("bridge.missingScript", { dir: path.dirname(path.dirname(opts.scriptPath)) }),
        fields: 0,
      });
      return;
    }
    const args = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      opts.scriptPath,
      "-InputPath",
      opts.input,
      "-OutputPath",
      opts.output,
      "-LibraryPath",
      opts.libraryPath,
      "-WaitSeconds",
      String(opts.timeoutSeconds ?? 60),
    ];
    if (opts.endNoteExe) args.push("-EndNoteExe", opts.endNoteExe);

    execFile(
      "powershell.exe",
      args,
      { timeout: (opts.timeoutSeconds ?? 60) * 1000 + 90000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const line = String(stdout || "")
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
          .pop();
        if (line) {
          try {
            const parsed = JSON.parse(line);
            resolve({
              ok: !!parsed.ok,
              message: String(parsed.message ?? ""),
              fields: Number(parsed.fields ?? 0),
              started_endnote: !!parsed.started_endnote,
            });
            return;
          } catch {
            /* fall through */
          }
        }
        resolve({
          ok: false,
          message: err
            ? t("bridge.failed", { error: err.message })
            : String(stderr || t("bridge.noResult")).slice(0, 400),
          fields: 0,
        });
      }
    );
  });
}
