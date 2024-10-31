import { OpenAPIV2 } from "openapi-types";
import { isReference, loadPaths, parseReference } from "./util.js";

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
  private externalReferences = new Set<string>();
  private referenceStack: string[] = [];
  private referenceMap = new Map<string, Set<string>>();

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
    this.#loadExternalReferences();
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
      if (refResult.filePath) {
        this.externalReferences.add(refResult.filePath);
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
      this.#expandAllOf(item);
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

  #updateReferenceMap(items?: string[]) {
    if (!this.referenceStack.length) {
      return;
    }
    const key = this.referenceStack[0];
    if (!this.referenceMap.has(key)) {
      this.referenceMap.set(key, new Set());
    }
    const last = this.referenceStack[this.referenceStack.length - 1];
    if (key !== last) {
      this.referenceMap.get(key)!.add(last);
    }
  }

  #expand(item: any, referenceName?: string): any {
    if (referenceName !== undefined) {
      if (this.referenceStack.includes(referenceName)) {
        return item;
      }
      this.referenceStack.push(referenceName);
      this.#updateReferenceMap();
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

  #expandSetWithItems(set: Set<string>, values: Set<string> | undefined) {
    if (values === undefined) {
      return;
    }
    for (const value of values) {
      if (set.has(value)) {
        continue;
      }
      set.add(value);
      const references = this.referenceMap.get(value);
      this.#expandSetWithItems(set, references);
      const derived = this.polymorphicMap.get(value);
      this.#expandSetWithItems(set, derived);
    }
  }

  #expandReferenceMap() {
    for (const [key, values] of this.referenceMap.entries()) {
      const expanded = new Set<string>();
      this.#expandSetWithItems(expanded, values);
      const derivedClasses = this.polymorphicMap.get(key);
      this.#expandSetWithItems(expanded, derivedClasses);
      this.referenceMap.set(key, expanded);
    }
  }

  #expandReferencesForCollection(collection: CollectionRegistry) {
    this.referenceStack = [];
    for (const [key, value] of collection.data.entries()) {
      let expanded = this.#expand(value, key);
      collection.data.set(key, expanded);
    }
    // replace $derivedClasses with $anyOf that contains the expansions of the derived classes
    for (const [_, value] of collection.data.entries()) {
      const derivedClasses = value["$derivedClasses"];
      delete value["$derivedClasses"];
      if (!derivedClasses) {
        continue;
      }
      value["$anyOf"] = [];
      for (const derived of derivedClasses) {
        const derivedClass = this.get(derived, collection.kind);
        if (derivedClass === undefined) {
          this.logUnresolvedReference(derived);
          continue;
        }
        value["$anyOf"].push(derivedClass);
      }
      // a union of one thing is not important
      if (value["$anyOf"].length < 2) {
        delete value["$anyOf"];
      }
    }
    this.#expandReferenceMap();
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
      const refMeta = parseReference(ref);
      if (refMeta?.filePath) {
        this.externalReferences.add(refMeta.filePath);
      }
      const set = this.polymorphicMap.get(ref);
      if (set === undefined) {
        this.polymorphicMap.set(ref, new Set([key]));
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
    for (const [ref, set] of this.polymorphicMap.entries()) {
      const baseClass = this.get(ref);
      if (baseClass === undefined) {
        this.logUnresolvedReference(ref);
        continue;
      }
      // ensure all base classes have the discriminator property
      const discriminator = baseClass.discriminator;
      if (discriminator === undefined) {
        console.warn(`Base class ${ref} has no discriminator.`);
      }
      baseClass["$derivedClasses"] = Array.from(set);
    }
  }

  async #loadExternalReferences() {
    const result = await loadPaths([...this.externalReferences]);
    let test = "best";
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
  countReference(name: string, registry: RegistryKind) {
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

  /** Returns the total number of unreferenced definitions. */
  getUnreferencedTotal(): number {
    const map = this.getUnreferenced();
    // ignore SecurityDefinitions because we don't use them in Azure so
    // it doesn't matter if they are unreferenced
    map.delete(RegistryKind.SecurityDefinition);
    let total = 0;
    for (const value of map.values()) {
      total += value.length;
    }
    return total;
  }

  /** Returns a list of references from the definition-gathering phase. */
  getReferences(key: string): string[] {
    return Array.from(this.referenceMap.get(key) ?? []);
  }
}
