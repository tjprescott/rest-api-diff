import * as fs from "fs";

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
    const name = path.split("/").pop()!.split(".")[0];
    jsonContents.set(name, await loadJsonFile(`${path}/${filepath}`));
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
  const in1 = args[2] ?? "A";
  const in2 = args[3] ?? "B";

  // Ensure that input1 and input2 are provided
  if (!in1 || !in2) {
    console.error("error: Two inputs are required!");
    console.error("error: npm start [A] [B]");
    process.exit(1);
  }

  const raw1 = await loadJsonContents(in1);
  const raw2 = await loadJsonContents(in2);
  const exp1 = expandSwagger(raw1);
  const exp2 = expandSwagger(raw2);
  // TODO: Now diff them
}

/**
 * Expands one or more Swagger objects into a more diffable format.
 * Preserves all original keys and data, but replaces references and
 * combines all files into a single canonical format.
 * @param swaggerMap the input Swagger data
 */
function expandSwagger(swaggerMap: Map<string, any>): any {
  let result: any = {};
  // gather all of the defintions which we will use to resolve references
  const definitions = new Map<string, Map<string, any>>();
  for (const [filename, data] of swaggerMap.entries()) {
    if (data.definitions) {
      definitions.set(filename, data.definitions);
    }
  }

  function visit(obj: any): any {
    let result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "produces") {
        let test = "best";
      }
      if (value === null) {
        throw new Error("Unexpected null value found");
      } else if (Array.isArray(value)) {
        // visit array objects but not arrays of primitives
        if (value.length > 0 && typeof value[0] === "object") {
          result[key] = value.map((v) => visit(v));
        } else {
          result[key] = value;
        }
      } else if (typeof value === "object") {
        const objectKeys = Object.keys(value);
        if (objectKeys.includes("$ref")) {
          // TODO: Handle ref
          result[key] = value;
        } else {
          result[key] = visit(value);
        }
      } else {
        // primitives and literals
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
  return result;
}

await main(process.argv);
