import { RegistryKind } from "./definitions.js";
import * as fs from "fs";
import path from "path";

const referenceRegex = /"\$ref":\s*"([^"]*?\.json)(?:#([^"]*?))?"/gm;

export interface ReferenceMetadata {
  /** Short name of the reference. This is not sufficient to avoid collisions but it often useful. */
  name: string;
  /** The registry this reference points to. */
  registry: RegistryKind;
  /** The fully expanded path to the source file. */
  fullPath: string;
  /** The fully expanded reference. */
  expandedRef: string;
}

/**
 * Compile various sources of path information into a canonical set of
 * reference metadata.
 * @param refs The $ref value to parse.
 * @param filePath A file path to use when resolving relative paths.
 */
export function parseReference(ref: string): ReferenceMetadata | undefined {
  if (ref.startsWith(".")) {
    throw new Error(`Unexpected relative path: ${ref}`);
  }

  // replace backslashes with forward slashes since that is what
  // the regex expects.
  ref = ref.replace(/\\/g, "/");
  const regex = /(.+\.json)?#\/(.+)\/(.+)/;
  const match = ref.match(regex);
  if (!match) {
    return undefined;
  }
  const originalRef = match[0];
  let fullPath = getResolvedPath(match[1]);
  const section = match[2];
  const name = match[3];
  const expandedRef = getResolvedPath(originalRef);
  if (!fullPath) {
    throw new Error("Unexpected fullPath undefined.");
  }
  if (!expandedRef) {
    throw new Error("Unexpected expandedRef undefined.");
  }
  let registry: RegistryKind;
  switch (section) {
    case "definitions":
      registry = RegistryKind.Definition;
      break;
    case "parameters":
      registry = RegistryKind.Parameter;
      break;
    case "responses":
      registry = RegistryKind.Response;
      break;
    case "securityDefinitions":
      registry = RegistryKind.SecurityDefinition;
      break;
    default:
      throw new Error(`Unknown registry: ${section}`);
  }
  return {
    name: name,
    registry: registry,
    fullPath: fullPath,
    expandedRef: expandedRef,
  };
}

export function isReference(value: any): boolean {
  return Object.keys(value).includes("$ref");
}

async function loadFile(
  filepath: string,
  rootPath: string | undefined,
  args: any
): Promise<Map<string, any>> {
  const contents = new Map<string, any>();
  if (filepath.endsWith(".json")) {
    const swaggerContent = await loadSwaggerFile(filepath, rootPath);
    if (!swaggerContent) {
      throw new Error(`No Swagger content in file: ${filepath}`);
    }
    contents.set(filepath, swaggerContent);
  } else {
    throw new Error(`Unsupported file type: ${filepath}`);
  }
  return contents;
}

export async function loadPaths(
  paths: string[],
  rootPath: string | undefined,
  args: any
): Promise<Map<string, any>> {
  const jsonContents = new Map<string, any>();
  const refs = new Set<string>();

  for (const p of paths) {
    if (!validatePath(p)) {
      throw new Error(`Invalid path ${p}`);
    }
    const stats = fs.statSync(p);
    let values: Map<string, any>;

    if (stats.isDirectory()) {
      const swaggerValues = await loadFolder(p, rootPath);
      if (!swaggerValues) {
        throw new Error(`No Swagger files found: ${p}`);
      }
      values = swaggerValues;
    } else {
      values = await loadFile(p, rootPath, args);
    }

    for (const [key, value] of values.entries()) {
      const fileRefs = await extractFileReferences(key, rootPath);
      for (const ref of fileRefs) {
        refs.add(ref);
      }
      const resolvedKey = getResolvedPath(key);
      jsonContents.set(resolvedKey, value);
    }
  }

  const resolvedKeys = [...jsonContents.keys()].map((k) => getResolvedPath(k));
  const externalPathsToLoad = [...refs].filter(
    (k) => !resolvedKeys.includes(k)
  );

  if (externalPathsToLoad.length > 0) {
    const additional = await loadPaths(externalPathsToLoad, undefined, args);
    for (const [k, v] of additional.entries()) {
      jsonContents.set(k, v);
    }
  }

  return jsonContents;
}

/** Expands all references into fully-qualified ones and ensures consistent use
 * of forward slashes.
 */
function normalizeReferences(
  filepath: string,
  content: string,
  rootPath: string | undefined
): string {
  // ensure backslashes are replaced with forward slashes
  filepath = getResolvedPath(filepath).replace(/\\/g, "/");

  // Expand all relative references. If rootPath is supplied, use that.
  // Otherwise use the filepath location to resolve relative references.
  const relativeRefRegex = referenceRegex;
  let updated = content.replace(relativeRefRegex, (_, relPath, target) => {
    const resolvedPath = getResolvedPath(relPath, rootPath ?? filepath).replace(
      /\\/g,
      "/"
    );
    const newRef = target ? `${resolvedPath}#${target}` : resolvedPath;
    return `"$ref": "${newRef}"`;
  });

  // Expand all local references
  const localRefRegex = /"\$ref": "(#\/\w+\/[\w\-\.]+)"/gm;
  updated = updated.replace(localRefRegex, (_, target) => {
    const newRef = `${filepath}${target}`;
    return `"$ref": "${newRef}"`;
  });
  return updated;
}

/**
 * Load a Swagger file with paths normalized and relative references expanded into full-qualified
 * ones. If the file is not a Swagger file, it will return undefined.
 */
export async function loadSwaggerFile(
  sourcePath: string,
  rootPath: string | undefined
): Promise<any | undefined> {
  const fileContent = normalizeReferences(
    sourcePath,
    fs.readFileSync(sourcePath, "utf-8"),
    rootPath
  );
  try {
    const jsonContent = JSON.parse(fileContent);
    if (!jsonContent.swagger) {
      // ignore non-Swagger JSON files
      return undefined;
    }
    return jsonContent;
  } catch (error) {
    // ignore non-JSON files
    return undefined;
  }
}

/**
 * Extracts from the referenced file any file references from $ref
 * usages. Returns an array of file paths that are referenced. Will
 * recursively search for references in the referenced files. Ignores
 * examples.
 * @param data The JSON data to search for references.
 * @param path The path to the file.
 * @returns An array of file paths that are referenced.
 */
export async function extractFileReferences(
  path: string,
  rootPath: string | undefined
): Promise<string[]> {
  const visited = new Set<string>();

  async function extractFileReferencesInternal(
    path: string,
    rootPath: string | undefined
  ): Promise<string[]> {
    if (visited.has(path)) {
      return [];
    }
    const resultSet = new Set<string>();
    const fileContents = JSON.stringify(await loadSwaggerFile(path, rootPath));
    const refMatches = [...fileContents.matchAll(referenceRegex)];
    for (const match of refMatches) {
      let matchPath = match[1];
      if (matchPath !== "") {
        const resolvedMatch = getResolvedPath(matchPath, path);
        // ignore examples
        if (match[2] === undefined && matchPath.includes("examples")) {
          continue;
        }
        resultSet.add(resolvedMatch);
      }
    }
    visited.add(path);
    // recursively search for new references within the referenced files. Do not
    // use rootPath for nested references. They should use their own location to
    // resolve relative references.
    for (const childPath of resultSet) {
      const nestedRefs = await extractFileReferencesInternal(
        childPath,
        undefined
      );
      for (const ref of nestedRefs) {
        resultSet.add(ref);
      }
    }
    return [...resultSet];
  }
  const resultSet = await extractFileReferencesInternal(path, rootPath);
  return [...resultSet];
}

async function loadFolder(
  path: string,
  rootPath: string | undefined
): Promise<Map<string, any> | undefined> {
  const jsonContents = new Map<string, any>();
  const pathsToLoad = fs.readdirSync(path);
  for (const filePath of pathsToLoad) {
    const fullPath = `${path}/${filePath}`;
    const filePathStats = fs.statSync(fullPath);
    // TODO: For now, don't crawl subdirectories.
    if (filePathStats.isDirectory()) {
      continue;
    }
    const contents = await loadSwaggerFile(fullPath, rootPath);
    if (contents) {
      jsonContents.set(fullPath, contents);
    }
  }
  if (jsonContents.size === 0) {
    return undefined;
  }
  return jsonContents;
}

function validatePath(value: string): boolean {
  const resolvedPath = getResolvedPath(value);
  const stats = fs.statSync(resolvedPath);
  return stats.isFile() || stats.isDirectory();
}

/** Converts a single value or array to an array. */
export function forceArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Turn a relative path into a fully-qualified resolved path.
 * If the path is relative, the root path must be provided.
 */
export function getResolvedPath(targetPath: string, rootPath?: string): string {
  if (targetPath.startsWith(".") && !rootPath) {
    throw new Error("Root path must be provided to resolve relative paths.");
  }

  if (rootPath !== undefined) {
    // check if rootpath is already a dir or a file
    const stats = fs.statSync(rootPath);
    if (stats.isDirectory()) {
      return path.resolve(rootPath, targetPath);
    } else if (stats.isFile()) {
      return path.resolve(path.dirname(rootPath), targetPath);
    } else {
      throw new Error("Root path is neither a file nor a directory.");
    }
  }
  return path.resolve(targetPath);
}

/**
 * Creates a sorted copy of an array without modifying the original array.
 * @param array The array to sort.
 * @param compareFn Optional. A function that defines the sort order.
 * @returns A new array that is sorted.
 */
export function toSorted<T>(
  array: T[],
  compareFn?: (a: T, b: T) => number
): T[] {
  return [...array].sort(compareFn);
}

/**
 * Convert path segments into a flatted, URL-encoded path string.
 */
export function getUrlEncodedPath(
  segments: string[] | undefined
): string | undefined {
  if (segments === undefined) return undefined;
  return segments.map((x: string) => encodeURIComponent(x)).join("/");
}

/**
 * Returns the string key for the `RegistryKind` enum.
 */
export function getRegistryName(kind: RegistryKind): string {
  switch (kind) {
    case RegistryKind.Definition:
      return "definitions";
    case RegistryKind.Parameter:
      return "parameters";
    case RegistryKind.Response:
      return "responses";
    case RegistryKind.SecurityDefinition:
      return "securityDefinitions";
  }
}
