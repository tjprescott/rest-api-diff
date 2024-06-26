import pkg, { Diff } from "deep-diff";
import { DiffRuleResult, diffRules } from "./diffRules/rules.js";
import * as fs from "fs";
import { SwaggerParser, SwaggerParserOptions } from "./parser.js";
const { diff } = pkg;

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
    console.log(`Loading ${path}/${filepath}`);
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

  const options: SwaggerParserOptions = { applyFilteringRules: true };
  const lhs = new SwaggerParser(await loadJsonContents(in1), options).asJSON();
  const rhs = new SwaggerParser(await loadJsonContents(in2), options).asJSON();
  fs.writeFileSync("lhs.json", JSON.stringify(lhs, null, 2));
  fs.writeFileSync("rhs.json", JSON.stringify(rhs, null, 2));

  // diff the output
  let differences = diff(lhs, rhs);

  // process the rules to filter out any irrelevant differences
  differences = processDiff(differences);

  if (!differences) {
    console.log("No differences found");
  } else {
    console.log(JSON.stringify(differences, null, 2));
    console.warn(`Found ${differences.length} differences!`);
    // dump the differences to a file
    fs.writeFileSync("diff.json", JSON.stringify(differences, null, 2));
  }
}

/**
 * Processes all rules against the given diff. If no rule confirms or denies
 * an issue, the diff is treated as a failure.
 * @param data the diff data to evaluate.
 * @returns true if the diff is a valid error, false otherwise.
 */
function processRules(data: Diff<any, any>): boolean {
  for (const rule of diffRules) {
    const result = rule(data);
    switch (result) {
      case DiffRuleResult.Violation:
        break;
      case DiffRuleResult.ContinueProcessing:
        continue;
      case DiffRuleResult.Okay:
        // stop processing rules
        console.log(`Rule passed: ${rule.name}`);
        return false;
    }
  }
  console.error(`Unhandled diff: ${JSON.stringify(data, null, 2)}`);
  return true;
}

function processDiff(
  differences: Diff<any, any>[] | undefined
): Diff<any, any>[] {
  const errors: Diff<any, any>[] = [];
  for (const data of differences ?? []) {
    const result = processRules(data);
    if (result) {
      errors.push(data);
    }
  }
  return errors;
}

await main(process.argv);
