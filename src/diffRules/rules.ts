import { DiffEdit, DiffDeleted, DiffNew, DiffArray } from "deep-diff";
import { ignoreOperationTagsRule } from "./ignore-operation-tags.js";
import { ignoredPropertiesRule } from "./ignored-properties.js";
import { ignoreDescriptionRule } from "./ignore-description.js";

/** Determines whether a diff rule applies and confirms an allowed or disallowed scenario. */
export enum DiffRuleResult {
  /** The rule applies and flags a verified violation. Stop processing other rules for this diff. */
  Violation,
  /** The rule applies and this diff is fine. This is not a violation. Stop processing other rules for this diff. */
  Okay,
  /** The rule doesn't apply, so continue processing rules. */
  ContinueProcessing,
}

export type DiffRuleSignature = (
  data:
    | DiffEdit<any, any>
    | DiffDeleted<any>
    | DiffNew<any>
    | DiffArray<any, any>
) => DiffRuleResult;

/**
 * Diff rules apply when evaluating the diff between two objects.
 */
export const diffRules: DiffRuleSignature[] = [
  ignoredPropertiesRule,
  ignoreDescriptionRule,
  ignoreOperationTagsRule,
];
