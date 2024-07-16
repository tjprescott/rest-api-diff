import { OpenAPIV2 } from "openapi-types";
import { SwaggerParser } from "./parser.js";
import { unescape } from "querystring";

/** The registry to look up the name within. */
export enum RegistryKind {
  Definition,
  Parameter,
  Response,
  SecurityDefinition,
}

export class CollectionRegistry {
  private collection = new Map<string, any>();
  private unreferenced = new Set<string>();
  private unresolved = new Set<string>();

  constructor(data: Map<string, any>, key: string) {
    for (const [_, value] of data.entries()) {
      const subdata = (value as any)[key];
      if (subdata !== undefined) {
        for (const [name, _] of Object.entries(subdata)) {
          this.unreferenced.add(name);
        }
      }
    }
  }

  /** Add or update an item. */
  upsert(name: string, value: any) {
    this.collection.set(name, value);
  }

  /** Add an item and error if already exists. */
  insert(name: string, value: any) {
    if (this.collection.has(name)) {
      throw new Error(`Duplicate ${name}`);
    }
    this.collection.set(name, value);
  }

  /** Update an existing item and error if it doesn't exist. */
  update(name: string, value: any) {
    if (!this.collection.has(name)) {
      throw new Error(`Not found: ${name}`);
    }
    this.collection.set(name, value);
  }

  /** Retrieve an item, if found. */
  get(name: string): any | undefined {
    return this.collection.get(name);
  }

  /** Mark an item as an unresolved reference. */
  logUnresolved(name: string) {
    this.unresolved.add(name);
  }

  /** Mark an item as referenced. */
  countReference(name: string) {
    if (this.unreferenced.has(name)) {
      this.unreferenced.delete(name);
    }
  }

  /** Resolve list of unreferenced objects. */
  getUnreferenced(): string[] {
    return Array.from(this.unreferenced);
  }

  /** Retrieve list of unresolved items. */
  getUnresolved(): string[] {
    return Array.from(this.unresolved);
  }
}

/** A class which contains all defintions which can be referenced in a spec. */
export class DefinitionRegistry {
  private parser: SwaggerParser;
  public data: {
    definitions: CollectionRegistry;
    parameters: CollectionRegistry;
    responses: CollectionRegistry;
    securityDefinitions: CollectionRegistry;
  };
  private swaggerMap: Map<string, OpenAPIV2.Document>;

  constructor(map: Map<string, OpenAPIV2.Document>, parser: SwaggerParser) {
    this.parser = parser;
    this.swaggerMap = map;
    this.data = {
      definitions: new CollectionRegistry(map, "definitions"),
      parameters: new CollectionRegistry(map, "parameters"),
      responses: new CollectionRegistry(map, "responses"),
      securityDefinitions: new CollectionRegistry(map, "securityDefinitions"),
    };
  }

  initialize() {
    this.#gatherReferences(this.swaggerMap);
    this.#revisitReferences(this.swaggerMap);
  }

  #gatherReferences(map: Map<string, any>) {
    for (const [name, value] of Object.entries(this.data.definitions)) {
      const expanded = this.parser.parse(value);
      this.data.definitions.insert(name, expanded);
    }
    for (const [name, value] of Object.entries(this.data.parameters)) {
      const expanded = this.parser.parse(value);
      this.data.parameters.insert(name, expanded);
    }
    for (const [name, value] of Object.entries(this.data.responses)) {
      const expanded = this.parser.parse(value);
      this.data.responses.insert(name, expanded);
    }
    for (const [name, value] of Object.entries(this.data.securityDefinitions)) {
      const expanded = this.parser.parse(value);
      this.data.securityDefinitions.insert(name, expanded);
    }
  }

  #revisitReferences(map: Map<string, any>) {
    // Second path through should clear up any unresolved forward references.
    // It will NOT solve any circular references!
    for (const [name, value] of Object.entries(this.data.definitions)) {
      const expanded = this.parser.parse(value);
      this.data.definitions.update(name, expanded);
    }
    for (const [name, value] of Object.entries(this.data.parameters)) {
      const expanded = this.parser.parse(value);
      this.data.parameters.update(name, expanded);
    }
    for (const [name, value] of Object.entries(this.data.responses)) {
      const expanded = this.parser.parse(value);
      this.data.responses.update(name, expanded);
    }
    for (const [name, value] of Object.entries(this.data.securityDefinitions)) {
      const expanded = this.parser.parse(value);
      this.data.securityDefinitions.update(name, expanded);
    }
  }

  /** Search a registry for a specific key. */
  get(name: string, registry?: RegistryKind): any | undefined {
    if (registry === undefined) {
      return undefined;
    }
    switch (registry) {
      case RegistryKind.Definition:
        return this.data.definitions.get(name);
      case RegistryKind.Parameter:
        return this.data.parameters.get(name);
      case RegistryKind.Response:
        return this.data.responses.get(name);
      case RegistryKind.SecurityDefinition:
        return this.data.securityDefinitions.get(name);
      default:
        return (
          this.data.definitions.get(name) ??
          this.data.parameters.get(name) ??
          this.data.responses.get(name) ??
          this.data.securityDefinitions.get(name)
        );
    }
  }

  /** Logs a reference to an item. */
  countReference(name: string, registry?: RegistryKind) {
    if (registry === undefined) {
      return;
    }
    switch (registry) {
      case RegistryKind.Definition:
        this.data.definitions.countReference(name);
        break;
      case RegistryKind.Parameter:
        this.data.parameters.countReference(name);
        break;
      case RegistryKind.Response:
        this.data.responses.countReference(name);
        break;
      case RegistryKind.SecurityDefinition:
        this.data.securityDefinitions.countReference(name);
        break;
    }
  }

  /** Logs an unresolved reference. */
  logUnresolvedReference(ref: string, registry?: RegistryKind) {
    if (registry === undefined) {
      return;
    }
    switch (registry) {
      case RegistryKind.Definition:
        this.data.definitions.logUnresolved(ref);
        break;
      case RegistryKind.Parameter:
        this.data.parameters.logUnresolved(ref);
        break;
      case RegistryKind.Response:
        this.data.responses.logUnresolved(ref);
        break;
      case RegistryKind.SecurityDefinition:
        this.data.securityDefinitions.logUnresolved(ref);
        break;
    }
  }

  /** Returns unresolved references. */
  getUnresolved(): Map<RegistryKind, string[]> {
    const map = new Map<RegistryKind, string[]>();
    map.set(RegistryKind.Definition, this.data.definitions.getUnresolved());
    map.set(RegistryKind.Parameter, this.data.parameters.getUnresolved());
    map.set(RegistryKind.Response, this.data.responses.getUnresolved());
    map.set(
      RegistryKind.SecurityDefinition,
      this.data.securityDefinitions.getUnresolved()
    );
    return map;
  }

  /** Returns unreferenced items. */
  getUnreferenced(): Map<RegistryKind, string[]> {
    const map = new Map<RegistryKind, string[]>();
    map.set(RegistryKind.Definition, this.data.definitions.getUnreferenced());
    map.set(RegistryKind.Parameter, this.data.parameters.getUnreferenced());
    map.set(RegistryKind.Response, this.data.responses.getUnreferenced());
    map.set(
      RegistryKind.SecurityDefinition,
      this.data.securityDefinitions.getUnreferenced()
    );
    return map;
  }
}
