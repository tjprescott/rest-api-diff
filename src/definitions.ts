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
import { DiffClient } from "./diff-client.js";

interface InheritanceMetadata {
  /** And child classes that derive from this class */
  children: Set<string>;
  /** Any parent classes this class derives from */
  parents: Set<string>;
}

/** Track parent/child relationships among the various classes. */
class InheritanceManager {
  /** The inheritance map. */
  private inheritanceMap = new Map<string, InheritanceMetadata>();

  constructor() {}

  #isAbsolute(path: string): boolean {
    return path.startsWith("/") || /^[a-zA-Z]:\\/.test(path);
  }

  #normalizePath(path: string): string {
    return path.replace(/\\/g, "/");
  }

  /** Normalizes paths and attempts to resolve relative paths.
   * If there is more than one matching relative path, throws
   * an error.
   */
  #resolvePath(path: string): string {
    const normPath = this.#normalizePath(path);
    // if path is not absolute, look for a key that endsWith it and verify there is only one match
    if (!this.#isAbsolute(normPath)) {
      const matches = [...this.inheritanceMap.keys()].filter((key) =>
        key.endsWith(normPath)
      );
      if (matches.length === 1) {
        return matches[0];
      } else if (matches.length > 1) {
        throw new Error(
          `Multiple inheritance paths found for ${normPath}: ${matches.join(", ")}`
        );
      }
    }
    return normPath;
  }

  /** Register a parent relationship to the provided path (i.e. the provided path derives from the parent). */
  registerParent(path: string, parent: string) {
    const normPath = this.#normalizePath(path);
    const parentPath = this.#normalizePath(parent);
    const metadata = this.inheritanceMap.get(normPath);
    if (metadata === undefined) {
      this.inheritanceMap.set(normPath, {
        children: new Set<string>(),
        parents: new Set<string>([parentPath]),
      });
    } else {
      metadata.parents.add(parentPath);
    }
  }

  /** Register a child relationship to the provided path (i.e. the child derives from the given path) */
  registerChild(path: string, child: string) {
    const normPath = this.#normalizePath(path);
    const childPath = this.#normalizePath(child);
    const metadata = this.inheritanceMap.get(normPath);
    if (metadata === undefined) {
      this.inheritanceMap.set(normPath, {
        children: new Set<string>([childPath]),
        parents: new Set<string>(),
      });
    } else {
      metadata.children.add(childPath);
    }
  }

  /** Get the parent classes associated with a given path. */
  getParents(path: string): Set<string> {
    const normPath = this.#resolvePath(path);
    const metadata = this.inheritanceMap.get(normPath);
    if (metadata === undefined) {
      return new Set<string>();
    }
    return metadata.parents;
  }

  /** Get the child classes associated with a given path. */
  getChildren(path: string): Set<string> {
    const normPath = this.#resolvePath(path);
    const metadata = this.inheritanceMap.get(normPath);
    if (metadata === undefined) {
      return new Set<string>();
    }
    return metadata.children;
  }

  /** Recursively expand child references. */
  #expandChildren(set: Set<string>, child: string | null): Set<string> {
    if (child === null) {
      return set;
    }
    const children = this.getChildren(child);
    for (const child of children) {
      set.add(child);
      this.#expandChildren(set, child);
    }
    return set;
  }

  /** Recursively expand parent references. */
  #expandParents(set: Set<string>, parent: string | null): Set<string> {
    if (parent === null) {
      return set;
    }
    const parents = this.getParents(parent);
    for (const parent of parents) {
      set.add(parent);
      this.#expandParents(set, parent);
    }
    return set;
  }

  /** Expand any transitive parent/child relationships. For example,
   * if C extends B and B extends A, then C will show B and A as parents,
   * and A will show B and C as children.
   */
  resolveInheritanceChains() {
    for (const [key, data] of this.inheritanceMap.entries()) {
      const children = this.getChildren(key);
      for (const child of children) {
        this.#expandChildren(children, child);
      }
      const parents = this.getParents(key);
      for (const parent of parents) {
        this.#expandParents(parents, parent);
      }
      data.children = children;
      data.parents = parents;
    }
  }
}

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
  private unresolvedReferences = new Set<string>();
  private providedPaths = new Set<string>();
  private referenceStack: string[] = [];
  private referenceMap = new Map<string, Set<string>>();
  private currentPath: string[];
  private client: DiffClient;
  private inheritance: InheritanceManager = new InheritanceManager();

  constructor(map: Map<string, OpenAPIV2.Document>, client: DiffClient) {
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
    this.currentPath = [];
    this.client = client;
    this.#gatherDefinitions(map);
    this.#expandDefinitions();
    this.#expandOtherReferences();
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
      this.#addInheritanceInfo(item);
      for (const [propName, propValue] of toSorted(Object.entries(item))) {
        this.currentPath.push(propName);
        expanded[propName] = this.#expand(propValue);
        this.currentPath.pop();
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

  #addInheritanceInfo(base: any): any {
    const path = this.currentPath.join("/");

    // if children found, add them as $anyOf and expand them
    const children = this.inheritance.getChildren(path);
    if (children.size > 0) {
      const anyOf = [...children].map((child) => {
        return { $ref: child };
      });
      base.$anyOf = anyOf;
    }

    // if parents found, mix them into the base object
    const parents = this.inheritance.getParents(path);
    if (parents.size > 0) {
      const allOf = [...parents].map((parent) => {
        return { $ref: parent };
      });
      base.$allOf = allOf;
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
    }
  }

  #expandReferenceMap() {
    for (const [key, values] of this.referenceMap.entries()) {
      const expanded = new Set<string>();
      this.#expandSetWithItems(expanded, values);
      this.referenceMap.set(key, expanded);
    }
  }

  #expandReferencesForCollection(collection: CollectionRegistry) {
    this.referenceStack = [];
    for (const [filepath, values] of collection.data.entries()) {
      for (const [key, value] of values.entries()) {
        this.currentPath.push(key);
        let expanded = this.#expand(value, key, filepath);
        collection.data.get(filepath)!.set(key, expanded);
        this.currentPath.pop();
      }
    }
    this.#expandReferenceMap();
  }

  #expandAllOfReferences() {
    const collection = this.data.definitions;
    for (const [_, values] of collection.data.entries()) {
      for (const [_, data] of values.entries()) {
        const allOf = data.$allOf;
        if (allOf === undefined) {
          continue;
        }
        delete data.$allOf;
        const baseKeys = [...Object.keys(data)];
        const allKeys = new Set([...baseKeys]);
        for (const item of allOf) {
          for (const itemKey of Object.keys(item)) {
            allKeys.add(itemKey);
          }
          // merge 'required' and 'properties' if they exist
          for (const key of allKeys) {
            const baseVal = data[key];
            const itemVal = item[key];
            switch (key) {
              case "required":
                const mergedRequired = new Set(
                  (baseVal ?? []).concat(itemVal ?? [])
                );
                data[key] = [...mergedRequired];
                break;
              case "properties":
                data[key] = { ...(baseVal ?? {}), ...(itemVal ?? {}) };
                break;
              default:
                break;
            }
          }
        }
      }
    }
  }

  #expandAnyOfReferences() {
    const collection = this.data.definitions;
    for (const [_, values] of collection.data.entries()) {
      for (const [_, data] of values.entries()) {
        const anyOf = data.$anyOf;
        if (anyOf === undefined) {
          continue;
        }
      }
    }
  }

  #expandDefinitions() {
    this.currentPath.push("definitions");
    this.#expandReferencesForCollection(this.data.definitions);
    this.#expandAllOfReferences();
    this.#expandAnyOfReferences();
    this.currentPath.pop();
  }

  #expandOtherReferences() {
    this.currentPath.push("parameters");
    this.#expandReferencesForCollection(this.data.parameters);
    this.currentPath.pop();
    this.currentPath.push("responses");
    this.#expandReferencesForCollection(this.data.responses);
    this.currentPath.pop();
    this.currentPath.push("securityDefinitions");
    this.#expandReferencesForCollection(this.data.securityDefinitions);
    this.currentPath.pop();
  }

  /**
   * Registers any allOf references with the inheritance manager with a
   * reciprocal relationship. So if B has an allOf reference to A, then A will
   * register B as a child and B will register A as a parent.
   */
  #checkInheritance(data: any, key: string, filePath: string) {
    const allOf = data.allOf;
    if (allOf === undefined) {
      return;
    }
    delete data.allOf;

    const isArray = Array.isArray(allOf);
    const allReferences =
      allOf.filter((x: any) => !isReference(x)).length === 0;

    if (isArray && allReferences) {
      for (const item of allOf) {
        const ref = item.$ref;
        const refResult = parseReference(ref);
        if (!refResult) {
          throw new Error(`Could not parse reference: ${ref}`);
        }
        item.$ref = refResult.expandedRef;
        let pathKey = `${filePath}#/${this.getRegistryName(refResult.registry)}/${key}`;
        this.inheritance.registerParent(pathKey, refResult.expandedRef);
        this.inheritance.registerChild(refResult.expandedRef, pathKey);
      }
    } else if (allOf) {
      // allOf is listing properties to mix-in
      throw new Error(
        `Please contact support. Unsupported allOf scenario: ${allOf}`
      );
    }
  }

  #visitDefinition(filePath: string, key: string, data: any) {
    this.#checkInheritance(data, key, filePath);
    this.data.definitions.add(filePath, key, data);
  }

  #visitSchema(path: string, data: any) {
    if (data === undefined) {
      return;
    }
    this.#checkInheritance(data, data.name, path);
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
    this.inheritance.resolveInheritanceChains();
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
