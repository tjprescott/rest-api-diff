import { DiffEdit, DiffDeleted, DiffNew, DiffArray } from "deep-diff";
import { ignoreSwaggerPropertiesRule } from "./ignore-swagger-properties.js";

/** Determines whether a diff rule applies and confirms an allowed or disallowed scenario. */
export enum DiffRuleResult {
  /** The rule applies and flags a verified violation. Stop processing other rules for this diff. */
  FlaggedViolation,
  /** No rule handled the diff, so it is assumed to be a violation. */
  AssumedViolation,
  /** Rule applies and verifies this is not a violation. Stop processing other rules for this diff. */
  NoViolation,
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
export const diffRules: DiffRuleSignature[] = [ignoreSwaggerPropertiesRule];
