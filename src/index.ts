import { Diff, diff } from "deep-diff";
import { DefinitionMetadata } from "./definitions.js";
import * as fs from "fs";
import { RuleResult, RuleSignature } from "./rules/rules.js";

const rules: RuleSignature[] = [];

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
    const name = path.split("/").pop()!.split(".")[0];
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

  const raw1 = await loadJsonContents(in1);
  const raw2 = await loadJsonContents(in2);
  const lhs = expandSwagger(raw1);
  const rhs = expandSwagger(raw2);

  // diff the output
  const differences = diff(lhs, rhs);

  processDiff(differences);

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

  // Gather all of the defintions which we will use to resolve references.
  const definitions = new Map<string, DefinitionMetadata>();
  for (const [filename, data] of swaggerMap.entries()) {
    const defs = data.definitions ?? {};
    for (const [name, value] of Object.entries(defs)) {
      definitions.set(name, {
        name,
        value: visit(value),
        original: value,
        source: filename,
      });
    }
  }

  unresolvedReferences.clear();
  for (const [name, value] of definitions.entries()) {
    const expanded = visit(value.value);
    definitions.set(name, { ...value, value: expanded });
  }

  function isReference(value: any): boolean {
    return Object.keys(value).includes("$ref");
  }

  function parseReference(
    ref: string
  ): { name: string; path?: string } | undefined {
    const regex = /(.+\.json)?#\/definitions\/(.+)/;
    const match = ref.match(regex);
    if (!match) {
      return undefined;
    }
    return {
      path: match[1],
      name: match[2],
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
    const match = definitions.get(refResult.name);
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

  function visit(obj: any): any {
    let result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // skip definitions since we process them separately
      if (key === "definitions") {
        continue;
      }
      if (value === null) {
        throw new Error("Unexpected null value found");
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
    result = visit(data);
  }
  console.warn(
    `Unresolved references: ${Array.from(unresolvedReferences).join(", ")}`
  );
  return result;
}

function processDiff(differences: Diff<any, any>[] | undefined) {
  if (!differences) {
    return;
  }
  for (const data of differences) {
    for (const rule of rules) {
      const result = rule(data);
      switch (result) {
        case RuleResult.Violation:
          break;
        case RuleResult.ContinueProcessing:
          break;
        case RuleResult.Okay:
          console.log(`Rule passed: ${rule.name}`);
          break;
      }
    }
  }
}

await main(process.argv);
