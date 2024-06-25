import { DiffEdit, DiffDeleted, DiffNew, DiffArray } from "deep-diff";
import { ignoreOperationTagsRule } from "./ignore-operation-tags.js";
import { ignoredPropertiesRule } from "./ignored-properties.js";
import { ignoreDescriptionRule } from "./ignore-description.js";

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

export const rules: RuleSignature[] = [
  ignoredPropertiesRule,
  ignoreDescriptionRule,
  ignoreOperationTagsRule,
];
