import { OpenAPIV2 } from "openapi-types";
import {
  isReference,
  getResolvedPath,
  parseReference,
  ReferenceMetadata,
  toSorted,
  getRegistryName,
} from "./util.js";
import path from "path";

/** The registry to look up the name within. */
export enum RegistryKind {
  Definition,
  Parameter,
  Response,
  SecurityDefinition,
}

/** A registry containing a collection of related definitions. Used by DefinitionRegistry. */
class CollectionRegistry {
  public kind: RegistryKind;
  /** Top-level key is path, inner key is name */
  public data = new Map<string, Map<string, any>>();
  private unreferenced = new Set<string>();

  constructor(data: Map<string, any>, key: string, kind: RegistryKind) {
    this.kind = kind;
    // set all items as unreferenced initially
    for (const [filepath, value] of data.entries()) {
      const subdata = (value as any)[key];
      if (subdata !== undefined) {
        for (const [name, _] of toSorted(Object.entries(subdata))) {
          const resolvedPath = getResolvedPath(filepath).replace(/\\/g, "/");
          const pathKey = `${resolvedPath}#/${getRegistryName(this.kind)}/${name}`;
          // we don't care about unreferenced common-types
          if (!resolvedPath.includes("common-types")) {
            this.unreferenced.add(pathKey);
          }
        }
      }
    }
  }

  /** Add or update an item. */
  add(itemPath: string, name: string, value: any) {
    const resolvedPath = getResolvedPath(itemPath);
    if (!this.data.has(resolvedPath)) {
      this.data.set(resolvedPath, new Map<string, any>());
    }
    const innerMap = this.data.get(resolvedPath)!;
    innerMap.set(name, value);
    this.data.set(resolvedPath, innerMap);
  }

  /** Retrieve an item, if found. */
  get(path: string, name: string): any | undefined {
    const innerMap = this.data.get(path);
    return innerMap?.get(name);
  }

  /** Mark an item as referenced. */
  countReference(path: string, name: string, kind: RegistryKind) {
    // convert backslashes to forward slashes
    path = path.replace(/\\/g, "/");
    const pathKey = `${path}#/${getRegistryName(this.kind)}/${name}`;
    this.unreferenced.delete(pathKey);
  }

  /** Resolve list of unreferenced objects. */
  getUnreferenced(): string[] {
    return Array.from(this.unreferenced);
  }
}

/** A class which contains all definitions which can be referenced in a spec. */
export class DefinitionRegistry {
  private data: {
    definitions: CollectionRegistry;
    parameters: CollectionRegistry;
    responses: CollectionRegistry;
    securityDefinitions: CollectionRegistry;
  };
  /** The key is the parent class and the values are the set of child classes that derive from the parent. */
  private polymorphicMap = new Map<string, Set<string>>();
  private unresolvedReferences = new Set<string>();
  private providedPaths = new Set<string>();
  private referenceStack: string[] = [];
  private referenceMap = new Map<string, Set<string>>();
  private currentPath: string | undefined;
  private args: any;

  constructor(map: Map<string, OpenAPIV2.Document>, args: any) {
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
    for (const key of map.keys()) {
      this.providedPaths.add(path.normalize(key));
    }
    this.currentPath;
    this.#gatherDefinitions(map);
    this.args = args;
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
      // FIXME: Need to proprogate suppressions here too
      let match = this.get(refResult);
      if (match) {
        if (this.referenceStack.includes(refResult.name)) {
          return {
            $circular: refResult.name,
          };
        } else {
          let matchCopy = JSON.parse(JSON.stringify(match));
          // spread in any overriding properties
          for (const [key, value] of toSorted(Object.entries(itemCopy))) {
            matchCopy[key] = value;
          }
          this.client?.suppressions?.propagateSuppression(
            refResult,
            this.currentPath
          );
          return this.#expand(matchCopy, refResult.name);
        }
      } else {
        // ensure that the expandedRef is stored because the parser doesn't
        // have the information to resolve relative paths.
        item.$ref = refResult.expandedRef;
        return item;
      }
    } else {
      const expanded: any = {};
      this.#expandDerivedClasses(item);
      this.#expandAllOf(item);
      for (const [propName, propValue] of toSorted(Object.entries(item))) {
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

  #expandDerivedClasses(base: any): any {
    const derivedClasses = base.$derivedClasses;
    delete base.$derivedClasses;
    if (!derivedClasses) {
      return base;
    }
    const anyOf = [];
    for (const derived of derivedClasses) {
      const refResult = parseReference(derived);
      if (!refResult) {
        throw new Error(`Could not parse reference: ${derived}`);
      }
      const derivedClass = this.get(refResult);
      if (derivedClass === undefined) {
        throw new Error(`Could not resolve reference: ${derived}`);
      }
      anyOf.push(derivedClass);
    }
    base.$anyOf = anyOf;
    return base;
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

  #expand(item: any, referenceName?: string, filePath?: string): any {
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
    for (const [filepath, values] of collection.data.entries()) {
      this.currentPath = filepath;
      for (const [key, value] of values.entries()) {
        let expanded = this.#expand(value, key, filepath);
        collection.data.get(filepath)!.set(key, expanded);
      }
    }
    // replace $derivedClasses with $anyOf that contains the expansions of the derived classes
    for (const [_, values] of collection.data.entries()) {
      for (const [_, value] of values) {
        this.#expandDerivedClasses(value);
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

  /**
   * Checks the allOf field for a definition to do a few things:
   * 1. If the allOf value is in an external file, add it to the list of external references so they can be loaded later.
   * 2. Ensure the allOf $ref value is a full path rather than a relative or partial path.
   * 3. Add the reference to the polymorphic map so that derived classes can be found later.
   * This method will mutate the allOf data sent into it.
   * @param allOf The allOf data to process
   * @param key The name of the object being processed
   * @param filePath The current filePath of the object being processed
   */
  #processAllOf(allOf: any, key: string, filePath: string) {
    if (Array.isArray(allOf) && allOf.length === 1 && isReference(allOf[0])) {
      // allOf is targeting a base class
      const ref = allOf[0].$ref;
      const refResult = parseReference(ref);
      if (!refResult) {
        throw new Error(`Could not parse reference: ${ref}`);
      }
      allOf[0].$ref = refResult.expandedRef;
      const set = this.polymorphicMap.get(refResult.expandedRef);
      let pathKey = `${filePath}#/${this.getRegistryName(refResult.registry)}/${key}`;
      pathKey = pathKey.replace(/\\/g, "/");
      if (set === undefined) {
        this.polymorphicMap.set(refResult.expandedRef, new Set([pathKey]));
      } else {
        set.add(pathKey);
      }
    } else if (allOf) {
      // allOf is listing properties to mix-in
      throw new Error(
        `Please contact support. Unsupported allOf scenario: ${allOf}`
      );
    }
  }

  #visitDefinition(filePath: string, key: string, data: any) {
    const allOf = data.allOf;
    this.#processAllOf(allOf, key, filePath);
    this.data.definitions.add(filePath, key, data);
  }

  #visitSchema(path: string, data: any) {
    if (data === undefined) {
      return;
    }
    const allOf = data.allOf;
    this.#processAllOf(allOf, data.name, path);
  }

  #visitParameter(path: string, key: string, data: any) {
    this.#visitSchema(path, data.schema);
    this.data.parameters.add(path, key, data);
  }

