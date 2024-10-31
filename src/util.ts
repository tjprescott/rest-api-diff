import { RegistryKind } from "./definitions.js";
import * as fs from "fs";

export interface ReferenceMetadata {
  name: string;
  registry: RegistryKind;
  filePath?: string;
}

export function parseReference(ref: string): ReferenceMetadata | undefined {
  const regex = /(.+\.json)?#\/(.+)\/(.+)/;
  const match = ref.match(regex);
  if (!match) {
    return undefined;
  }
  const path = match[1];
  const section = match[2];
  const name = match[3];
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
    filePath: path,
    registry: registry,
    name: name,
  };
}

export function isReference(value: any): boolean {
  return Object.keys(value).includes("$ref");
}

async function loadFolderContents(path: string): Promise<Map<string, any>> {
  const compileTsp = args["compile-tsp"];
  const swaggerValues = await loadFolder(path);
  // if compile-tsp is set, always attempt to compile TypeSpec files.
  const typespecValues = compileTsp ? await compileTypespec(path) : undefined;
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

async function loadFile(path: string): Promise<Map<string, any>> {
  let contents = new Map<string, any>();
  const compileTsp = args["compile-tsp"];
  if (path.endsWith(".tsp") && compileTsp) {
    contents = { ...contents, ...(await compileTypespec(path)) };
  } else if (path.endsWith(".json")) {
    contents.set(path, await loadSwaggerFile(path));
  } else {
    throw new Error(`Unsupported file type: ${path}`);
  }
  if (contents.size === 0) {
    throw new Error(`No content in file: ${path}`);
  }
  return contents;
}

export async function loadPaths(paths: string[]): Promise<Map<string, any>> {
  let jsonContents = new Map<string, any>();
  for (const path of paths) {
    if (!validatePath(path)) {
      throw new Error(`Invalid path ${path}`);
    }
    const stats = fs.statSync(path);
    const values = stats.isDirectory()
      ? await loadFolderContents(path)
      : await loadFile(path);
    for (const [key, value] of values.entries()) {
      jsonContents.set(key, value);
    }
  }
  return jsonContents;
}

/**
 * Loads Swagger files. If the file is not a Swagger file, it will return undefined.
 */
async function loadSwaggerFile(path: string): Promise<any | undefined> {
  const fileContent = fs.readFileSync(path, "utf-8");
  try {
    const jsonContent = JSON.parse(fileContent);
    if (!jsonContent.swagger) {
      return undefined;
    }
    return jsonContent;
  } catch (error) {
    return undefined;
  }
}

async function loadFolder(path: string): Promise<Map<string, any> | undefined> {
  const jsonContents = new Map<string, any>();
  const pathsToLoad = fs.readdirSync(path);
  for (const filepath of pathsToLoad) {
    const fullPath = `${path}/${filepath}`;
    const filePathStats = fs.statSync(fullPath);
    // TODO: For now, don't crawl subdirectories.
    if (filePathStats.isDirectory()) {
      continue;
    }
    const contents = await loadSwaggerFile(fullPath);
    if (contents) {
      jsonContents.set(filepath, contents);
    }
  }
  if (jsonContents.size === 0) {
    return undefined;
  }
  return jsonContents;
}

function validatePath(path: string): boolean {
  try {
    const stats = fs.statSync(path);
    return stats.isFile() || stats.isDirectory();
  } catch (error) {
    return false;
  }
}
