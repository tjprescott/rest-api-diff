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
import { xFormatChangedRule } from "./x-format-changed.js";
import { xNameChangedRule } from "./x-name-changed.js";
import { xEnumAddedRule } from "./x-enum-added.js";
import { xMsMutabilityChangedRule } from "./x-ms-mutability-changed.js";
import { xResponseAddedRule } from "./x-response-added.js";
import { xMsLongRunningOperationChangedRule } from "./x-ms-long-running-operation-changed.js";
import { xConstraintChangedRule } from "./x-constraint-changed.js";
import { xPathAddedRule } from "./x-path-added.js";
import { xPathRemovedRule } from "./x-path-removed.js";
import { xMsAzureResourceChangedRule } from "./x-ms-azure-resource-changed.js";
import { xResponseRemovedRule } from "./x-response-removed.js";
import { xParameterInChangedRule } from "./x-parameter-in-changed.js";
import { xMsLongRunningOperationOptionsChangedRule } from "./x-ms-long-running-operations-options-changed.js";
import { xMsSecretChangedRule } from "./x-ms-secret-changed.js";
import { xParameterSchemaChangedRule } from "./x-parameter-schema-changed.js";
import { xProducesChangedRule } from "./x-produces-changed.js";
import { xConsumesChangedRule } from "./x-consumes-changed.js";
import { xParameterChangedRule } from "./x-parameter-changed.js";
import { xRequiredChangedRule } from "./x-required-changed.js";
import { xAdditionalPropertiesChangedRule } from "./x-additional-properties-changed.js";
import { xIgnoreObjectChangedRule } from "./x-ignore-object-changed.js";
import { xAnyOfChangedRule } from "./x-any-of-changed.js";
import { xReadOnlyChangedRule } from "./x-read-only-changed.js";
import { xHeadersAddedRule } from "./x-headers-added.js";
import { xSystemDataAddedRule } from "./x-system-data-added.js";
import { xPropertyRemovedRule } from "./x-property-removed.js";
import { xDefaultRemovedRule } from "./x-default-removed.js";
import { xDiskControllerTypeItemsRemovedRule } from "./x-disk-controller-type-items-removed.js";
import { xPropertyAddedRule } from "./x-property-added.js";
import { xNullableChangedRule } from "./x-nullable-changed.js";
import { xMsIdentifiersChangedRule } from "./x-ms-identifiers-added.js";
import { xSecurityAddedRule } from "./x-security-added.js";

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
    xFormatChangedRule,
    xMsMutabilityChangedRule,
    xEnumAddedRule,
    xNameChangedRule,
    xResponseAddedRule,
    xResponseRemovedRule,
    xMsLongRunningOperationOptionsChangedRule,
    xMsLongRunningOperationChangedRule,
    xPathAddedRule,
    xPathRemovedRule,
    xMsAzureResourceChangedRule,
    xParameterInChangedRule,
    xMsSecretChangedRule,
    xParameterSchemaChangedRule,
    xProducesChangedRule,
    xConsumesChangedRule,
    xParameterChangedRule,
    xRequiredChangedRule,
    xAdditionalPropertiesChangedRule,
    xSystemDataAddedRule,
    xIgnoreObjectChangedRule,
    xAnyOfChangedRule,
    xReadOnlyChangedRule,
    xHeadersAddedRule,
    xPropertyRemovedRule,
    xPropertyAddedRule,
    xDefaultRemovedRule,
    xDiskControllerTypeItemsRemovedRule,
    xNullableChangedRule,
    xMsIdentifiersChangedRule,
    xSecurityAddedRule,
  ];

  const preserveDefinitions = args["preserve-definitions"];
  if (!preserveDefinitions) {
    rules.push(ignoreSwaggerDefinitionsRule);
  }
  return [...rules, ...tempRules];
}
