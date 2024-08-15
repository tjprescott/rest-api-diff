import pkg, { Diff, DiffDeleted, DiffEdit, DiffNew } from "deep-diff";
import { getApplicableRules, RuleResult } from "./rules/rules.js";
import * as fs from "fs";
import { SwaggerParser } from "./parser.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
const { diff } = pkg;
import { OpenAPIV2 } from "openapi-types";
import { exec } from "child_process";
import * as dotenv from "dotenv";
import { readFile } from "fs/promises";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { joinPaths } from "@typespec/compiler";

dotenv.config();

interface ResultSummary {
  flaggedViolations: number;
  rulesViolated: number | undefined;
  assumedViolations: number;
  unresolvedReferences: number;
  unreferencedObjects: number;
}

// extract package version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = joinPaths(__dirname, "..", "package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));

export const epilogue = `This tool is under active development. If you experience issues or have questions, please contact Travis Prescott directly (trpresco@microsoft.com). [Tool version: ${packageJson.version}]`;

const typespecOutputDir = `${process.cwd()}/tsp-output`;

const args = await yargs(hideBin(process.argv))
  .usage("Usage: $0 --lhs [path...] --rhs [path...]")
  .demandOption(["lhs", "rhs"])
  .epilogue(epilogue)
  .options("lhs", {
    type: "array",
    demandOption: true,
    describe:
      "The files that are the basis for comparison. Can be an array of files or directories. Directories will be crawled for JSON files. Non-Swagger files will be ignored.",
    coerce: (arg) => arg.map(String),
    default: process.env.LHS ? process.env.LHS.split(" ") : undefined,
  })
  .options("rhs", {
    type: "array",
    demandOption: true,
    describe:
      "The files to compare against. Can be an array of files or directories. Directories will be crawled for JSON files. Non-Swagger files will be ignored.",
    coerce: (arg) => arg.map(String),
    default: process.env.RHS ? process.env.RHS.split(" ") : undefined,
  })
  .options("compile-tsp", {
    type: "boolean",
    describe:
      "If TypeSpec files are found, attempt to compile the TypeSpec to Swagger using @typespec-autorest.",
    coerce: (arg) => arg === "true",
    default: process.env.COMPILE_TSP,
  })
  .options("group-violations", {
    type: "boolean",
    describe:
      "Group violations by rule name. If false, will output all violations in a flat collection.",
    coerce: (arg) => arg === "true",
    default: process.env.GROUP_VIOLATIONS,
  })
  .options("output-folder", {
    type: "string",
    describe: "The folder to output artifacts to.",
    default: process.env.OUTPUT_FOLDER ?? "./output",
  })
  .options("typespec-compiler-path", {
    type: "string",
    describe:
      "The path to the TypeSpec compiler. If not provided, will use the globally installed compiler.",
    default: process.env.TYPESPEC_COMPILER_PATH,
  })
  .options("typespec-version-selector", {
    type: "string",
    describe:
      "For multiversion TypeSpec files, the version to generate Swagger for.",
    default: process.env.TYPESPEC_VERSION_SELECTOR,
  })
  .options("preserve-definitions", {
    type: "boolean",
    describe:
      "Preserve defintions, parameters, responses, and securityDefinitions in the output. ",
    coerce: (arg) => arg === "true",
    default: process.env.PRESERVE_DEFINITIONS,
  })
  .options("verbose", {
    type: "boolean",
    describe: "Print verbose output.",
    coerce: (arg) => arg === "true",
    default: process.env.VERBOSE,
  })
  .wrap(120)
  .parse();

// Global error handling
process.on("unhandledRejection", (reason, promise) => {
  console.error(`Unhandled Rejection at: ${promise} reason: ${reason}\n\n`);
  console.error(epilogue);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error(`Uncaught Exception: ${error}\n\n`);
  console.error(epilogue);
  process.exit(1);
});

await main();

/**
 * Loads Swagger files. If the file is not a Swagger file, it will return undefined.
 */
async function loadSwaggerFile(path: string): Promise<any | undefined> {
  const fileContent = fs.readFileSync(path, "utf-8");
  try {
    const jsonContent = JSON.parse(fileContent);
    if (!jsonContent.swagger) {
      return undefined;
    }
    return jsonContent;
  } catch (error) {
    return undefined;
  }
}

