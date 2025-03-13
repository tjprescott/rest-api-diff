import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * A default field was removed, unless the default was "false" because
 * the default for booleans is implicitly false.
 */
export function xDefaultRemovedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath === "default" && data.kind === "D") {
    if (data.lhs === false) return RuleResult.NoViolation;
  }
}
