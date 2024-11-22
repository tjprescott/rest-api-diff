import * as crypto from "crypto";
import { OpenAPIV2 } from "openapi-types";
import { DefinitionRegistry, RegistryKind } from "./definitions.js";
import {
  forceArray,
  isReference,
  loadPaths,
  parseReference,
  toSorted,
} from "./util.js";

/** Parameterized Host Metadata */
interface ParameterizedHost {
  hostTemplate: string;
  useSchemePrefix: boolean;
  positionInOperation: "first" | "last";
  parameters: any[];
}

/** A class for parsing Swagger files into an expanded, normalized form. */
export class SwaggerParser {
  private parameterizedHost?: ParameterizedHost;
  private defaultConsumes?: string[];
  private defaultProduces?: string[];
  private errorSchemas: Map<string, OpenAPIV2.SchemaObject> = new Map();
  private host?: string;
  private rootPath: string;
  private result: any = {};
  private defRegistry?: DefinitionRegistry;
  private swaggerMap?: Map<string, any>;

  private constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Creates a new SwaggerParser instance asynchronously.
   * @param paths the path or paths to load
   * @param rootPath the path from which to resolve any relative paths
   * @param args arguments
   * @returns initialized SwaggerParser instance
   */
  static async create(
    paths: string | string[],
    rootPath: string,
    args: any
  ): Promise<SwaggerParser> {
    const parser = new SwaggerParser(rootPath);
    const pathMap = await loadPaths(forceArray(paths), args, rootPath);
    parser.defRegistry = new DefinitionRegistry(pathMap, rootPath, args);
    parser.swaggerMap = pathMap;
    return parser;
  }

  /** Special handling for the root of a Swagger object. */
  parse(): SwaggerParser {
    if (!this.swaggerMap) {
      throw new Error("Swagger map is not initialized.");
    }
    if (!this.defRegistry) {
      throw new Error("Definition registry is not initialized.");
    }
    const allPathsUnsorted: any = {};
    for (const [_, data] of this.swaggerMap.entries()) {
      // Retrieve any top-level defaults that need to be normalized later on.
      this.parameterizedHost = data["x-ms-parameterized-host"];
      this.defaultConsumes = data["consumes"];
      this.defaultProduces = data["produces"];
      this.host = data["host"];
      delete data["x-ms-parameterized-host"];
      delete data["consumes"];
      delete data["produces"];
      delete data["host"];

      const paths = data["paths"] ?? {};
      const xMsPaths = data["x-ms-paths"] ?? {};
      delete data["paths"];
      delete data["x-ms-paths"];

      // combine the paths and x-ms-paths objects and merge into overall paths object
      const allPaths = { ...paths, ...xMsPaths };
      const newPaths = this.#parsePaths(allPaths);
      for (const [path, data] of Object.entries(newPaths)) {
        allPathsUnsorted[path] = data;
      }

      for (const [key, val] of toSorted(Object.entries(data))) {
        switch (key) {
          case "swagger":
          case "info":
          case "host":
          case "basePath":
          case "schemes":
          case "consumes":
          case "produces":
          case "security":
          case "tags":
          case "externalDocs":
            this.result[key] = this.#parseNode(val);
            break;
          case "definitions":
            this.result[key] = this.defRegistry.getFlattenedCollection(
              RegistryKind.Definition
            );
            break;
          case "parameters":
            this.result[key] = this.defRegistry.getFlattenedCollection(
              RegistryKind.Parameter
            );
            break;
          case "responses":
            this.result[key] = this.defRegistry.getFlattenedCollection(
              RegistryKind.Response
            );
            break;
          case "securityDefinitions":
            this.result[key] = this.defRegistry.getFlattenedCollection(
              RegistryKind.SecurityDefinition
            );
            break;
          default:
            throw new Error(`Unhandled root key: ${key}`);
        }
      }
    }
    // sort all the paths and add into the result
    const allSortedPaths = Object.entries(allPathsUnsorted).sort((a, b) => {
      if (a[0] < b[0]) {
        return -1;
      } else if (a[0] > b[0]) {
        return 1;
      } else {
        return 0;
      }
    });
    this.result.paths = {};
    for (const [path, data] of allSortedPaths) {
      this.result.paths[path] = data;
    }
    // sort all of the top-level keys
    const sortedResult: any = {};
    for (const [key, val] of toSorted(Object.entries(this.result))) {
      sortedResult[key] = val;
    }
    this.result = sortedResult;
    return this;
  }

