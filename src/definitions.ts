import { OpenAPIV2 } from "openapi-types";
import { isReference, parseReference } from "./util.js";

/** The registry to look up the name within. */
export enum RegistryKind {
  Definition,
  Parameter,
  Response,
  SecurityDefinition,
}

export class CollectionRegistry {
  public kind: RegistryKind;
  public data = new Map<string, any>();
  private unreferenced = new Set<string>();

  constructor(data: Map<string, any>, key: string, kind: RegistryKind) {
    this.kind = kind;
    for (const [_, value] of data.entries()) {
      const subdata = (value as any)[key];
      if (subdata !== undefined) {
        for (const [name, _] of Object.entries(subdata).toSorted()) {
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

  /** Mark an item as referenced. */
  countReference(name: string) {
    this.unreferenced.delete(name);
    let test = "best";
  }

  /** Resolve list of unreferenced objects. */
  getUnreferenced(): string[] {
    return Array.from(this.unreferenced);
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
  private unresolvedReferences = new Set<string>();
  private referenceStack: string[] = [];

  constructor(map: Map<string, OpenAPIV2.Document>) {
    this.swaggerMap = map;
    this.data = {
      definitions: new CollectionRegistry(
        map,
        "definitions",
        RegistryKind.Definition
      ),
      parameters: new CollectionRegistry(
        map,
        "parameters",
        RegistryKind.Parameter
      ),
      responses: new CollectionRegistry(
        map,
        "responses",
        RegistryKind.Response
      ),
      securityDefinitions: new CollectionRegistry(
        map,
        "securityDefinitions",
        RegistryKind.SecurityDefinition
      ),
    };
    this.#gatherDefinitions(this.swaggerMap);
    this.#expandReferences();
  }

  #expandObject(item: any): any {
    if (isReference(item)) {
      const itemCopy = JSON.parse(JSON.stringify(item));
      const ref = item["$ref"];
      delete itemCopy["$ref"];

      const refResult = parseReference(ref);
      if (!refResult) {
        return item;
      }
      const kind = refResult.registry;
      let match = this.get(refResult.name, kind);
      if (match) {
        if (this.referenceStack.includes(refResult.name)) {
          return {
            $circular: ref,
          };
        } else {
          let matchCopy = JSON.parse(JSON.stringify(match));
          // spread in any overriding properties
          for (const [key, value] of Object.entries(itemCopy).toSorted()) {
            matchCopy[key] = value;
          }
          return this.#expand(matchCopy, refResult.name);
        }
      } else {
        return item;
      }
    } else {
      const expanded: any = {};
      for (const [propName, propValue] of Object.entries(item).toSorted()) {
        expanded[propName] = this.#expand(propValue);
      }
      return expanded;
    }
  }

  #expandArray(values: any[]): any[] {
    // visit array objects but not arrays of primitives
    const expanded: any[] = [];
    for (const val of values ?? []) {
      const expVal = this.#expand(val);
      expanded.push(expVal);
    }
    return expanded;
  }

  #expandAllOf(base: any): any {
    const allOf = base.allOf;
    delete base.allOf;
    if (allOf === undefined) {
      return base;
    }
    const expAllOf = this.#expandArray(allOf);
    let allKeys = [...Object.keys(base)];
    for (const item of expAllOf) {
      allKeys = allKeys.concat(Object.keys(item));
    }
    // eliminate duplicates
    allKeys = Array.from(new Set(allKeys));
    for (const key of allKeys) {
      const baseVal = base[key];
      for (const item of expAllOf) {
        const itemVal = item[key];
        switch (key) {
          case "required":
            base[key] = (baseVal ?? []).concat(itemVal ?? []);
            break;
          case "properties":
            base[key] = { ...(baseVal ?? {}), ...(itemVal ?? {}) };
            break;
          default:
            break;
        }
      }
    }
    return base;
  }

  #expand(item: any, referenceName?: string): any {
    if (referenceName !== undefined) {
      if (this.referenceStack.includes(referenceName)) {
        return item;
      }
      this.referenceStack.push(referenceName);
    }
    let expanded: any;
    if (typeof item !== "object") {
      expanded = item;
    } else if (Array.isArray(item)) {
      expanded = this.#expandArray(item);
    } else if (typeof item === "object") {
      expanded = this.#expandObject(item);
    }
    if (referenceName !== undefined) {
      this.referenceStack.pop();
    }
    return expanded;
  }

  #expandReferencesForCollection(collection: CollectionRegistry) {
    this.referenceStack = [];
    for (const [key, value] of collection.data.entries()) {
      for (const [propName, propValue] of Object.entries(value).toSorted()) {
        value[propName] = this.#expand(propValue);
      }
      const expVal = this.#expandAllOf(value);
      collection.data.set(key, expVal);
    }
    // replace $derivedClasses with $anyOf that contains the expansions of the derived classes
    for (const [_, value] of collection.data.entries()) {
      const derivedClasses = value["$derivedClasses"];
      if (!derivedClasses) {
        continue;
      }
      value["$anyOf"] = [];
      for (const derived of derivedClasses) {
        const derivedClass = this.get(derived, collection.kind);
        if (derivedClass === undefined) {
          throw new Error(`Derived class ${derived} not found.`);
        }
        value["$anyOf"].push(derivedClass);
      }
    }
  }

