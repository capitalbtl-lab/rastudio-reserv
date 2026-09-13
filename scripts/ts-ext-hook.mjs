import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function fileOf(abs) {
  for (const p of [abs, `${abs}.ts`, `${abs}.tsx`, `${abs}.js`, `${abs}.mjs`]) {
    if (existsSync(p)) return p;
  }
  return "";
}

/** Node --experimental-strip-types: .ts на относительных import и alias @/. */
export async function resolve(specifier, context, nextResolve) {
  if (typeof specifier === "string" && specifier.startsWith("@/")) {
    const hit = fileOf(join(process.cwd(), "src", specifier.slice(2)));
    if (hit) return nextResolve(pathToFileURL(hit).href, context);
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (typeof specifier !== "string" || !specifier.startsWith(".") || /\.(ts|js|mjs|cjs|json)$/i.test(specifier)) {
      throw err;
    }
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const hit = fileOf(join(dirname(parent), specifier));
    if (!hit) throw err;
    return nextResolve(pathToFileURL(hit).href, context);
  }
}
