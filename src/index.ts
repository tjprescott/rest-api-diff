import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as dotenv from "dotenv";
import { VERSION } from "./version.js";
import { DiffClient } from "./diff-client.js";

dotenv.config();

export const epilogue = `This tool is under active development. If you experience issues or have questions, please contact Travis Prescott directly (trpresco@microsoft.com). [Tool version: ${VERSION}]`;

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
  .options("lhs-root", {
    type: "string",
    describe:
      "The root path to use when resolving relative LHS file references. If only one value is specified, assumes that. Otherwise, assumes cwd.",
    default: process.env.LHS_ROOT,
  })
  .options("rhs-root", {
    type: "string",
    describe:
      "The root path to use when resolving relative RHS file references. If only one value is specified, assumes that. Otherwise, assumes cwd.",
    default: process.env.RHS_ROOT,
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

async function main() {
  const client = new DiffClient({
    lhs: args.lhs,
    rhs: args.rhs,
    args: args,
  });
  await client.buildParsers();
  client.parse();
  client.processDiff();
  const diffResults = client.diffResults;
  console.warn(epilogue);
  return 1;
}