async function loadFolder(path: string): Promise<Map<string, any> | undefined> {
  const jsonContents = new Map<string, any>();
  const pathsToLoad = fs.readdirSync(path);
  for (const filepath of pathsToLoad) {
    const fullPath = `${path}/${filepath}`;
    const filePathStats = fs.statSync(fullPath);
    // TODO: For now, don't crawl subdirectories.
    if (filePathStats.isDirectory()) {
      continue;
    }
    const contents = await loadSwaggerFile(fullPath);
    if (contents) {
      jsonContents.set(filepath, contents);
    }
  }
  if (jsonContents.size === 0) {
    return undefined;
  }
  return jsonContents;
}

/**
 * Attempts to compile TypeSpec in a given folder if no Swagger was found.
 */
async function compileTypespec(
  path: string
): Promise<Map<string, any> | undefined> {
  const compilerPath = args["typespec-compiler-path"];
  const isDir = fs.statSync(path).isDirectory();
  if (isDir) {
    // ensure there is a typespec file in the folder
    const files = fs.readdirSync(path);
    const typespecFiles = files.filter((file) => file.endsWith(".tsp"));
    if (typespecFiles.length === 0) {
      return undefined;
    }
  }
  const tspCommand = compilerPath
    ? `node ${compilerPath}/entrypoints/cli.js`
    : "tsp";
  const options = [
    `--option=@azure-tools/typespec-autorest.emitter-output-dir=${typespecOutputDir}`,
    `--option=@azure-tools/typespec-autorest.output-file=openapi.json`,
  ];
  if (args["typespec-version-selector"]) {
    const version = args["typespec-version-selector"];
    options.push(`--option=@azure-tools/typespec-autorest.version=${version}`);
  }
  const command = `${tspCommand} compile ${path} --emit=@azure-tools/typespec-autorest ${options.join(" ")}`;
  const result = await new Promise((resolve, reject) => {
    console.log(`Running: ${command}`);
    exec(command, (error: any, stdout: any, stderr: any) => {
      if (error) {
        const errMessage = stdout === "" ? error : stdout;
        throw new Error(
          `${errMessage}\nError occurred while compiling TypeSpec!`
        );
      }
      console.log(stdout);
      resolve(stdout);
    });
  });
  if (!result) {
    return undefined;
  }
  // if successful, there should be a Swagger file in the folder,
  // so attempt to reload.
  return await loadFolder(typespecOutputDir);
}

async function loadFolderContents(path: string): Promise<Map<string, any>> {
  const compileTsp = args["compile-tsp"];
  const swaggerValues = await loadFolder(path);
  // if compile-tsp is set, always attempt to compile TypeSpec files.
  const typespecValues = compileTsp ? await compileTypespec(path) : undefined;
  if (compileTsp) {
    if (!typespecValues && !swaggerValues) {
      throw new Error(`No Swagger or TypeSpec files found: ${path}`);
    }
    return (typespecValues ?? swaggerValues)!;
  } else {
    if (!swaggerValues) {
      throw new Error(`No Swagger files found: ${path}`);
    }
    return swaggerValues;
  }
}

async function loadFile(path: string): Promise<Map<string, any>> {
  let contents = new Map<string, any>();
  const compileTsp = args["compile-tsp"];
  if (path.endsWith(".tsp") && compileTsp) {
    contents = { ...contents, ...(await compileTypespec(path)) };
  } else if (path.endsWith(".json")) {
    contents.set(path, await loadSwaggerFile(path));
  } else {
    throw new Error(`Unsupported file type: ${path}`);
  }
  if (contents.size === 0) {
    throw new Error(`No content in file: ${path}`);
  }
  return contents;
}

async function loadPaths(paths: string[]): Promise<Map<string, any>> {
  let jsonContents = new Map<string, any>();
  for (const path of paths) {
    if (!validatePath(path)) {
      throw new Error(`Invalid path ${path}`);
    }
    const stats = fs.statSync(path);
    const values = stats.isDirectory()
      ? await loadFolderContents(path)
      : await loadFile(path);
    for (const [key, value] of values.entries()) {
      jsonContents.set(key, value);
    }
  }
  return jsonContents;
}

