import * as crypto from "crypto";
import { OpenAPIV2 } from "openapi-types";
import { DefinitionRegistry, RegistryKind } from "./definitions.js";
import { ParameterizedHost } from "./extensions/parameterized-host.js";
import { isReference, parseReference } from "./util.js";

/** A class for parsing Swagger files into an expanded, normalized form. */
export class SwaggerParser {
  public defRegistry: DefinitionRegistry;
  private parameterizedHost?: ParameterizedHost;
  private defaultConsumes?: string[];
  private defaultProduces?: string[];
  private errorSchemas: Map<string, OpenAPIV2.SchemaObject> = new Map();
  private host?: string;
  private rootPath: string;
  private swaggerMap: Map<string, any>;
  private result: any = {};

  constructor(map: Map<string, any>, rootPath: string, args: any) {
    this.rootPath = rootPath;
    this.defRegistry = new DefinitionRegistry(map, rootPath, args);
    this.swaggerMap = map;
  }

  async updateDiscoveredReferences() {
    await this.defRegistry.updateDiscoveredReferences();
  }

  /** Get the parsed result as a JSON object. */
  asJSON(): any {
    return this.result;
  }

  /** Returns the error schemas discovered for this parser. */
  getErrorSchemas(): Map<string, OpenAPIV2.SchemaObject> {
    return this.errorSchemas;
  }

  /** Parse a generic node. */
  parseNode(obj: any): any {
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

  /** Special handling for the root of a Swagger object. */
  parse(): SwaggerParser {
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

      // combine the paths and x-ms-paths objects
      const allPaths = { ...paths, ...xMsPaths };
      const newPaths = this.parsePaths(allPaths);
      if (!this.result.paths) {
        this.result.paths = {};
      }
      for (const [path, data] of Object.entries(newPaths).toSorted()) {
        this.result.paths[path] = data;
      }

      for (const [key, val] of Object.entries(data).toSorted()) {
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
            this.result[key] = this.parseNode(val);
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
    return this;
  }

  reportUnresolvedReferences(): void {
    const unresolvedReferences = this.defRegistry.getUnresolvedReferences();
    if (unresolvedReferences.length > 0) {
      console.warn(
        `== UNRESOLVED REFERENCES == (${unresolvedReferences.length})\n\n`
      );
      console.warn(`${unresolvedReferences.join("\n")}`);
    }
  }

  reportUnreferencedObjects(): void {
    const unreferencedDefinitions = this.defRegistry.getUnreferenced();
    // We don't care about unused security definitions because we don't really
    // use them in Azure. (We will still diff them though)
    unreferencedDefinitions.delete(RegistryKind.SecurityDefinition);
    if (unreferencedDefinitions.size > 0) {
      let total = 0;
      for (const value of unreferencedDefinitions.values()) {
        total += value.length;
      }
      console.warn(`\n== UNREFERENCED DEFINITIONS == (${total})\n`);
    }
    for (const [key, value] of unreferencedDefinitions.entries()) {
      if (value.length > 0) {
        console.warn(
          `\n**${RegistryKind[key]}** (${value.length})\n\n${value.join("\n")}`
        );
      }
    }
  }

  /** Parse a response object. */
  #parseResponse(value: any): any {
    let result: any = {};
    for (const [key, val] of Object.entries(value).toSorted()) {
      if (key === "headers") {
        result[key] = {};
        for (const [headerKey, headerVal] of Object.entries(
          val as object
        ).toSorted()) {
          // normalize header keys to lowercase
          result[key][headerKey.toLowerCase()] = this.parseNode(headerVal);
        }
      } else {
        result[key] = this.parseNode(val);
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
    for (const [code, data] of Object.entries(value).toSorted()) {
      if (code === "default") {
        // Don't expand the default response. We will handle this in a special way.
        const errorName = this.#parseErrorName(data);
        if (!this.errorSchemas.has(errorName)) {
          const expandedError = this.parseNode(data);
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
    for (const [key, val] of Object.entries(value).toSorted()) {
      if (key === "parameters") {
        // mix in any parameters from parameterized host
        const hostParams = this.parameterizedHost?.parameters ?? [];
        const allParams = [...(val as Array<any>), ...hostParams];

        const expanded = this.parseNode(allParams);
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
        result[key] = this.parseNode(value[key]);
      }
    }
    return result;
  }

  /** Parse each verb/operation pair. */
  #parseVerbs(value: any): any {
    let result: any = {};
    for (const [verb, data] of Object.entries(value).toSorted()) {
      result[verb] = this.#parseOperation(data);
    }
    return result;
  }

  /** Pare the entire Paths object. */
  parsePaths(value: any): any {
    let result: any = {};
    for (const [operationPath, pathData] of Object.entries(value).toSorted()) {
      // normalize the path to coerce the naming convention
      const normalizedPath = this.#normalizePath(operationPath);
      result[normalizedPath] = this.#parseVerbs(pathData);
    }
    return result;
  }

  #parseArray(value: any[], kind?: RegistryKind): any {
    // visit array objects but not arrays of primitives
    if (value.length > 0 && typeof value[0] === "object") {
      const values: any[] = [];
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        values.push(this.parseNode(item));
      }
      return values;
    } else {
      return value;
    }
  }

  #parseObject(value: any): any {
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
        console.warn(`Unresolved reference: ${ref}`);
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
    for (const [key, val] of Object.entries(value).toSorted()) {
      result[key] = this.parseNode(val);
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
