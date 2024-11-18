import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

export function ignoreXMsErrorCodeHeaderRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  if (data.kind !== "N") return;
  const lastPath = data.path.slice(-1)[0];
  if (lastPath !== "headers") return;

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
    }
  }
}
