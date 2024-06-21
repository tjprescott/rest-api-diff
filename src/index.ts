import * as process from "process";
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
  for (const path of pathsToLoad) {
    const name = path.split("/").pop()!.split(".")[0];
    jsonContents.set(name, loadJsonFile(path));
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

function main(args: string[]): void {
  // TODO: Eliminate defaults
  const in1 = args[1] ?? "A";
  const in2 = args[2] ?? "B";

  // Ensure that input1 and input2 are provided
  if (!in1 || !in2) {
    console.error("error: Two inputs are required!");
    console.error("error: npm start [A] [B]");
    process.exit(1);
  }

  const input1 = loadJsonContents(in1);
  const input2 = loadJsonContents(in2);
  let test = "best";
}

main(process.argv);
