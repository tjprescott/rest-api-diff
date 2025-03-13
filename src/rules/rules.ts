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
import { ignoreSwaggerDefinitionsRule } from "./ignore-swagger-definitions.js";
import { compareXMsIdentifiersRule } from "./compare-x-ms-identifiers.js";
import { ignoreXMsExamplesRule } from "./ignore-x-ms-examples.js";
import { pathAddedRule } from "./path-added.js";
import { pathRemovedRule } from "./path-removed.js";
import { responseAddedRule } from "./response-added.js";
import { responseRemovedRule } from "./response-removed.js";
import { ignoreTagsRule } from "./ignore-tags.js";
import { ignoreEquivalentArrays } from "./ignore-equivalent-arrays.js";
import { xMsMutabilityChangedRule } from "./x-ms-mutability-changed.js";
import { xResponseAddedRule } from "./x-response-added.js";
import { xMsLongRunningOperationChangedRule } from "./x-ms-long-running-operation-changed.js";
import { xConstraintChangedRule } from "./x-constraint-changed.js";
import { xMsAzureResourceChangedRule } from "./x-ms-azure-resource-changed.js";
import { xMsLongRunningOperationOptionsChangedRule } from "./x-ms-long-running-operations-options-changed.js";
import { xAdditionalPropertiesChangedRule } from "./x-additional-properties-changed.js";
import { xIgnoreObjectChangedRule } from "./x-ignore-object-changed.js";
import { xHeadersAddedRule } from "./x-headers-added.js";
import { xSystemDataAddedRule } from "./x-system-data-added.js";
import { xDefaultRemovedRule } from "./x-default-removed.js";
import { xNullableChangedRule } from "./x-nullable-changed.js";
import { xNextLinkNameAddedRule } from "./x-next-link-name-added.js";
import { xMsOdataRemovedRule } from "./x-ms-odata-removed.js";

/** Determines whether a diff rule applies and confirms an allowed or disallowed scenario. */
export enum RuleResult {
  /** The rule applies and flags a verified violation. Stop processing other rules for this diff. */
  FlaggedViolation = "F",
  /** No rule handled the diff, so it is assumed to be a violation. */
  AssumedViolation = "A",
  /** Rule applies and verifies this is not a violation. Stop processing other rules for this diff. */
  NoViolation = "N",
  /** Rule was a flagged or assumed violation, but manually suppressed. */
  Suppressed = "S",
}

export type RuleSignature = (
  data: Diff<any, any>,
  lhs?: OpenAPIV2.Document,
  rhs?: OpenAPIV2.Document
) => RuleResult | [RuleResult, string] | undefined;

/** Returns the list of rules that should be applied, modified by any options. */
export function getApplicableRules(args: any): RuleSignature[] {
  let rules = [
    ignoreEquivalentArrays,
    ignoreSwaggerPropertiesRule,
    ignoreIrrelevantResponsePropertiesRule,
    ignoreXMsErrorCodeHeaderRule,
    ignoreXMsExamplesRule,
    ignoreApiVersionMinLengthRule,
    ignoreFormatUriRule,
    ignoreNextLinkFormatUriRule,
    compareXMsIdentifiersRule,
    compareErrorsRule,
    compareXMsEnumRule,
    flagTypeDifferencesRule,
    compareResponseRequiredRule,
    compareRequestRequiredRule,
    pathAddedRule,
    pathRemovedRule,
    responseAddedRule,
    responseRemovedRule,
    ignoreTagsRule,
  ];

  let tempRules = [
    xConstraintChangedRule,
    xMsMutabilityChangedRule,
    xResponseAddedRule,
    xMsLongRunningOperationOptionsChangedRule,
    xMsLongRunningOperationChangedRule,
    xMsAzureResourceChangedRule,
    xAdditionalPropertiesChangedRule,
    xSystemDataAddedRule,
    xIgnoreObjectChangedRule,
    xHeadersAddedRule,
    xDefaultRemovedRule,
    xNullableChangedRule,
    xNextLinkNameAddedRule,
    xMsOdataRemovedRule,
  ];

  const preserveDefinitions = args["preserve-definitions"];
  if (!preserveDefinitions) {
    rules.push(ignoreSwaggerDefinitionsRule);
  }
  return [...rules, ...tempRules];
}
