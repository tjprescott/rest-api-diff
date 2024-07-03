import pkg, { Diff, DiffDeleted, DiffEdit, DiffNew } from "deep-diff";
import { DiffRuleResult, allRules } from "./rules/rules.js";
import * as fs from "fs";
import { SwaggerParser } from "./parser.js";
const { diff } = pkg;
import { OpenAPIV2 } from "openapi-types";

async function loadJsonFile(path: string): Promise<any> {
  const fileContent = fs.readFileSync(path, "utf-8");
  return JSON.parse(fileContent);
}

async function loadJsonContents(path: string): Promise<Map<string, any>> {
  validatePath(path);
  const stats = fs.statSync(path);
  let jsonContents = new Map<string, any>();

  const pathsToLoad = stats.isDirectory() ? fs.readdirSync(path) : [path];
  for (const filepath of pathsToLoad) {
    const filePathStats = fs.statSync(`${path}/${filepath}`);
    // Ignore director for now
    if (filePathStats.isDirectory()) {
      continue;
    }
    const name = filepath.split("/").pop()!.split(".")[0];
    // console.log(`Loading ${path}/${filepath}`);
    // skip non-JSON files
    if (filepath.endsWith(".json")) {
      jsonContents.set(name, await loadJsonFile(`${path}/${filepath}`));
    }
  }
  return jsonContents;
}

function validatePath(path: string): boolean {
  try {
    const stats = fs.statSync(path);
    return stats.isFile() || stats.isDirectory();
  } catch (error) {
    throw new Error(`Invalid path: ${path}`);
  }
}

async function main(args: string[]) {
  // TODO: Eliminate defaults
  const in1 = args[2] ?? "KeyVaultOriginal";
  const in2 = args[3] ?? "KeyVaultGenerated";

  // Ensure that input1 and input2 are provided
  if (!in1 || !in2) {
    console.error("error: Two inputs are required!");
    console.error("error: npm start [A] [B]");
    process.exit(1);
  }

  let leftParser = new SwaggerParser(await loadJsonContents(in1));
  let rightParser = new SwaggerParser(await loadJsonContents(in2));
  let lhs = leftParser.asJSON();
  let rhs = rightParser.asJSON();
  // collect both error schemas
  const errorsSchemas = new Map<string, OpenAPIV2.SchemaObject>();
  for (const [name, value] of Object.entries(lhs.definitions ?? {})) {
    errorsSchemas.set(name, value as OpenAPIV2.SchemaObject);
  }
  for (const [name, value] of Object.entries(rhs.definitions ?? {})) {
    errorsSchemas.set(name, value as OpenAPIV2.Schema);
  }

  // process the rules to filter out any irrelevant differences
  const differences = processDiff(diff(lhs, rhs), lhs, rhs, errorsSchemas);
  [lhs, rhs] = pruneDocuments(lhs, rhs, differences?.noViolations);
  fs.writeFileSync("lhs.json", JSON.stringify(lhs, null, 2));
  fs.writeFileSync("rhs.json", JSON.stringify(rhs, null, 2));

  const clearViolations = differences?.clearViolations.length ?? 0;
  const assumedViolations = differences?.assumedViolations.length ?? 0;
  if (clearViolations + assumedViolations === 0) {
    console.log("No differences found");
  } else {
    console.warn(
      `Found ${clearViolations} clear violations and ${assumedViolations} assumed violations! See diff.json, lhs.json, and rhs.json for details.`
    );
    // combine clear violations and assumed violations into a single collection and write to disk
    const combinedViolations = (differences?.clearViolations ?? []).concat(
      differences?.assumedViolations ?? []
    );
    fs.writeFileSync("diff.json", JSON.stringify(combinedViolations, null, 2));
  }
}

/** Deletes a specified path from a given OpenAPI document. */
function deletePath(
  doc: OpenAPIV2.Document,
  path: string[]
): OpenAPIV2.Document {
  const copy = { ...doc };
  let current = copy;
  const lastSegment = path.length - 1;
  for (let i = 0; i < lastSegment; i++) {
    const segment = path[i];
    current = (current as any)[segment];
  }
  delete (current as any)[path[lastSegment]];
  return copy;
}

