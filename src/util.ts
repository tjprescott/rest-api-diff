import { RegistryKind } from "./definitions.js";
import * as fs from "fs";
import { exec } from "child_process";
import path from "path";
import { off } from "process";

const typespecOutputDir = `${process.cwd()}/tsp-output`;

export interface ReferenceMetadata {
  /** Short name of the reference. This is not sufficient to avoid collisions but it often useful. */
  name: string;
  /** The registry this reference points to. */
  registry: RegistryKind;
  /** The original, unaltered version of $ref. */
  original: string;
  /** The fully expanded path to the source file. */
  fullPath: string;
  /** The fully expanded reference. */
  expandedRef: string;
}

/**
 * Compile various sources of path information into a canonical set of
 * reference metadata.
 * @param refs The $ref value to parse.
 * @param rootPath The root path to use when resolving relative paths.
 * @param filePath A file path to use when resolving relative paths.
 */
export function parseReference(
  ref: string,
  rootPath?: string,
  filePath?: string
): ReferenceMetadata | undefined {
  if (!rootPath && !filePath) {
    throw new Error("At least one of rootPath or filePath must be provided.");
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
  let relPath = match[1];
  const section = match[2];
  const name = match[3];
  let fullPath: string | undefined = undefined;
  let expandedRef: string | undefined = undefined;
  if (relPath) {
    if (rootPath === undefined) {
      throw new Error(
        `Relative path ${relPath} cannot be resolved without rootPath.`
      );
    }
    fullPath = path.normalize(getResolvedPath(relPath, rootPath));
    expandedRef = getResolvedPath(originalRef, rootPath);
  } else {
    if (filePath === undefined) {
      throw new Error(`Path ${relPath} cannot be resolved without filePath.`);
    }
    fullPath = filePath;
    expandedRef = `${filePath}#/${section}/${name}`;
  }
  if (!fullPath) {
    throw new Error("fullPath cannot be undefined.");
  }
  if (!expandedRef) {
    throw new Error("expandedRef cannot be undefined.");
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
    original: originalRef,
    fullPath: fullPath,
    expandedRef: expandedRef,
  };
}

export function isReference(value: any): boolean {
  return Object.keys(value).includes("$ref");
}

async function loadFolderContents(
  path: string,
  args: any
): Promise<Map<string, any>> {
  const compileTsp = args["compile-tsp"];
  const swaggerValues = await loadFolder(path);
  // if compile-tsp is set, always attempt to compile TypeSpec files.
  const typespecValues = compileTsp
    ? await compileTypespec(path, args)
    : undefined;
  if (compileTsp) {
    if (!typespecValues && !swaggerValues) {
      throw new Error(`No Swagger or TypeSpec files found: ${path}`);
    }
    return (typespecValues ?? swaggerValues)!;
  } else {
    if (!swaggerValues) {
      throw new Error(`No Swagger files found: ${path}`);
    }
    return swaggerValues;
  }
}

async function loadFile(path: string, args: any): Promise<Map<string, any>> {
  let contents = new Map<string, any>();
  const compileTsp = args["compile-tsp"];
  if (path.endsWith(".tsp") && compileTsp) {
    contents = { ...contents, ...(await compileTypespec(path, args)) };
  } else if (path.endsWith(".json")) {
    const swaggerContent = await loadSwaggerFile(path);
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
  args: any,
  rootPath: string
): Promise<Map<string, any>> {
  let jsonContents = new Map<string, any>();
  const refs = new Set<string>();
  for (const path of paths) {
    if (!validatePath(path)) {
      throw new Error(`Invalid path ${path}`);
    }
    const stats = fs.statSync(path);
    const values = stats.isDirectory()
      ? await loadFolderContents(path, args)
      : await loadFile(path, args);
    for (const [key, value] of values.entries()) {
      const fileRefs = extractFileReferences(value, rootPath);
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
  const externalPathsToLoad = [...refs].filter(
    (key) => !resolvedKeys.includes(key)
  );
  if (externalPathsToLoad.length > 0) {
    const additionalContents = await loadPaths(
      externalPathsToLoad,
      args,
      rootPath
    );
    for (const [key, value] of additionalContents.entries()) {
      jsonContents.set(key, value);
    }
  }
  return jsonContents;
}

/** Expands all local references into fully-qualified ones. */
function normalizeReferences(filepath: string, content: string): string {
  // ensure backslashes are replaced with forward slashes
  filepath = getResolvedPath(filepath).replace(/\\/g, "/");
  const regex = /"\$ref": ("#\/\w+\/[\w\.]+")/gm;
  const updated = content.replace(regex, (_, p1) => {
    const newRef = `"${filepath}${p1.slice(1)}`;
    return `"$ref": ${newRef}`;
  });
  return updated;
}

/**
 * Loads Swagger files. If the file is not a Swagger file, it will return undefined.
 */
export async function loadSwaggerFile(
  sourcePath: string
): Promise<any | undefined> {
  const fileContent = normalizeReferences(
    sourcePath,
    fs.readFileSync(sourcePath, "utf-8")
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
 * usages. Returns an array of file paths that are referenced.
 * @param data The JSON data to search for references.
 * @param rootPath The root path to use when resolving relative paths.
 * @returns An array of file paths that are referenced.
 */
export function extractFileReferences(data: any, rootPath: string): string[] {
  const fileContent = JSON.stringify(data);
  const regex = /"\$ref":\s*"([^"]*?\.json)(?:#([^"]*?))?"/g;
  const refMatches = [...fileContent.matchAll(regex)];
  const resultSet = new Set<string>();
  for (const match of refMatches) {
    let matchPath = match[1];
    if (matchPath !== "") {
      const resolvedMatch = getResolvedPath(matchPath, rootPath);
      // ignore examples
      if (match[2] === undefined && matchPath.includes("examples")) {
        continue;
      }
      resultSet.add(resolvedMatch);
    }
  }
  return [...resultSet];
}

async function loadFolder(path: string): Promise<Map<string, any> | undefined> {
  const jsonContents = new Map<string, any>();
  const pathsToLoad = fs.readdirSync(path);
  for (const filePath of pathsToLoad) {
    const fullPath = `${path}/${filePath}`;
    const filePathStats = fs.statSync(fullPath);
    // TODO: For now, don't crawl subdirectories.
    if (filePathStats.isDirectory()) {
      continue;
    }
    const contents = await loadSwaggerFile(fullPath);
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
  args: any
): Promise<Map<string, any> | undefined> {
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
  return await loadFolder(typespecOutputDir);
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
  return rootPath
    ? path.resolve(rootPath, targetPath)
    : path.resolve(targetPath);
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
