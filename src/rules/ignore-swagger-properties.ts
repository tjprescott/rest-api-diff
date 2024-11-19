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
  "examples",
  "operationId",
  "summary",
  "tags",
  // Extensions that are intended for consumption by Autorest and thus
  // don't impact the REST API shape.
  "x-ms-client-default",
  "x-ms-client-flatten",
  "x-ms-client-name",
  "x-ms-code-generation-settings",
  "x-ms-enum",
  "x-ms-examples",
  "x-ms-parameter-grouping",
  "x-ms-parameter-location",
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
}
