import { DiffEdit, DiffDeleted, DiffNew, DiffArray } from "deep-diff";

export enum RuleResult {
  Violation,
  Okay,
  ContinueProcessing,
}

export type RuleSignature = (
  data:
    | DiffEdit<any, any>
    | DiffDeleted<any>
    | DiffNew<any>
    | DiffArray<any, any>
) => RuleResult;
