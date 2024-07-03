import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

export function ignoreXMsErrorCodeHeaderRule(data: Diff<any, any>): RuleResult {
  if (!data.path) return RuleResult.ContinueProcessing;
  if (data.kind !== "N") return RuleResult.ContinueProcessing;
  const lastPath = data.path.slice(-1)[0];
  if (lastPath !== "headers") return RuleResult.ContinueProcessing;

  const headers = data.rhs;
  const headerKeys = Object.keys(headers);
  if (headerKeys.includes("x-ms-error-code")) {
    if (headerKeys.length === 1) {
      return RuleResult.NoViolation;
    } else {
      // FIXME: This should really just try to remove x-ms-error-code, but that will be tough at this stage.
      console.warn(
        `x-ms-error-code header is not the only header in the response.`,
        data
      );
      return RuleResult.ContinueProcessing;
    }
  }
  return RuleResult.ContinueProcessing;
}
