import { RegistryKind } from "./definitions.js";
import * as fs from "fs";
import { exec } from "child_process";
import path from "path";
import { OpenAPIV2 } from "openapi-types";

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
  path: string,
  rootPath: string | undefined,
  args: any
): Promise<Map<string, any>> {
  let contents = new Map<string, any>();
  const compileTsp = args["compile-tsp"];
  if (path.endsWith(".tsp") && compileTsp) {
    contents = {
      ...contents,
      ...(await compileTypespec(path, rootPath, args)),
    };
  } else if (path.endsWith(".json")) {
    const swaggerContent = await loadSwaggerFile(path, rootPath);
    contents.set(path, swaggerContent);
  } else {
    throw new Error(`Unsupported file type: ${path}`);
  }
  if (contents.size === 0) {
    throw new Error(`No content in file: ${path}`);
  }
  return contents;
}

export async function loadPaths(
  paths: string[],
  rootPath: string | undefined,
  args: any
): Promise<Map<string, any>> {
  let jsonContents = new Map<string, any>();
  const refs = new Set<string>();
  for (const path of paths) {
    if (!validatePath(path)) {
      throw new Error(`Invalid path ${path}`);
    }
    const stats = fs.statSync(path);
    let values: Map<string, any> | undefined;
    let compiledTypespec: boolean;
    if (stats.isDirectory()) {
      const compileTsp = args["compile-tsp"];

      // always try to load Swagger first, if it exists.
      const swaggerValues = await loadFolder(path, rootPath);

      // if compile-tsp is set, always attempt to compile TypeSpec files.
      const typespecValues = compileTsp
        ? await compileTypespec(path, rootPath, args)
        : undefined;
      compiledTypespec = typespecValues !== undefined;

      if (compiledTypespec && !rootPath) {
        throw new Error(
          "Root path must be provided to resolve relative paths in compiled TypeSpec."
        );
      }
      if (compileTsp) {
        if (!typespecValues && !swaggerValues) {
          throw new Error(`No Swagger or TypeSpec files found: ${path}`);
        }
        values = (typespecValues ?? swaggerValues)!;
      } else {
        if (!swaggerValues) {
          throw new Error(`No Swagger files found: ${path}`);
        }
        values = swaggerValues;
      }
    } else {
      values = await loadFile(path, rootPath, args);
    }

    // load the initial top-level files and extract any references
    for (const [key, value] of values.entries()) {
      const fileRefs = await extractFileReferences(key, rootPath);
      for (const ref of fileRefs) {
        refs.add(ref);
      }
      const resolvedKey = getResolvedPath(key);
      jsonContents.set(resolvedKey, value);
    }
  }

  // remove all the paths that were already loaded
  const resolvedKeys = [...jsonContents.keys()].map((key) =>
    getResolvedPath(key)
  );

  // now load any references which may themselves contain references
  const externalPathsToLoad = [...refs].filter(
    (key) => !resolvedKeys.includes(key)
  );
  if (externalPathsToLoad.length > 0) {
    // do not use rootPath for additional contents. They should use their own location to
    // resolve relative references.
    const additionalContents = await loadPaths(
      externalPathsToLoad,
      undefined,
      args
    );
    for (const [key, value] of additionalContents.entries()) {
      jsonContents.set(key, value);
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
  const localRefRegex = /"\$ref": "(#\/\w+\/[\w\.]+)"/gm;
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

/**
 * Attempts to compile TypeSpec in a given folder if no Swagger was found.
 */
async function compileTypespec(
  path: string,
  rootPath: string | undefined,
  args: any
): Promise<Map<string, any> | undefined> {
  const typespecOutputDir = rootPath ?? `${process.cwd()}/tsp-output`;
  const compilerPath = args["typespec-compiler-path"];
  const isDir = fs.statSync(path).isDirectory();
  if (isDir) {
    // ensure there is a typespec file in the folder
    const files = fs.readdirSync(path);
    const typespecFiles = files.filter((file) => file.endsWith(".tsp"));
    if (typespecFiles.length === 0) {
      return undefined;
    }
  }
  const tspCommand = compilerPath
    ? `node ${compilerPath}/entrypoints/cli.js`
    : "tsp";
  const options = [
    `--option=@azure-tools/typespec-autorest.emitter-output-dir=${typespecOutputDir}`,
    `--option=@azure-tools/typespec-autorest.output-file=openapi.json`,
  ];
  if (args["typespec-version-selector"]) {
    const version = args["typespec-version-selector"];
    options.push(`--option=@azure-tools/typespec-autorest.version=${version}`);
  }
  if (args["verbose"]) {
    options.push("--trace=@azure-tools/typespec-autorest");
  }
  const command = `${tspCommand} compile ${path} --emit=@azure-tools/typespec-autorest ${options.join(" ")}`;
  const result = await new Promise((resolve, reject) => {
    console.log(`Running: ${command}`);
    exec(command, (error: any, stdout: any, stderr: any) => {
      if (error) {
        const errMessage = stdout === "" ? error : stdout;
        throw new Error(
          `${errMessage}\nError occurred while compiling TypeSpec!`
        );
      }
      console.log(stdout);
      resolve(stdout);
    });
  });
  if (!result) {
    return undefined;
  }
  // if successful, there should be a Swagger file in the folder,
  // so attempt to reload.
  return await loadFolder(typespecOutputDir, rootPath);
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

/** Search a document for an item at a specific path
 * @param path The path to the item
 * @param doc The document to search
 */
export function getItemAtPath(path: string[], doc: OpenAPIV2.Document): any {
  let item = doc;
  for (const segment of path) {
    item = (item as any)[segment];
  }
  return item as any;
}
