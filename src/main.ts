import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { VERSION } from "./version.js";
import { DiffClient } from "./diff-client.js";
import * as dotenv from "dotenv";

dotenv.config({
  override: true,
});

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
  .options("group-violations", {
    type: "boolean",
    describe:
      "Group violations by rule name. Assumed violations will be grouped into generated groups with the '(AUTO)' suffix. Otherwise, will output all violations in a flat collection.",
    default: process.env.GROUP_VIOLATIONS,
  })
  .options("output-folder", {
    type: "string",
    describe: "The folder to output artifacts to.",
    default: process.env.OUTPUT_FOLDER ?? "./output",
  })
  .options("flatten-paths", {
    type: "boolean",
    describe:
      "Flatten paths in the output from an array of segments to a single line.",
    default: process.env.FLATTEN_PATHS,
  })
  .options("preserve-definitions", {
    type: "boolean",
    describe:
      "Preserve defintions, parameters, responses, and securityDefinitions in the output. ",
    default: process.env.PRESERVE_DEFINITIONS,
  })
  .options("verbose", {
    type: "boolean",
    describe: "Print verbose output.",
    default: process.env.VERBOSE,
  })
  .options("suppressions", {
    type: "string",
    describe: "Path to a YAML file containing suppressions.",
    default: process.env.SUPPRESSIONS,
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

export async function main() {
  const client = await DiffClient.create({
    lhs: args.lhs,
    rhs: args.rhs,
    args: args,
  });
  client.parse();
  client.processDiff();
  client.buildOutput();
  client.writeOutput();
  console.warn(epilogue);
  return 1;
}
