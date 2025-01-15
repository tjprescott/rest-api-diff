import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * The diskControllerType items field was removed.
 */
export function xDiskControllerTypeItemsRemovedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  if (data.path.length < 4) return;

  const paths = data.path.slice(-3);
  if (data.kind !== "D") return;
  if (paths[0] !== "properties") return;
  if (paths[1] !== "diskControllerType") return;
  if (paths[2] !== "items") return;
  return RuleResult.FlaggedViolation;
}
