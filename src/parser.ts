import { OpenAPIV2 } from "openapi-types";
import { DefinitionRegistry, RegistryKind } from "./definitions.js";
import { ParameterizedHost } from "./extensions/parameterized-host.js";
import { PathKind, SwaggerPath } from "./paths.js";

export interface ReferenceMetadata {
  name: string;
  registry: RegistryKind;
  filePath?: string;
}

/** A class for parsing Swagger files into an expanded, normalized form. */
export class SwaggerParser {
  private definitions: DefinitionRegistry;
  private parameterizedHost?: ParameterizedHost;
  private host?: string;
  private result = {};
  private initialized: boolean = false;

  constructor(map: Map<string, any>) {
    this.definitions = new DefinitionRegistry(map, this);
    this.definitions.initialize();
    this.initialized = true;
    for (const [_, data] of map.entries()) {
      this.result = { ...this.result, ...this.parseRoot(data) };
    }
    const unresolvedReferences = this.definitions.getUnresolvedReferences();
    if (unresolvedReferences.length > 0) {
      console.warn(`Unresolved references: ${unresolvedReferences.join(", ")}`);
    }
  }

  /** Get the parsed result as a JSON object. */
  asJSON(): any {
    return this.result;
  }

  /** Parse a generic node. */
  parse(path: SwaggerPath, obj: any): any {
    if (obj === undefined || obj === null) {
      throw new Error(`Object is ${obj} at path: ${path.fullPath()}`);
    }
    // base case for primitive types
    if (typeof obj !== "object") {
      return obj;
    } else if (Array.isArray(obj)) {
      return this.parseArray(path, obj);
    } else if (typeof obj === "object") {
      return this.parseObject(path, obj);
    }
  }

  /** Special handling for the root of a Swagger object. */
  parseRoot(obj: any): any {
    let result: any = {};

    // Retrieve any parameterized host information before parsing
    this.parameterizedHost = obj["x-ms-parameterized-host"];
    delete obj["x-ms-parameterized-host"];
    this.host = obj["host"];
    delete obj["host"];

    for (const [key, val] of Object.entries(obj)) {
      const path = new SwaggerPath(key, PathKind.SwaggerProperty);
      switch (key) {
        case "swagger":
        case "info":
        case "host":
        case "basePath":
        case "schemes":
        case "consumes":
        case "produces":
        case "security":
        case "definitions":
        case "parameters":
        case "responses":
        case "securityDefinitions":
        case "tags":
        case "externalDocs":
          result[key] = this.parse(path, val);
          break;
        case "paths":
          result[key] = this.parsePaths(path, val);
          break;
        default:
          throw new Error(`Unhandled root key: ${key}`);
      }
    }
    return result;
  }

