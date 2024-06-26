import { DefinitionRegistry, RegistryKind } from "./definitions.js";
import { ParameterizedHost } from "./extensions/parameterized-host.js";
import { PathKind, SwaggerPath } from "./paths.js";

/** Options to set on the Swagger parsing. */
export interface SwaggerParserOptions {
  applyFilteringRules?: boolean;
}

export interface ReferenceMetadata {
  name: string;
  registry: RegistryKind;
  filePath?: string;
}

/** A class for parsing Swagger files into an expanded, normalized form. */
export class SwaggerParser {
  private definitions: DefinitionRegistry;
  private options?: SwaggerParserOptions;
  private parameterizedHost?: ParameterizedHost;
  private result = {};

  constructor(map: Map<string, any>, options?: SwaggerParserOptions) {
    this.options = options;
    this.definitions = new DefinitionRegistry(map, this);
    this.definitions.initialize();
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
    if (!obj) {
      throw new Error(`Object is null at path: ${path.fullPath()}`);
    }
    let result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const childPath = new SwaggerPath(key, PathKind.SwaggerProperty, path);
      console.log(`Generic parse: ${childPath.fullPath()}`);
      if (Array.isArray(value)) {
        result[key] = this.parseArray(path, value);
      } else if (typeof value === "object") {
        const val = this.parseObject(path, value);
        if (!val) {
          throw new Error(`Visit returned null.`);
        }
        result[key] = val;
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /** Special handling for the root of a Swagger object. */
  parseRoot(obj: any): any {
    let result: any = {};

    // Retrieve any parameterized host information before parsing
    this.parameterizedHost = obj["x-ms-parameterized-host"];
    delete obj["x-ms-parameterized-host"];

    for (const [key, val] of Object.entries(obj)) {
      const path = new SwaggerPath(key, PathKind.SwaggerProperty);
      if (this.#filterChildPath(path)) {
        continue;
      }
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

  parsePaths(path: SwaggerPath, value: any): any {
    let result: any = {};
    for (const [operationPath, data] of Object.entries(value)) {
      // normalize the path to coerce the naming convention
      const normalizedPath = this.#normalizePath(operationPath);
      const childPath = new SwaggerPath(
        normalizedPath,
        PathKind.OperationKey,
        path
      );
      result[normalizedPath] = this.parseObject(childPath, data);
    }
    return result;
  }

  parseArray(path: SwaggerPath, value: any[]): any {
    console.log(`Array parse: ${path.fullPath()}`);
    // visit array objects but not arrays of primitives
    if (value.length > 0 && typeof value[0] === "object") {
      const values: any[] = [];
      value.forEach((v, i) => {
        const childPath = new SwaggerPath(`[${i}]`, PathKind.ArrayIndex, path);
        values.push(this.parseObject(childPath, v));
      });
    } else {
      return value;
    }
  }

  parseObject(path: SwaggerPath, value: any): any {
    console.log(`Object parse: ${path.fullPath()}`);
    if (!this.#isReference(value)) {
      return this.parse(path, value);
    } else {
      // get the value of the $ref key
      const ref = (value as any)["$ref"];
      return this.#handleReference(ref);
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

  #normalizePath(path: string): string {
    let pathComponents = path.split("/");
    for (const comp of pathComponents) {
      // if comp is surrounded by curly braces, normalize the name
      const match = comp.match(/{(.+)}/);
      if (match) {
        // delete all non-alphanumeric characters and force to lowercase
        const newName = match[1].replace(/\W/g, "").toLowerCase();
        pathComponents[pathComponents.indexOf(comp)] = `{${newName}}`;
      }
    }
    return pathComponents.join("/");
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
      return match.value;
    } else {
      // keep a reference so we can resolve on a subsequent pass
      this.definitions.logUnresolvedReference(refResult.name);
      return {
        $ref: ref,
      };
    }
  }

  /** Applies logic to omit keys being expanded in the Swagger. */
  #filterChildPath(path: SwaggerPath): boolean {
    if (!this.options?.applyFilteringRules) return false;
    if (path.kind !== PathKind.SwaggerProperty) return false;
    const fullPath = path.fullPath();
    // These are documentation-only properties that don't affect the shape of the service.
    if (path.name === "description") return true;
    if (path.name === "summary") return true;

    if (fullPath === "externalDocs") return true;
    if (fullPath === "tags") return true;
    if (fullPath === "definitions") return true;
    if (fullPath === "parameters") return true;
    if (fullPath === "responses") return true;
    if (fullPath === "securityDefinitions") return true;
    return false;
  }
}
