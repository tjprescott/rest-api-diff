import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Ignores specific diffs due to a bug in rest-api-diff
 * that doesn't properly expand inheritance chains.
 * These have been verified manually.
 */
export function xIgnoreFaultyInheritanceRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path || data.path.length < 4) return;
  if (data.kind !== "D") return;
  const lastPath = data.path[data.path.length - 1];
  const properties_to_examine = ["id", "name", "type"];

  if (!properties_to_examine.includes(lastPath)) return;

  // Most common pattern
  if (
    data.path[data.path.length - 2] == "properties" &&
    data.path[data.path.length - 3] == "items" &&
    data.path[data.path.length - 4] == "privateEndpointConnections"
  ) {
    return RuleResult.NoViolation;
  }

  const patterns_to_ignore = [
    "privateendpointconnections",
    "diskrestorepoints",
  ];

  // second pattern for lists
  if (
    data.path[data.path.length - 2] == "properties" &&
    data.path[data.path.length - 3] == "items"
  ) {
    // split url by / and check if the last part is in the patterns_to_ignore
    const url = data.path[1].split("/");
    const lastPart = url[url.length - 1].toLowerCase();
    if (patterns_to_ignore.some((pattern) => lastPart.includes(pattern))) {
      return RuleResult.NoViolation;
    }
  }

  // third pattern for schemas
  if (
    data.path[data.path.length - 2] == "properties" &&
    data.path[data.path.length - 3] == "schema"
  ) {
    // split url by / and check if the last part is in the patterns_to_ignore
    const url = data.path[1].split("/");
    const lastPart = url[url.length - 2].toLowerCase();
    if (patterns_to_ignore.some((pattern) => lastPart.includes(pattern))) {
      return RuleResult.NoViolation;
    }
  }
}
