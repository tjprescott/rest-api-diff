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
import { ignoreSwaggerDefintionsRule } from "./ignore-swagger-definitions.js";
import { compareXMsIdentifiersRule } from "./compare-x-ms-identifiers.js";
import { xFormatChangedRule } from "./x-format-changed.js";
import { xNameChangedRule } from "./x-name-changed.js";
import { xEnumAddedRule } from "./x-enum-added.js";
import { xMsMutabilityAddedRule } from "./x-ms-mutability-added.js";
import { xDerivedClassesRule } from "./x-derived-classes.js";
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
  rhs?: OpenAPIV2.Document
) => RuleResult | [RuleResult, string];

/** Returns the list of rules that should be applied, modified by any options. */
export function getApplicableRules(args: any): RuleSignature[] {
  let rules = [
    ignoreSwaggerPropertiesRule,
    ignoreIrrelevantResponsePropertiesRule,
    ignoreXMsErrorCodeHeaderRule,
    ignoreApiVersionMinLengthRule,
    ignoreFormatUriRule,
    ignoreNextLinkFormatUriRule,
    compareXMsIdentifiersRule,
    compareErrorsRule,
    compareXMsEnumRule,
    flagTypeDifferencesRule,
    compareResponseRequiredRule,
    compareRequestRequiredRule,
  ];

  let tempRules = [
    xConstraintChangedRule,
    xFormatChangedRule,
    xMsMutabilityAddedRule,
    xEnumAddedRule,
    xNameChangedRule,
    xDerivedClassesRule,
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
  ];

  const preserveDefinitions = args["preserve-definitions"];
  if (!preserveDefinitions) {
    rules.push(ignoreSwaggerDefintionsRule);
  }
  return [...rules, ...tempRules];
}
