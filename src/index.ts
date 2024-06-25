import pkg, { Diff } from "deep-diff";
import { DefinitionMetadata } from "./definitions.js";
import { RuleResult, rules, RuleSignature } from "./rules/rules.js";
import * as fs from "fs";
import { ignoredPropertiesRule } from "./rules/ignored-properties.js";
import { ignoreDescriptionRule } from "./rules/ignore-description.js";
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

  const lhs = expandSwagger(await loadJsonContents(in1));
  const rhs = expandSwagger(await loadJsonContents(in2));
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
 * Expands one or more Swagger objects into a more diffable format.
 * Preserves all original keys and data, but replaces references and
 * combines all files into a single canonical format.
 * @param swaggerMap the input Swagger data
 */
function expandSwagger(swaggerMap: Map<string, any>): any {
  let result: any = {};
  let unresolvedReferences = new Set<string>();

  // TODO: Need to ingest examples and common types

  const definitions = new Map<string, DefinitionMetadata>();
  const parameters = new Map<string, any>();
  const responses = new Map<string, any>();
  for (const [filename, data] of swaggerMap.entries()) {
    // Gather definitions
    for (const [name, value] of Object.entries(data.definitions ?? {})) {
      if (definitions.has(name)) {
        throw new Error(`Duplicate definition: ${name}`);
      }
      definitions.set(name, {
        name,
        value: visit(value),
        original: value,
        source: filename,
      });
    }
    // Gather parameter definitions
    for (const [name, value] of Object.entries(data.parameters ?? {})) {
      if (parameters.has(name)) {
        throw new Error(`Duplicate parameter: ${name}`);
      }
      parameters.set(name, visit(value));
    }
    // Gather responses
    for (const [name, value] of Object.entries(data.responses ?? {})) {
      if (responses.has(name)) {
        throw new Error(`Duplicate response: ${name}`);
      }
      responses.set(name, visit(value));
    }
  }

  // Second path through should clear up any unresolved forward references.
  // It will NOT solve any circular references!
  unresolvedReferences.clear();
  for (const [name, value] of definitions.entries()) {
    const expanded = visit(value.value);
    definitions.set(name, { ...value, value: expanded });
  }
  for (const [name, value] of parameters.entries()) {
    const expanded = visit(value);
    parameters.set(name, expanded);
  }
  for (const [name, value] of responses.entries()) {
    const expanded = visit(value);
    responses.set(name, expanded);
  }

  function isReference(value: any): boolean {
    return Object.keys(value).includes("$ref");
  }

  function parseReference(ref: string):
    | {
        name: string;
        registry: string;
        path?: string;
      }
    | undefined {
    const regex = /(.+\.json)?#\/(.+)\/(.+)/;
    const match = ref.match(regex);
    if (!match) {
      return undefined;
    }
    return {
      path: match[1],
      registry: match[2],
      name: match[3],
    };
  }

  function handleReference(ref: string): any | undefined {
    const refResult = parseReference(ref);
    if (!refResult) {
      unresolvedReferences.add(ref);
      return {
        $ref: ref,
      };
    }
    let match: any;
    switch (refResult.registry) {
      case "definitions":
        match = definitions.get(refResult.name);
        break;
      case "parameters":
        match = parameters.get(refResult.name);
        break;
      case "responses":
        match = responses.get(refResult.name);
        break;
      default:
        unresolvedReferences.add(ref);
        return {
          $ref: ref,
        };
    }
    if (match) {
      return match.value;
    } else {
      // keep a reference so we can resolve on a subsequent pass
      unresolvedReferences.add(refResult.name);
      return {
        $ref: ref,
      };
    }
  }

  function visitArray(value: any[]): any {
    // visit array objects but not arrays of primitives
    if (value.length > 0 && typeof value[0] === "object") {
      return value.map((v) => visitObject(v));
    } else {
      return value;
    }
  }

  function visitObject(value: any): any {
    if (!isReference(value)) {
      return visit(value);
    } else {
      // get the value of the $ref key
      const ref = (value as any)["$ref"];
      return handleReference(ref);
    }
  }

  function normalizePath(path: string): string {
    let pathComponents = path.split("/");
    for (const comp of pathComponents) {
      // if comp is surrounded by curly braces, normalize the name
      const match = comp.match(/{(.+)}/);
      if (match) {
        // delete all non-alphanumeric characters and force to lowercase
        const newName = match[1].replace(/\W/g, "").toLowerCase();
        pathComponents[pathComponents.indexOf(comp)] = `{${newName}}`;
      }
    }
    return pathComponents.join("/");
  }

  function visitPaths(value: any): any {
    let result: any = {};
    for (const [path, pathValue] of Object.entries(value)) {
      // normalize the path to coerce the naming convention
      const normalizedPath = normalizePath(path);
      result[normalizedPath] = visitObject(pathValue);
    }
    return result;
  }

  function visit(obj: any): any {
    if (!obj) {
      return obj;
    }
    let result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "paths") {
        result[key] = visitPaths(value);
      } else if (Array.isArray(value)) {
        result[key] = visitArray(value);
      } else if (typeof value === "object") {
        result[key] = visitObject(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  // Traverse the object and find any "$ref" keys. Replace them with the actual
  // data they reference.
  for (const [filename, data] of swaggerMap.entries()) {
    result = { ...result, ...visit(data) };
  }
  console.warn(
    `Unresolved references: ${Array.from(unresolvedReferences).join(", ")}`
  );
  return result;
}

/**
 * Processes all rules against the given diff. If no rule confirms or denies
 * an issue, the diff is treated as a failure.
 * @param data the diff data to evaluate.
 * @returns true if the diff is a valid error, false otherwise.
 */
function processRules(data: Diff<any, any>): boolean {
  for (const rule of rules) {
    const result = rule(data);
    switch (result) {
      case RuleResult.Violation:
        break;
      case RuleResult.ContinueProcessing:
        continue;
      case RuleResult.Okay:
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
