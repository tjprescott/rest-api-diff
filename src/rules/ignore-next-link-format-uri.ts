import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";
import { OpenAPIV2 } from "openapi-types";

/**
 * Ignores a diff when "format: uri" is added to nextLink parameter.
 */
export function ignoreNextLinkFormatUriRule(
  data: Diff<any, any>,
  lhs?: OpenAPIV2.Document,
  rhs?: OpenAPIV2.Document
): RuleResult {
  if (!data.path) return RuleResult.ContinueProcessing;
  if (data.kind !== "N") return RuleResult.ContinueProcessing;
  const path = data.path.join(".");
  if (path.endsWith("properties.nextLink.format")) {
    return RuleResult.NoViolation;
  }
  return RuleResult.ContinueProcessing;
}
