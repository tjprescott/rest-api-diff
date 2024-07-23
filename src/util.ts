import { RegistryKind } from "./definitions.js";

export interface ReferenceMetadata {
  name: string;
  registry: RegistryKind;
  filePath?: string;
}

export function parseReference(ref: string): ReferenceMetadata | undefined {
  const regex = /(.+\.json)?#\/(.+)\/(.+)/;
  const match = ref.match(regex);
  if (!match) {
    return undefined;
  }
  const path = match[1];
  const section = match[2];
  const name = match[3];
  let registry: RegistryKind;
  switch (section) {
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
      throw new Error(`Unknown registry: ${section}`);
  }
  return {
    filePath: path,
    registry: registry,
    name: name,
  };
}

export function isReference(value: any): boolean {
  return Object.keys(value).includes("$ref");
}