  /** Parse a response object. */
  #parseResponse(path: SwaggerPath, value: any): any {
    let result: any = {};
    const sortedEntries = Object.entries(value).sort();
    for (const [key, val] of sortedEntries) {
      const childPath = new SwaggerPath(key, PathKind.SwaggerProperty, path);
      if (key === "schema") {
        const expanded = this.parse(childPath, val);
        result[key] = expanded;
      } else {
        result[key] = this.parse(childPath, val);
      }
    }
    return result;
  }

  /** Parse the operation responses object. */
  #parseResponses(path: SwaggerPath, value: any): any {
    let result: any = {};
    for (const [code, data] of Object.entries(value)) {
      const childPath = new SwaggerPath(code, PathKind.DefinitionKey, path);
      result[code] = this.#parseResponse(childPath, data);
    }
    return result;
  }

  /** Parse an Operation schema object, with special handling for parameters. */
  #parseOperation(path: SwaggerPath, value: any): any {
    let result: any = {};
    const sortedEntries = Object.entries(value).sort();
    for (const [key, val] of sortedEntries) {
      const childPath = new SwaggerPath(key, PathKind.SwaggerProperty, path);
      if (key === "parameters") {
        // mix in any parameters from parameterized host
        const hostParams = this.parameterizedHost?.parameters ?? [];
        const allParams = [...(val as Array<any>), ...hostParams];

        const expanded = this.parse(childPath, allParams);
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
          }
        }
        result[key] = sorted;
      } else if (key === "responses") {
        result[key] = this.#parseResponses(childPath, val);
      } else {
        result[key] = this.parse(childPath, value[key]);
      }
    }
    return result;
  }

  /** Parse each verb/operation pair. */
  #parseVerbs(path: SwaggerPath, value: any): any {
    let result: any = {};
    const sortedVerbs = Object.entries(value).sort();
    for (const [verb, data] of sortedVerbs) {
      const childPath = new SwaggerPath(verb, PathKind.OperationKey, path);
      result[verb] = this.#parseOperation(childPath, data);
    }
    return result;
  }

  /** Pare the entire Paths object. */
  parsePaths(path: SwaggerPath, value: any): any {
    let result: any = {};
    const sortedPaths = Object.entries(value).sort();
    for (const [operationPath, pathData] of sortedPaths) {
      // normalize the path to coerce the naming convention
      const normalizedPath = this.#normalizePath(operationPath);
      const childPath = new SwaggerPath(
        normalizedPath,
        PathKind.OperationKey,
        path
      );
      result[normalizedPath] = this.#parseVerbs(childPath, pathData);
    }
    return result;
  }

  parseArray(path: SwaggerPath, value: any[]): any {
    // console.log(`Array parse: ${path.fullPath()}`);
    // visit array objects but not arrays of primitives
    if (value.length > 0 && typeof value[0] === "object") {
      const values: any[] = [];
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        const childPath = new SwaggerPath(`[${i}]`, PathKind.ArrayIndex, path);
        values.push(this.parse(childPath, item));
      }
      return values;
    } else {
      return value;
    }
  }

  parseObject(path: SwaggerPath, value: any): any {
    // console.log(`Object parse: ${path.fullPath()}`);

    // Retrieve any allOf references before parsing
    const allOf = value["allOf"];
    delete value["allOf"];
    let expAllOf: any[] = [];
    if (allOf) {
      expAllOf = this.parse(path, allOf);
    }

    if (!this.#isReference(value)) {
      const result: any = {};
      // visit each key in the object in sorted order
      const sortedEntries = Object.entries(value).sort();
      for (const [key, val] of sortedEntries) {
        let allVal = val as any;
        // combine any properties that may be added from "allOf" references
        if (typeof val === "object") {
          for (const item of expAllOf) {
            const match = (item as any)[key] ?? {};
            allVal = { ...allVal, ...match };
          }
        }
        const childPath = new SwaggerPath(key, PathKind.SwaggerProperty, path);
        result[key] = this.parse(childPath, allVal);
      }
      return result;
    } else {
      // get the value of the $ref key
      const ref = (value as any)["$ref"];
      const expanded = this.#handleReference(ref);
      return expanded;
    }
  }

  #parseReference(ref: string): ReferenceMetadata | undefined {
    const regex = /(.+\.json)?#\/(.+)\/(.+)/;
    const match = ref.match(regex);
    if (!match) {
      return undefined;
    }
    let registry: RegistryKind;
    switch (match[2]) {
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
        throw new Error(`Unknown registry: ${match[2]}`);
    }
    return {
      filePath: match[1],
      registry: registry,
      name: match[3],
    };
  }

  #isReference(value: any): boolean {
    return Object.keys(value).includes("$ref");
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

  #handleReference(ref: string): any {
    const refResult = this.#parseReference(ref);
    if (!refResult) {
      this.definitions.logUnresolvedReference(ref);
      return {
        $ref: ref,
      };
    }
    let match = this.definitions.get(refResult.name, refResult.registry);
    if (match) {
      return match;
    } else {
      // keep a reference so we can resolve on a subsequent pass
      this.definitions.logUnresolvedReference(refResult.name);
      return {
        $ref: ref,
      };
    }
  }
}
