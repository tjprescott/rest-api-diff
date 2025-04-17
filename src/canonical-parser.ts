#!/usr/bin/env ts-node

import fs from "fs";
import path from "path";
import * as yaml from "js-yaml";

/**
 * CLI usage:
 *   ts-node src/canonical-parser.ts <input.yaml> <output.json> <mapping.json?> [--preserve-defs]
 *
 * Generates a canonical JSON of the full Swagger v2 doc (OpenAPI 2) and a JSON pointer mapping
 * from each expanded node back to its original source location, without external bundler libs.
 */

interface Options {
  preserveDefinitions: boolean;
}

interface ParameterizedHost {
  hostTemplate: string;
  useSchemePrefix: boolean;
  positionInOperation: "first" | "last";
  parameters: any[];
}

// ── Utils ───────────────────────────────────────────────────────────────────
function isObject(x: any): x is Record<string, any> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function normalizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function escapeJsonPointer(str: string): string {
  return str.replace(/~/g, "~0").replace(/\//g, "~1");
}

// Load JSON or YAML
function loadFileSync(fileRef: string, baseDir: string): any {
  const fullPath = path.isAbsolute(fileRef)
    ? fileRef
    : path.join(baseDir, fileRef);
  const content = fs.readFileSync(fullPath, "utf8");
  try {
    return JSON.parse(content);
  } catch {
    return yaml.load(content);
  }
}

// Resolve JSON Pointer path in an object
function getByPointer(obj: any, pointer: string): any {
  if (pointer === "#" || pointer === "") return obj;
  const parts = pointer
    .replace(/^#\//, "")
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur = obj;
  for (const key of parts) {
    cur = cur[key];
    if (cur === undefined) throw new Error(`Pointer '${pointer}' not found.`);
  }
  return cur;
}

// Recursively resolve all $ref entries, loading external files
function resolveRefs(
  node: any,
  baseDoc: any,
  basePath: string,
  seenRefs: Set<string> = new Set()
): any {
  if (Array.isArray(node)) {
    return node.map((v) => resolveRefs(v, baseDoc, basePath, seenRefs));
  }
  if (isObject(node)) {
    const refVal = (node as any)["$ref"];
    if (typeof refVal === "string") {
      const ref = refVal;
      const [filePart, pointerPart = ""] = ref.split("#");
      const targetDoc = filePart ? loadFileSync(filePart, basePath) : baseDoc;
      const targetBase = filePart
        ? path.dirname(path.join(basePath, filePart))
        : basePath;
      const canonical = (filePart || "#") + "#" + pointerPart;
      if (seenRefs.has(canonical)) {
        return { $circular: ref };
      }
      seenRefs.add(canonical);
      const fragment = getByPointer(targetDoc, `#${pointerPart}`);
      return resolveRefs(fragment, targetDoc, targetBase, new Set(seenRefs));
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = resolveRefs(v, baseDoc, basePath, seenRefs);
    }
    return out;
  }
  return node;
}

// ── Mapping Tracker ──────────────────────────────────────────────────────────
class MappingTracker {
  private map = new Map<string, string>();
  record(destPtr: string, srcPtr: string) {
    this.map.set(destPtr, srcPtr);
  }
  write(file: string) {
    const obj: Record<string, string> = {};
    for (const [d, s] of this.map) obj[d] = s;
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf-8");
  }
}

// ── Path Merger ─────────────────────────────────────────────────────────────
class PathMerger {
  static merge(root: any) {
    root.paths = { ...(root.paths || {}), ...(root["x-ms-paths"] || {}) };
    delete root["x-ms-paths"];
  }
}

// ── Host Parameter Normalizer ─────────────────────────────────────────────────
class HostParameterNormalizer {
  constructor(private root: any) {}
  normalize() {
    const hostParam: ParameterizedHost | undefined =
      this.root["x-ms-parameterized-host"];
    const baseHost = hostParam
      ? `${hostParam.useSchemePrefix ? "https://" : ""}${hostParam.hostTemplate}`
      : this.root.host;

    for (const rawPath of Object.keys(this.root.paths || {})) {
      const ops = this.root.paths[rawPath];
      const normalizedPath = rawPath
        .split(/(\{[^}]+\})/g)
        .map((seg) =>
          seg.startsWith("{") && seg.endsWith("}")
            ? `{${normalizeName(seg.slice(1, -1))}}`
            : seg
        )
        .join("");

      delete this.root.paths[rawPath];
      this.root.paths[normalizedPath] = ops;

      for (const opKey of Object.keys(ops)) {
        const op = ops[opKey];
        op.__host = baseHost;
        if (hostParam?.parameters.length) {
          const params = hostParam.parameters.map((p) => ({
            ...p,
            name: normalizeName(p.name),
          }));
          op.parameters =
            hostParam.positionInOperation === "first"
              ? [...params, ...(op.parameters || [])]
              : [...(op.parameters || []), ...params];
        }
        if (op.parameters) {
          op.parameters = op.parameters.map((p: any) =>
            p.in === "body"
              ? { ...p, name: "_body_" }
              : { ...p, name: normalizeName(p.name) }
          );
        }
      }
    }
    delete this.root["x-ms-parameterized-host"];
  }
}

// ── Schema Expander & Inheritance ─────────────────────────────────────────────
class SchemaExpander {
  private inheritanceMap: Record<string, string[]> = {};
  private referencedDefs = new Set<string>();
  constructor(
    private definitions: Record<string, any>,
    private mapping: MappingTracker
  ) {
    this.buildInheritanceMap();
  }

  private buildInheritanceMap() {
    for (const [name, schema] of Object.entries(this.definitions)) {
      if (schema.allOf)
        for (const s of schema.allOf) {
          if (s.$ref) {
            const parent = this.refName(s.$ref);
            (this.inheritanceMap[parent] ||= []).push(name);
          }
        }
    }
  }

  private refName(ref: string): string {
    const m = ref.match(/#\/definitions\/(.+)$/);
    return m ? m[1] : ref.split("/").pop()!;
  }

  private getLeafDescendants(base: string): string[] {
    const kids = this.inheritanceMap[base] || [];
    if (!kids.length) return [];
    return kids.flatMap((k) => {
      const grand = this.getLeafDescendants(k);
      return grand.length ? grand : [k];
    });
  }

  expand(
    node: any,
    destPtr: string = "#",
    srcPtr: string = "#",
    seen = new Set<string>()
  ): any {
    this.mapping.record(destPtr, srcPtr);
    if (Array.isArray(node)) {
      return node.map((x, i) =>
        this.expand(x, `${destPtr}/${i}`, `${srcPtr}/${i}`, seen)
      );
    }
    if (isObject(node)) {
      const refVal = (node as any)["$ref"];
      if (typeof refVal === "string") {
        const name = this.refName(refVal);
        if (this.inheritanceMap[name]) {
          const leaves = this.getLeafDescendants(name);
          return {
            $anyOf: leaves.map((leaf, i) =>
              this.expand(
                { $ref: `#/definitions/${leaf}` },
                `${destPtr}/$anyOf/${i}`,
                `#/definitions/${leaf}`,
                seen
              )
            ),
          };
        }
        if (seen.has(name)) {
          return { $circular: refVal };
        }
        this.referencedDefs.add(name);
        const schema = this.definitions[name];
        const next = new Set(seen).add(name);
        return this.expand(schema, destPtr, `#/definitions/${name}`, next);
      }
      if (node.allOf) {
        const merged = node.allOf.reduce(
          (acc: any, sub: any, i: number) =>
            this.merge(
              acc,
              this.expand(
                sub,
                `${destPtr}/allOf/${i}`,
                `${srcPtr}/allOf/${i}`,
                seen
              )
            ),
          {}
        );
        return this.expand(merged, destPtr, srcPtr, seen);
      }
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = this.expand(
          v,
          `${destPtr}/${escapeJsonPointer(k)}`,
          `${srcPtr}/${escapeJsonPointer(k)}`,
          seen
        );
      }
      return out;
    }
    return node;
  }

  private merge(a: any, b: any): any {
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (isObject(a) && isObject(b)) {
      const res = { ...a };
      for (const [k, v] of Object.entries(b)) {
        res[k] = res[k] !== undefined ? this.merge(res[k], v) : v;
      }
      return res;
    }
    return b;
  }

  getReferencedDefs(): Set<string> {
    return this.referencedDefs;
  }
}

// ── Definition Stripper ─────────────────────────────────────────────────────
class DefinitionStripper {
  static strip(root: any, referenced: Set<string>, preserve: boolean) {
    const defs = Object.keys(root.definitions || {});
    if (!preserve) {
      delete root.definitions;
      delete root.parameters;
      delete root.securityDefinitions;
      const unused = defs.filter((d) => !referenced.has(d));
      if (unused.length) console.warn("⚠️ Unreferenced definitions:", unused);
    }
  }
}

// ── Key Sorter ──────────────────────────────────────────────────────────────
class KeySorter {
  static sort(x: any): any {
    if (Array.isArray(x)) return x.map(KeySorter.sort);
    if (isObject(x)) {
      const out: Record<string, any> = {};
      for (const k of Object.keys(x).sort()) {
        out[k] = KeySorter.sort(x[k]);
      }
      return out;
    }
    return x;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function run(
  inFile: string,
  outFile: string,
  mapFile: string | undefined,
  opts: Options
) {
  // 1) Load and resolve refs
  const rootObj = loadFileSync(inFile, path.dirname(inFile));
  const resolved = resolveRefs(rootObj, rootObj, path.dirname(inFile));

  // 2) Merge paths & normalize host params
  PathMerger.merge(resolved);
  new HostParameterNormalizer(resolved).normalize();

  // 3) Expand schemas
  const mapping = new MappingTracker();
  const expander = new SchemaExpander(resolved.definitions || {}, mapping);
  const expanded = expander.expand(resolved);

  // 4) Strip definitions
  DefinitionStripper.strip(
    expanded,
    expander.getReferencedDefs(),
    opts.preserveDefinitions
  );

  // 5) Sort keys
  const sorted = KeySorter.sort(expanded);

  // 6) Write outputs
  fs.writeFileSync(outFile, JSON.stringify(sorted, null, 2), "utf-8");
  console.log(`✔ Canonical JSON: ${outFile}`);
  if (mapFile) {
    mapping.write(mapFile);
    console.log(`✔ Mapping JSON: ${mapFile}`);
  }
}

// ── CLI Boot ────────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Usage: ts-node src/canonical-parser.ts <in.yaml> <out.json> <map.json?> [--preserve-defs]"
    );
    process.exit(1);
  }
  const [inFile, outFile, maybeMap, flag] = args;
  const opts: Options = { preserveDefinitions: flag === "--preserve-defs" };
  await run(inFile, outFile, maybeMap, opts);
})();
