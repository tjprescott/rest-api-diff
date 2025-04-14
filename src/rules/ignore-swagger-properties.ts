import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

const specificPathsToIgnore = [
  "externalDocs",
  "info.title",
  "info.description",
  "info.termsOfService",
  "info.contact",
  "info.x-typespec-generated",
  "schemes",
];

const swaggerPropertiesToIgnore = [
  // Swagger properties that contribute documentation and metadata
  // but don't affect the shape of the service.
  "description",
  "operationId",
  "summary",
  "title",
  // Extensions that are intended for consumption by Autorest and thus
  // don't impact the REST API shape.
  "x-ms-client-default",
  "x-ms-client-flatten",
  "x-ms-client-name",
  "x-ms-enum",
  "x-ms-parameter-grouping",
  "x-ms-parameter-location",
];

const swaggerArrayPropertiesToIgnore = [
  "x-ms-examples",
  "tags",
  "examples",
  "x-ms-code-generation-settings",
];

export function ignoreSwaggerPropertiesRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const fullPath = data.path.join(".");
  const lastPath = data.path.slice(-1)[0];
  if (swaggerPropertiesToIgnore.includes(lastPath)) {
    return RuleResult.NoViolation;
  }
  for (const pathToIgnore of specificPathsToIgnore) {
    if (fullPath.startsWith(pathToIgnore)) {
      return RuleResult.NoViolation;
    }
  }
  const lastTwoPaths = data.path.slice(-2);
  for (const prop of swaggerArrayPropertiesToIgnore) {
    if (lastTwoPaths.includes(prop)) {
      return RuleResult.NoViolation;
    }
  }
}