/**
 * Accepts two documents and prunes any paths that are outlined in the diff. Should be
 * passed the collection of "noViolation" diffs.
 * @param inputLhs the left-hand side document
 * @param inputRhs the right-hand side document
 * @param differences the differences you want to prune
 * @returns a tuple of the pruned left-hand side and right-hand side documents
 */
function pruneDocuments(
  inputLhs: OpenAPIV2.Document,
  inputRhs: OpenAPIV2.Document,
  differences: DiffItem[] | undefined
): [OpenAPIV2.Document, OpenAPIV2.Document] {
  let lhs = inputLhs;
  let rhs = inputRhs;
  for (const diff of differences ?? []) {
    const path = diff.diff.path;
    if (!path) continue;
    const lastPath = path[path.length - 1];
    if ((diff.diff as any).lhs !== undefined) {
      lhs = deletePath(lhs, path);
    }
    if ((diff.diff as any).rhs !== undefined) {
      rhs = deletePath(rhs, path);
    }
  }
  // delete some standard collections from the documents
  const keysToDelete = [
    "definitions",
    "parameters",
    "responses",
    "securityDefinitions",
  ];
  for (const key of keysToDelete) {
    delete (lhs as any)[key];
    delete (rhs as any)[key];
  }
  return [lhs, rhs];
}

/** Determines if a rule can be applied. */
function isFilterable(path: string[]): boolean {
  const pathLength = path.length;
  if (pathLength < 2) return true;
  const firstPath = path[0];
  const secondToLastPath = path[path.length - 2];
  // Special top-level collections are key-value pairs where the keys aren't filterable
  if (pathLength === 2) {
    if (firstPath === "parameters") return false;
    if (firstPath === "definitions") return false;
    if (firstPath === "responses") return false;
    if (firstPath === "securityDefinitions") return false;
  }
  // properties can appear anywhere and property keys are not filterable by rules!
  if (secondToLastPath === "properties") return false;
  return true;
}

/**
 * Processes all rules against the given diff. If no rule confirms or denies
 * an issue, the diff is treated as a failure.
 * @param data the diff data to evaluate.
 * @returns an allowed DiffRuleResult. Only "ContinueProcessing" is not allowed.
 */
function processRules(
  data: Diff<any, any>,
  lhs: OpenAPIV2.Document,
  rhs: OpenAPIV2.Document,
  errorSchemas: Map<string, OpenAPIV2.SchemaObject>
): DiffItem {
  let retVal: any = {
    ruleResult: DiffRuleResult.AssumedViolation,
    ruleName: undefined,
    diff: data,
  };
  for (const rule of allRules) {
    const result = rule(data, lhs, rhs, errorSchemas);
    if (Array.isArray(result)) {
      retVal.ruleResult = result[0];
      retVal.ruleName = rule.name;
      retVal.message = result[1];
      break;
    } else if (result === DiffRuleResult.ContinueProcessing) {
      continue;
    } else {
      retVal.ruleResult = result;
      retVal.ruleName = rule.name;
      break;
    }
  }
  return retVal as DiffItem;
}

export interface DiffItem {
  ruleResult: DiffRuleResult;
  ruleName?: string;
  message?: string;
  diff: DiffNew<any> | DiffEdit<any, any> | DiffDeleted<any>;
}

export interface DiffResult {
  clearViolations: DiffItem[];
  assumedViolations: DiffItem[];
  noViolations: DiffItem[];
}

function processDiff(
  differences: Diff<any, any>[] | undefined,
  lhs: OpenAPIV2.Document,
  rhs: OpenAPIV2.Document,
  errorsSchemas: Map<string, OpenAPIV2.SchemaObject>
): DiffResult | undefined {
  if (!differences) {
    return undefined;
  }
  const results: DiffResult = {
    clearViolations: [],
    assumedViolations: [],
    noViolations: [],
  };
  for (const data of differences ?? []) {
    if (!isFilterable(data.path!)) continue;
    const result = processRules(data, lhs, rhs, errorsSchemas);
    switch (result.ruleResult) {
      case DiffRuleResult.AssumedViolation:
        results.assumedViolations.push(result);
        break;
      case DiffRuleResult.FlaggedViolation:
        results.clearViolations.push(result);
        break;
      case DiffRuleResult.NoViolation:
        results.noViolations.push(result);
        break;
      default:
        throw new Error(`Unexpected result ${result}`);
    }
  }
  return results;
}

await main(process.argv);
