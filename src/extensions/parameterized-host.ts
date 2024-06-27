export interface ParameterizedHost {
  hostTemplate: string;
  useSchemePrefix: boolean;
  positionInOperation: "first" | "last";
  parameters: any[];
}
