import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";
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
 * Ignores a diff in the minLength property on the api-version parameter only.
 */
export function ignoreApiVersionMinLengthRule(
  data: Diff<any, any>,
  lhs?: OpenAPIV2.Document,
  rhs?: OpenAPIV2.Document
): RuleResult {
  if (!data.path) return RuleResult.ContinueProcessing;
  const path = data.path.join(".");
  const regex = /parameters\.(\d+)\.minLength/;
  const match = path.match(regex);
  if (!match) return RuleResult.ContinueProcessing;
  const paramPath = data.path.slice(0, -1);
  const source = (data as any).lhs !== undefined ? lhs : rhs;
  const param = getParameter(source, paramPath);
  if (!param) {
    throw new Error(`Parameter not found at path: ${paramPath.join(".")}`);
  }
  if (param.name === "api-version") return RuleResult.NoViolation;
  return RuleResult.ContinueProcessing;
}
