export interface DefinitionMetadata {
  /** The name of the definition. */
  name: string;
  /** The swagger value, expanding any references. */
  value: any;
  /** The original swagger value, with references in-tact. */
  original: any;
  /** The source file for the definition. */
  source: string;
}
