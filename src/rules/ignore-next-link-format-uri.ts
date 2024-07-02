import { Diff } from "deep-diff";
import { DiffRuleResult } from "./rules.js";
import { OpenAPIV2 } from "openapi-types";

/**
 * Ignores a diff when "format: uri" is added to nextLink parameter.
 */
export function ignoreNextLinkFormatUriRule(
  data: Diff<any, any>,
  lhs?: OpenAPIV2.Document,
  rhs?: OpenAPIV2.Document
): DiffRuleResult {
  if (!data.path) return DiffRuleResult.ContinueProcessing;
  if (data.kind !== "N") return DiffRuleResult.ContinueProcessing;
  const path = data.path.join(".");
  if (path.endsWith("properties.nextLink.format")) {
    return DiffRuleResult.NoViolation;
  }
  return DiffRuleResult.ContinueProcessing;
}
