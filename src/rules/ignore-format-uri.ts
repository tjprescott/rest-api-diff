import { Diff } from "deep-diff";
import { DiffRuleResult } from "./rules.js";
import { OpenAPIV2 } from "openapi-types";

function getParameter(
  source: OpenAPIV2.Document | undefined,
  path: string[]
): OpenAPIV2.Parameter | undefined {
  if (!source) return undefined;
  let current: any = source;
  for (const segment of path) {
    current = (current as any)[segment];
  }
  return current as OpenAPIV2.Parameter;
}

/**
 * Ignores a diff when "format: uri" is added to a parameter is was marked "x-ms-skip-url-encoding".
 */
export function ignoreFormatUriRule(
  data: Diff<any, any>,
  lhs?: OpenAPIV2.Document,
  rhs?: OpenAPIV2.Document
): DiffRuleResult {
  if (!data.path) return DiffRuleResult.ContinueProcessing;
  if (data.kind !== "N") return DiffRuleResult.ContinueProcessing;
  const path = data.path.join(".");
  const regex = /parameters\.(\d+)\.format/;
  const match = path.match(regex);
  if (!match) return DiffRuleResult.ContinueProcessing;
  const paramPath = data.path.slice(0, -1);
  const param = getParameter(lhs, paramPath);
  if (!param) {
    throw new Error(`Parameter not found at path: ${paramPath.join(".")}`);
  }
  const skipUrlEncoding = param["x-ms-skip-url-encoding"];
  if (skipUrlEncoding && skipUrlEncoding === true) {
    return DiffRuleResult.NoViolation;
  }
  return DiffRuleResult.ContinueProcessing;
}
