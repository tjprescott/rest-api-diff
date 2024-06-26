export enum PathKind {
  /** A swagger property name. Can be filtered. */
  SwaggerProperty = "SwaggerProperty",
  /** A definition, parameter or response name. Cannot be filtered. */
  DefinitionKey = "DefinitionKey",
  /** A user-defined property name. Cannot be filtered. */
  PropertyKey = "PropertyKey",
  /** An array index. Cannot be filtered. */
  ArrayIndex = "ArrayIndex",
  /** And operation "path" key. Cannot be filtered. */
  OperationKey = "OperationKey",
}

/** Describes a Swagger path for use by the parser. */
export class SwaggerPath {
  private parent?: SwaggerPath;
  public readonly name: string;
  public readonly kind: PathKind;

  constructor(name: string, kind: PathKind, parent?: SwaggerPath) {
    this.name = name;
    this.parent = parent;
    this.kind = kind;
  }

  fullPath(): string {
    return this.parent ? `${this.parent.fullPath()}.${this.name}` : this.name;
  }
}
