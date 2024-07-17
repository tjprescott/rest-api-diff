import { OpenAPIV2 } from "openapi-types";

/** The registry to look up the name within. */
export enum RegistryKind {
  Definition,
  Parameter,
  Response,
  SecurityDefinition,
}

export class CollectionRegistry {
  public data = new Map<string, any>();
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
  add(name: string, value: any) {
    this.data.set(name, value);
  }

  /** Retrieve an item, if found. */
  get(name: string): any | undefined {
    return this.data.get(name);
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
  private data: {
    definitions: CollectionRegistry;
    parameters: CollectionRegistry;
    responses: CollectionRegistry;
    securityDefinitions: CollectionRegistry;
  };
  private polymorphicMap = new Map<string, Set<string>>();
  private swaggerMap: Map<string, OpenAPIV2.Document>;

  constructor(map: Map<string, OpenAPIV2.Document>) {
    this.swaggerMap = map;
    this.data = {
      definitions: new CollectionRegistry(map, "definitions"),
      parameters: new CollectionRegistry(map, "parameters"),
      responses: new CollectionRegistry(map, "responses"),
      securityDefinitions: new CollectionRegistry(map, "securityDefinitions"),
    };
    this.#gatherDefinitions(this.swaggerMap);
    this.#expandReferences();
  }

  #expandObject(item: any) {
    if (this.#isReference(item)) {
      const ref = item["$ref"];
      let test = "best";
      // const expanded = this.#handleReference(ref, options?.registry);
      // return expanded;
    } else {
      for (const [propName, propValue] of Object.entries(item)) {
        this.#expand(propValue);
      }
    }
  }

  // // Retrieve any allOf references before parsing
  // if (!this.#isReference(value)) {
  //   // let expAllOf: any[] = [];
  //   // let derivedClasses: string[] = [];
  //   // if (allOf) {
  //   //   if (
  //   //     allOf.length === 1 &&
  //   //     this.#isReference(allOf[0]) &&
  //   //   ) {
  //   //     const refResult = this.#parseReference((allOf[0] as any)["$ref"]);
  //   //     if (refResult) {
  //   //       const parent = this.defRegistry.get(
  //   //         refResult.name,
  //   //         refResult.registry
  //   //       );
  //   //       if (parent) {
  //   //         const derivedClasses = parent["$derivedClasses"] ?? [];
  //   //         derivedClasses.push(options?.objectName!);
  //   //         parent["$derivedClasses"] = derivedClasses;
  //   //       }
  //   //     }
  //   //   }
  //   //   // TODO: Expand out all of the the $derivedClass references
  //   //   expAllOf = this.#parseAllOf(allOf, derivedClasses);
  //   // }

  //   const result: any = {};
  //   // visit each key in the object in sorted order
  //   const sortedEntries = Object.entries(value).sort();
  //   for (const [key, val] of sortedEntries) {
  //     let allVal = val as any;
  //     // combine any properties that may be added from "allOf" references
  //     if (typeof val === "object") {
  //       // for (const item of expAllOf) {
  //       //   const match = (item as any)[key] ?? {};
  //       //   allVal = { ...allVal, ...match };
  //       // }
  //     }
  //     result[key] = this.parse(allVal);
  //   }
  //   return result;
  // } else {
  //   // get the value of the $ref key
  //   const ref = (value as any)["$ref"];
  //   const expanded = this.#handleReference(ref, options?.registry);
  //   return expanded;
  // }

  #expand(item: any) {
    if (typeof item !== "object") {
      return;
    } else if (Array.isArray(item)) {
      // TODO: visit elements of the array
      let test = "best";
    } else if (typeof item === "object") {
      this.#expandObject(item);
    }
  }

  #expandReferencesForItem(key: string, value: any) {
    for (const [propName, propValue] of Object.entries(value)) {
      this.#expand(propValue);
    }
    const allOf = value.allOf;
    const derivedClasses = value["$derivedClasses"];
    delete value["allOf"];
    delete value["$derivedClasses"];
    let test = "best";
  }

  #expandReferences() {
    for (const [key, value] of this.data.definitions.data.entries()) {
      this.#expandReferencesForItem(key, value);
    }
    for (const [key, value] of this.data.parameters.data.entries()) {
      this.#expandReferencesForItem(key, value);
    }
    for (const [key, value] of this.data.responses.data.entries()) {
      this.#expandReferencesForItem(key, value);
    }
    for (const [key, value] of this.data.securityDefinitions.data.entries()) {
      this.#expandReferencesForItem(key, value);
    }
  }

  #isReference(value: any): boolean {
    return Object.keys(value).includes("$ref");
  }

  #processAllOf(allOf: any, key: string) {
    if (
      Array.isArray(allOf) &&
      allOf.length === 1 &&
      this.#isReference(allOf[0])
    ) {
      // allOf is targeting a base class
      const ref = allOf[0].$ref;
      const refParts = ref.split("/");
      const refName = refParts[refParts.length - 1];
      const set = this.polymorphicMap.get(refName);
      if (set === undefined) {
        this.polymorphicMap.set(refName, new Set([key]));
      } else {
        set.add(key);
      }
    } else if (allOf) {
      // allOf is listing properties to mix-in
      throw new Error(`Unsupported allOf for ${key}. Please contact support.`);
    }
  }

  #visitDefinition(key: string, data: any) {
    const allOf = data.allOf;
    this.#processAllOf(allOf, key);
    this.data.definitions.add(key, data);
  }

  #visitParameter(key: string, data: any) {
    const inProp = data.in;
    if (inProp === "body") {
      const schema = data.schema;
      if (schema !== undefined) {
        const allOf = schema.allOf;
        this.#processAllOf(allOf, key);
      }
    }
  }

  #visitResponse(key: string, data: any) {
    const schema = data.schema;
    if (schema !== undefined) {
      const allOf = schema.allOf;
      this.#processAllOf(allOf, key);
    }
    this.data.responses.add(key, data);
  }

  #gatherDefinitions(map: Map<string, any>) {
    for (const [_, fileData] of map.entries()) {
      for (const [name, data] of Object.entries(fileData.definitions ?? {})) {
        this.#visitDefinition(name, data);
      }

      for (const [name, data] of Object.entries(fileData.parameters ?? {})) {
        this.#visitParameter(name, data);
      }

      for (const [name, data] of Object.entries(fileData.responses ?? {})) {
        this.#visitResponse(name, data);
      }

      for (const [name, data] of Object.entries(
        fileData.securityDefinitions ?? {}
      )) {
        this.data.securityDefinitions.add(name, data);
      }
    }
    // ensure each base class has a list of derived classes for use
    // when interpretting allOf.
    for (const [name, set] of this.polymorphicMap.entries()) {
      const baseClass = this.get(name);
      if (baseClass === undefined) {
        throw new Error(`Base class ${name} not found.`);
      }
      baseClass["$derivedClasses"] = Array.from(set);
    }
  }

  /** Search a registry for a specific key. */
  get(name: string, registry?: RegistryKind): any | undefined {
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