  #expandReferences() {
    this.#expandReferencesForCollection(this.data.definitions);
    this.#expandReferencesForCollection(this.data.parameters);
    this.#expandReferencesForCollection(this.data.responses);
    this.#expandReferencesForCollection(this.data.securityDefinitions);
  }

  #processAllOf(allOf: any, key: string) {
    if (Array.isArray(allOf) && allOf.length === 1 && isReference(allOf[0])) {
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

  #visitSchema(data: any, name: string) {
    if (data === undefined) {
      return;
    }
    const allOf = data.allOf;
    this.#processAllOf(allOf, name);
  }

  #visitParameter(key: string, data: any) {
    this.#visitSchema(data.schema, key);
    this.data.parameters.add(key, data);
  }

  #visitResponse(key: string, data: any) {
    this.#visitSchema(data.schema, key);
    this.data.responses.add(key, data);
  }

  #gatherDefinitions(map: Map<string, any>) {
    for (const [_, fileData] of map.entries()) {
      for (const [name, data] of Object.entries(
        fileData.definitions ?? {}
      ).toSorted()) {
        this.#visitDefinition(name, data);
      }

      for (const [name, data] of Object.entries(
        fileData.parameters ?? {}
      ).toSorted()) {
        this.#visitParameter(name, data);
      }

      for (const [name, data] of Object.entries(
        fileData.responses ?? {}
      ).toSorted()) {
        this.#visitResponse(name, data);
      }

      for (const [name, data] of Object.entries(
        fileData.securityDefinitions ?? {}
      ).toSorted()) {
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
      // ensure all base classes have the discriminator property
      const discriminator = baseClass.discriminator;
      if (discriminator === undefined) {
        console.warn(`Base class ${name} has no discriminator.`);
      }
      baseClass["$derivedClasses"] = Array.from(set);
    }
  }

  /** Get a collection. */
  getCollection(registry: RegistryKind): any {
    switch (registry) {
      case RegistryKind.Definition:
        return Object.fromEntries(this.data.definitions.data);
      case RegistryKind.Parameter:
        return Object.fromEntries(this.data.parameters.data);
      case RegistryKind.Response:
        return Object.fromEntries(this.data.responses.data);
      case RegistryKind.SecurityDefinition:
        return Object.fromEntries(this.data.securityDefinitions.data);
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
  logUnresolvedReference(ref: any) {
    if (typeof ref === "string") {
      this.unresolvedReferences.add(ref);
      return;
    } else if (typeof ref === "object") {
      if (isReference(ref)) {
        const refName = ref["$ref"];
        this.unresolvedReferences.add(refName);
      }
    } else {
      throw new Error("Unsupported reference type.");
    }
  }

  /** Returns unresolved references. */
  getUnresolvedReferences(): string[] {
    return Array.from(this.unresolvedReferences);
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
    for (const [key, value] of map.entries()) {
      if (value.length === 0) {
        map.delete(key);
      }
    }
    return map;
  }
}