  #visitResponse(path: string, key: string, data: any) {
    this.#visitSchema(path, data.schema);
    this.data.responses.add(path, key, data);
  }

  #gatherDefinitions(map: Map<string, any>) {
    for (const [path, fileData] of map.entries()) {
      for (const [name, data] of toSorted(
        Object.entries(fileData.definitions ?? {})
      )) {
        this.#visitDefinition(path, name, data);
      }

      for (const [name, data] of toSorted(
        Object.entries(fileData.parameters ?? {})
      )) {
        this.#visitParameter(path, name, data);
      }

      for (const [name, data] of toSorted(
        Object.entries(fileData.responses ?? {})
      )) {
        this.#visitResponse(path, name, data);
      }

      for (const [name, data] of toSorted(
        Object.entries(fileData.securityDefinitions ?? {})
      )) {
        this.data.securityDefinitions.add(path, name, data);
      }
    }
    // ensure each base class has a list of derived classes for use
    // when interpretting allOf.
    for (const [ref, set] of this.polymorphicMap.entries()) {
      const refResult = parseReference(ref);
      if (!refResult) {
        throw new Error(`Could not parse reference: ${ref}`);
      }
      const baseClass = this.get(refResult);
      if (baseClass === undefined) {
        this.logUnresolvedReference(ref);
        continue;
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

  getRegistryName(registry: RegistryKind): string {
    switch (registry) {
      case RegistryKind.Definition:
        return "definitions";
      case RegistryKind.Parameter:
        return "parameters";
      case RegistryKind.Response:
        return "responses";
      case RegistryKind.SecurityDefinition:
        return "securityDefinitions";
    }
  }

  /** Get a flattened collection. */
  getFlattenedCollection(registry: RegistryKind): any {
    const collection = this.getCollection(registry);
    const flattened = new Map<string, any>();
    for (const [path, values] of Object.entries(collection)) {
      const normPath = path.replace(/\\/g, "/");
      for (const [key, value] of (values as Map<string, object>).entries()) {
        const flatPath = `${normPath}#/${this.getRegistryName(registry)}/${key}`;
        flattened.set(flatPath, value);
      }
    }
    const sorted = new Map(
      [...flattened.entries()].sort((a: any, b: any) => {
        if (a.name < b.name) {
          return -1;
        } else if (a.name > b.name) {
          return 1;
        } else {
          return 0;
        }
      })
    );
    return Object.fromEntries(sorted);
  }

  /** Search a registry for a specific key. */
  get(meta: ReferenceMetadata): any | undefined {
    const registry = meta.registry;
    const key = meta.fullPath;
    if (key === undefined) {
      throw new Error("Key is undefined.");
    }
    const name = meta.name;
    switch (registry) {
      case RegistryKind.Definition:
        return this.data.definitions.get(key, name);
      case RegistryKind.Parameter:
        return this.data.parameters.get(key, name);
      case RegistryKind.Response:
        return this.data.responses.get(key, name);
      case RegistryKind.SecurityDefinition:
        return this.data.securityDefinitions.get(key, name);
      default:
        return (
          this.data.definitions.get(key, name) ??
          this.data.parameters.get(key, name) ??
          this.data.responses.get(key, name) ??
          this.data.securityDefinitions.get(key, name)
        );
    }
  }

  /** Logs a reference to an item. */
  countReference(path: string, name: string, registry: RegistryKind) {
    switch (registry) {
      case RegistryKind.Definition:
        this.data.definitions.countReference(path, name, registry);
        break;
      case RegistryKind.Parameter:
        this.data.parameters.countReference(path, name, registry);
        break;
      case RegistryKind.Response:
        this.data.responses.countReference(path, name, registry);
        break;
      case RegistryKind.SecurityDefinition:
        this.data.securityDefinitions.countReference(path, name, registry);
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
