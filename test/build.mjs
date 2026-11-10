import { build } from "esbuild";
import path from "path";

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  logLevel: "error",
  loader: { ".wasm": "binary", ".csl": "text", ".xml": "text" },
  alias: { obsidian: path.resolve("test/obsidian-stub.ts") },
};

await build({ ...common, entryPoints: ["test/core-test.ts"], outfile: "test/.build/core-test.cjs" });
await build({ ...common, entryPoints: ["test/plugin-test.ts"], outfile: "test/.build/plugin-test.cjs" });