function validatePath(path: string): boolean {
  try {
    const stats = fs.statSync(path);
    return stats.isFile() || stats.isDirectory();
  } catch (error) {
    return false;
  }
}

async function main() {
  const in1 = args.lhs;
  const in2 = args.rhs;

  let lhsParser = new SwaggerParser(await loadPaths(in1));
  let rhsParser = new SwaggerParser(await loadPaths(in2));
  const lhs = lhsParser.parse().asJSON();
  const rhs = rhsParser.parse().asJSON();

  // sort the diffs into three buckets: flagged violations, assumed violations, and no violations
  const results = processDiff(diff(lhs, rhs), lhs, rhs);
  if (!results) {
    throw new Error(`Error occurred while processing diffs.\n\n${epilogue}`);
  }
  const flaggedViolations = results.flaggedViolations ?? [];
  const assumedViolations = results.assumedViolations ?? [];
  const allViolations = [...flaggedViolations, ...assumedViolations];

  // ensure the output folder exists and is empty
  const outputFolder = args["output-folder"];
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  } else {
    const files = fs.readdirSync(outputFolder);
    for (const file of files) {
      fs.unlinkSync(`${outputFolder}/${file}`);
    }
  }

  // create inverse files that show only the stuff that has been pruned
  // for diagnostic purposes.
  const [lhsInv, rhsInv] = pruneDocuments(lhs, rhs, allViolations);
  fs.writeFileSync(
    `${args["output-folder"]}/lhs-inv.json`,
    JSON.stringify(lhsInv, null, 2)
  );
  fs.writeFileSync(
    `${args["output-folder"]}/rhs-inv.json`,
    JSON.stringify(rhsInv, null, 2)
  );

  // write the raw files to output for debugging purposes
  fs.writeFileSync(
    `${args["output-folder"]}/lhs-raw.json`,
    JSON.stringify(lhs, null, 2)
  );
  fs.writeFileSync(
    `${args["output-folder"]}/rhs-raw.json`,
    JSON.stringify(rhs, null, 2)
  );

  // prune the documents of any paths that are not relevant and
  // output them for visual diffing.
  const [lhsNew, rhsNew] = pruneDocuments(lhs, rhs, results.noViolations);
  fs.writeFileSync(
    `${args["output-folder"]}/lhs.json`,
    JSON.stringify(lhsNew, null, 2)
  );
  fs.writeFileSync(
    `${args["output-folder"]}/rhs.json`,
    JSON.stringify(rhsNew, null, 2)
  );

  // Report unresolved and unreferenced objects
  if (args["verbose"]) {
    console.warn("=== LEFT-HAND SIDE ===");
    lhsParser.reportUnresolvedReferences();
    if (!args["preserve-definitions"]) {
      lhsParser.reportUnreferencedObjects();
    }

    console.warn("\n=== RIGHT-HAND SIDE ===");
    rhsParser.reportUnresolvedReferences();
    if (!args["preserve-definitions"]) {
      rhsParser.reportUnreferencedObjects();
    }
  }

  const groupViolations = args["group-violations"];
  if (allViolations.length === 0) {
    console.log("No differences found");
    return 0;
  }
  // write out the diff.json file based on the grouping preference
  const normalFilename = "diff.json";
  const inverseFilename = "diff-inv.json";
  if (groupViolations) {
    writeGroupedViolations(allViolations, normalFilename);
    writeGroupedViolations(results.noViolations, inverseFilename);
  } else {
    writeFlatViolations(allViolations, normalFilename);
    writeFlatViolations(results.noViolations, inverseFilename);
  }
  // add up the length of each array
  const summary: ResultSummary = {
    flaggedViolations: flaggedViolations.length,
    assumedViolations: assumedViolations.length,
    rulesViolated: groupViolations
      ? new Set(allViolations.map((x) => x.ruleName)).size
      : undefined,
    unresolvedReferences:
      rhsParser.defRegistry.getUnresolvedReferences().length,
    unreferencedObjects: rhsParser.defRegistry.getUnreferencedTotal(),
  };
  console.warn("\n== ISSUES FOUND! ==\n");
  const preserveDefinitions = args["preserve-definitions"];
  if (summary.flaggedViolations) {
    if (summary.rulesViolated) {
      console.warn(
        `Flagged Violations: ${summary.flaggedViolations} across ${summary.rulesViolated} rules`
      );
    } else {
      console.warn(`Flagged Violations: ${summary.flaggedViolations}`);
    }
  }
  if (summary.assumedViolations) {
    console.warn(`Assumed Violations: ${summary.assumedViolations}`);
  }
  if (summary.unresolvedReferences) {
    console.warn(`Unresolved References: ${summary.unresolvedReferences}`);
  }
  if (!preserveDefinitions && summary.unreferencedObjects) {
    console.warn(`Unreferenced Objects: ${summary.unreferencedObjects}`);
  }
  console.warn("\n");
  console.warn(
    `See '${outputFolder}' for details. See 'lhs.json', 'rhs.json' and 'diff.json'.`
  );
  if (
    !preserveDefinitions &&
    (summary.unresolvedReferences || summary.unreferencedObjects)
  ) {
    console.warn(
      "Try running with `--preserve-defintions` to include unreferenced definitions in the comparison"
    );
    if (!args["verbose"]) {
      console.warn("or run with `--verbose` to see more detailed information.");
    }
  }
  console.warn(epilogue);
  return 1;
}

