import { Diff } from "deep-diff";
import { ignoreSwaggerPropertiesRule } from "./ignore-swagger-properties.js";
import { ignoreIrrelevantResponsePropertiesRule } from "./ignore-irrelevant-response-properties.js";
import { ignoreXMsErrorCodeHeaderRule } from "./ignore-x-ms-error-code-header.js";
import { ignoreApiVersionMinLengthRule } from "./ignore-api-version-min-length.js";
import { OpenAPIV2 } from "openapi-types";
import { ignoreFormatUriRule } from "./ignore-format-uri.js";
import { ignoreNextLinkFormatUriRule } from "./ignore-next-link-format-uri.js";
import { compareErrorsRule } from "./compare-errors.js";
import { flagTypeDifferencesRule } from "./flag-type-differences.js";
import { compareXMsEnumRule } from "./compare-x-ms-enum.js";
import { compareResponseRequiredRule } from "./compare-response-required.js";
import { compareRequestRequiredRule } from "./compare-request-required.js";

/** Determines whether a diff rule applies and confirms an allowed or disallowed scenario. */
export enum RuleResult {
  /** The rule applies and flags a verified violation. Stop processing other rules for this diff. */
  FlaggedViolation = "F",
  /** No rule handled the diff, so it is assumed to be a violation. */
  AssumedViolation = "A",
  /** Rule applies and verifies this is not a violation. Stop processing other rules for this diff. */
  NoViolation = "N",
  /** The rule doesn't apply, so continue processing rules. */
  ContinueProcessing = "C",
}

export type RuleSignature = (
  data: Diff<any, any>,
  lhs?: OpenAPIV2.Document,
  rhs?: OpenAPIV2.Document,
  errorSchemas?: Map<string, OpenAPIV2.SchemaObject>
) => RuleResult | [RuleResult, string];

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
  compareXMsEnumRule,
  flagTypeDifferencesRule,
  compareResponseRequiredRule,
  compareRequestRequiredRule,
];
