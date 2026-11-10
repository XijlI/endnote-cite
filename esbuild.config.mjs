import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import path from "path";

const prod = process.argv[2] === "production";

// sql.js ships the WASM next to its JS; copy it into assets/ so it can be
// imported with esbuild's binary loader and inlined into main.js.
const wasmSrc = path.join("node_modules", "sql.js", "dist", "sql-wasm.wasm");
const wasmDst = path.join("assets", "sql-wasm.wasm");
fs.mkdirSync("assets", { recursive: true });
if (fs.existsSync(wasmSrc)) fs.copyFileSync(wasmSrc, wasmDst);

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  platform: "node",
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  loader: { ".wasm": "binary", ".csl": "text", ".xml": "text" },
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
