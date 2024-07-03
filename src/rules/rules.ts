import { Diff } from "deep-diff";
import { ignoreSwaggerPropertiesRule } from "./ignore-swagger-properties.js";
import { ignoreIrrelevantResponsePropertiesRule } from "./ignore-irrelevant-response-properties.js";
import { ignoreXMsErrorCodeHeaderRule } from "./ignore-x-ms-error-code-header.js";
import { ignoreApiVersionMinLengthRule } from "./ignore-api-version-min-length.js";
import { OpenAPIV2, OpenAPIV3 } from "openapi-types";
import { ignoreFormatUriRule } from "./ignore-format-uri.js";
import { ignoreNextLinkFormatUriRule } from "./ignore-next-link-format-uri.js";
import { compareErrorsRule } from "./compare-errors.js";

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

export type RuleSignature = (
  data: Diff<any, any>,
  lhs?: OpenAPIV2.Document,
  rhs?: OpenAPIV2.Document,
  errorSchemas?: Map<string, OpenAPIV2.SchemaObject>
) => DiffRuleResult | [DiffRuleResult, string];

/**
 * Diff rules apply when evaluating the diff between two objects.
 */
export const allRules: RuleSignature[] = [
  ignoreSwaggerPropertiesRule,
  ignoreIrrelevantResponsePropertiesRule,
  ignoreXMsErrorCodeHeaderRule,
  ignoreApiVersionMinLengthRule,
  ignoreFormatUriRule,
  ignoreNextLinkFormatUriRule,
  compareErrorsRule,
];