async function writeGroupedViolations(
  differences: DiffItem[],
  filename: string
) {
  const defaultRule = "assumedViolation";
  const groupedDiff: { [key: string]: DiffItem[] } = {};
  for (const diff of differences) {
    const ruleName = diff.ruleName ?? defaultRule;
    if (!groupedDiff[ruleName]) {
      groupedDiff[ruleName] = [];
    }
    groupedDiff[ruleName]?.push(diff);
  }
  const diffPath = `${args["output-folder"]}/${filename}`;
  fs.writeFileSync(diffPath, JSON.stringify(groupedDiff, null, 2));
}

async function writeFlatViolations(differences: DiffItem[], filename: string) {
  const diffPath = `${args["output-folder"]}/${filename}`;
  fs.writeFileSync(diffPath, JSON.stringify(differences, null, 2));
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
  // deep copy the documents
  let lhs = JSON.parse(JSON.stringify(inputLhs));
  let rhs = JSON.parse(JSON.stringify(inputRhs));

  for (const diff of differences ?? []) {
    const path = diff.diff.path;
    if (!path) continue;
    if ((diff.diff as any).lhs !== undefined) {
      lhs = deletePath(lhs, path);
    }
    if ((diff.diff as any).rhs !== undefined) {
      rhs = deletePath(rhs, path);
    }
  }

  // delete some standard collections from the documents
  const preserveDefinitions = args["preserve-definitions"];
  if (!preserveDefinitions) {
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
  rhs: OpenAPIV2.Document
): DiffItem {
  let retVal: any = {
    ruleResult: RuleResult.AssumedViolation,
    ruleName: undefined,
    diff: data,
  };
  const rules = getApplicableRules(args);
  for (const rule of rules) {
    const result = rule(data, lhs, rhs);
    if (Array.isArray(result)) {
      retVal.ruleResult = result[0];
      retVal.ruleName = rule.name;
      retVal.message = result[1];
      break;
    } else if (result === RuleResult.ContinueProcessing) {
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
  ruleResult: RuleResult;
  ruleName?: string;
  message?: string;
  diff: DiffNew<any> | DiffEdit<any, any> | DiffDeleted<any>;
}

export interface DiffResult {
  flaggedViolations: DiffItem[];
  assumedViolations: DiffItem[];
  noViolations: DiffItem[];
}

function processDiff(
  differences: Diff<any, any>[] | undefined,
  lhs: OpenAPIV2.Document,
  rhs: OpenAPIV2.Document
): DiffResult {
  const results: DiffResult = {
    flaggedViolations: [],
    assumedViolations: [],
    noViolations: [],
  };
  for (const data of differences ?? []) {
    if (!isFilterable(data.path!)) continue;
    const result = processRules(data, lhs, rhs);
    switch (result.ruleResult) {
      case RuleResult.AssumedViolation:
        results.assumedViolations.push(result);
        break;
      case RuleResult.FlaggedViolation:
        results.flaggedViolations.push(result);
        break;
      case RuleResult.NoViolation:
        results.noViolations.push(result);
        break;
      default:
        throw new Error(`Unexpected result ${result}`);
    }
  }
  return results;
}