  /** Get the parsed result as a JSON object. */
  asJSON(): any {
    return this.result;
  }

  /** Returns the error schemas discovered by the parser. */
  getErrorSchemas(): Map<string, OpenAPIV2.SchemaObject> {
    return this.errorSchemas;
  }

  /** Returns the unresolved references discovered by the parser. */
  getUnresolvedReferences(): string[] {
    if (!this.defRegistry) {
      throw new Error("Definition registry is not initialized.");
    }
    return this.defRegistry.getUnresolvedReferences();
  }

  /** Returns unreferenced items. */
  getUnreferenced(): Map<RegistryKind, string[]> {
    if (!this.defRegistry) {
      throw new Error("Definition registry is not initialized.");
    }
    return this.defRegistry.getUnreferenced();
  }

  /** Returns the total number of unreferenced definitions. */
  getUnreferencedTotal(): number {
    if (!this.defRegistry) {
      throw new Error("Definition registry is not initialized.");
    }
    return this.defRegistry.getUnreferencedTotal();
  }

  /** Parse a generic node. */
  #parseNode(obj: any): any {
    if (obj === undefined || obj === null) {
      return undefined;
    }
    // base case for primitive types
    if (typeof obj !== "object") {
      return obj;
    } else if (Array.isArray(obj)) {
      return this.#parseArray(obj);
    } else if (typeof obj === "object") {
      return this.#parseObject(obj);
    }
  }

  /** Parse a response object. */
  #parseResponse(value: any): any {
    let result: any = {};
    for (const [key, val] of toSorted(Object.entries(value))) {
      if (key === "headers") {
        result[key] = {};
        for (const [headerKey, headerVal] of toSorted(
          Object.entries(val as object)
        )) {
          // normalize header keys to lowercase
          result[key][headerKey.toLowerCase()] = this.#parseNode(headerVal);
        }
      } else {
        result[key] = this.#parseNode(val);
      }
    }
    return result;
  }

  #parseErrorName(data: any): string {
    let name = "";
    const schema = data["schema"];
    if (schema) {
      const ref = schema["$ref"];
      if (ref) {
        const match = ref.match(/#\/definitions\/(.+)/);
        if (match) {
          name = match[1];
        }
      }
    }
    if (name === "") {
      // If we can't find a name, generate one based on a hash of the description.
      const desc = data["description"];
      const tag = crypto
        .createHash("sha256")
        .update(desc)
        .digest("hex")
        .slice(0, 8);
      name = `Error_${tag}`;
    }
    return name;
  }

  /** Parse the operation responses object. */
  #parseResponses(value: any): any {
    let result: any = {};
    for (const [code, data] of toSorted(Object.entries(value))) {
      if (code === "default") {
        // Don't expand the default response. We will handle this in a special way.
        const errorName = this.#parseErrorName(data);
        if (!this.errorSchemas.has(errorName)) {
          const expandedError = this.#parseNode(data);
          this.errorSchemas.set(errorName, expandedError);
        }
        // Later we will revisit and replace all of there with a value indicating they are, or are not, compatible.
        result[code] = {
          $error: errorName,
        };
      } else {
        result[code] = this.#parseResponse(data);
      }
    }
    return result;
  }

  /** Parse an Operation schema object, with special handling for parameters. */
  #parseOperation(value: any): any {
    let result: any = {};
    value["consumes"] = value["consumes"] ?? this.defaultConsumes;
    value["produces"] = value["produces"] ?? this.defaultProduces;
    for (const [key, val] of toSorted(Object.entries(value))) {
      if (key === "parameters") {
        // mix in any parameters from parameterized host
        const hostParams = this.parameterizedHost?.parameters ?? [];
        const allParams = [...(val as Array<any>), ...hostParams];

        const expanded = this.#parseNode(allParams);
        // ensure parameters are sorted by name since this ordering doesn't
        // matter from a REST API perspective.
        const sorted = (expanded as Array<any>).sort((a: any, b: any) => {
          if (a.name < b.name) {
            return -1;
          } else if (a.name > b.name) {
            return 1;
          } else {
            return 0;
          }
        });
        for (const param of sorted) {
          // normalize any path parameter names, since they don't surface in the
          // client.
          if (param.in === "path") {
            param.name = this.#normalizeName(param.name);
          } else if (param.in === "header") {
            // normalize header keys to lowercase
            param.name = param.name.toLowerCase();
          }
        }
        result[key] = sorted;
      } else if (key === "responses") {
        result[key] = this.#parseResponses(val);
      } else {
        result[key] = this.#parseNode(value[key]);
      }
    }
    return result;
  }

  /** Parse each verb/operation pair. */
  #parseVerbs(value: any): any {
    let result: any = {};
    for (const [verb, data] of toSorted(Object.entries(value))) {
      result[verb] = this.#parseOperation(data);
    }
    return result;
  }

  /** Pare the entire Paths object. */
  #parsePaths(value: any): any {
    let result: any = {};
    for (const [operationPath, pathData] of Object.entries(value)) {
      // normalize the path to coerce the naming convention
      const normalizedPath = this.#normalizePath(operationPath);
      result[normalizedPath] = this.#parseVerbs(pathData);
    }
    return result;
  }

  #parseArray(value: any[]): any {
    // visit array objects but not arrays of primitives
    if (value.length > 0 && typeof value[0] === "object") {
      const values: any[] = [];
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        values.push(this.#parseNode(item));
      }
      return values;
    } else {
      return value;
    }
  }

  #parseObject(value: any): any {
    if (!this.defRegistry) {
      throw new Error("Definition registry is not initialized.");
    }
    if (isReference(value)) {
      // get the value of the $ref key
      const ref = (value as any)["$ref"];
      const refResult = parseReference(ref, this.rootPath);
      if (!refResult) {
        if (ref.includes("examples")) {
          // special case examples since they simply don't matter
          return {
            $example: ref,
          };
        }
        throw new Error(`Failed to parse reference: ${ref}`);
      }
      const resolved = this.defRegistry.get(refResult);
      if (!resolved) {
        // log an unresolved reference
        this.defRegistry.logUnresolvedReference(value);
        return {
          $ref: ref,
        };
      }
      this.defRegistry.countReference(
        refResult.fullPath,
        refResult.name,
        refResult.registry
      );
      const references = this.defRegistry.getReferences(refResult.name);
      for (const ref of references) {
        this.defRegistry.countReference(
          refResult.fullPath!,
          ref,
          refResult.registry
        );
      }
      return this.#parseObject(resolved);
    }
    const result: any = {};
    // visit each key in the object in sorted order
    for (const [key, val] of toSorted(Object.entries(value))) {
      result[key] = this.#parseNode(val);
    }
    return result;
  }

  #normalizeName(name: string): string {
    return name.replace(/\W/g, "").toLowerCase();
  }

  #normalizePath(path: string): string {
    let normalizedPath = "";
    if (this.parameterizedHost) {
      if (this.parameterizedHost.useSchemePrefix) {
        // FIXME: pull this from the spec
        const scheme = "https";
        normalizedPath += `${scheme}://`;
      }
      normalizedPath += this.parameterizedHost.hostTemplate;
    } else if (this.host) {
      normalizedPath += this.host;
    }
    normalizedPath += path;
    // divide the path string to isolate the parameters from the regular text
    const pathComponents = normalizedPath.split(/({[^}]+})/);
    for (const comp of pathComponents) {
      // if comp is surrounded by curly braces, normalize the name
      const match = comp.match(/{(.+)}/);
      if (match) {
        // delete all non-alphanumeric characters and force to lowercase
        const newName = this.#normalizeName(match[1]);
        pathComponents[pathComponents.indexOf(comp)] = `{${newName}}`;
      }
    }
    normalizedPath = pathComponents.join("");
    return normalizedPath;
  }
}
