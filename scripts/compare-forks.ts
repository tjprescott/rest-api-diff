#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync, spawnSync } from "child_process";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as dotenv from "dotenv";

dotenv.config();

const REST_API_SPECS_REPO = process.env.REST_API_SPECS_REPO;
if (!REST_API_SPECS_REPO) {
  console.error("REST_API_SPECS_REPO environment variable is not set.");
  process.exit(1);
}

const argv = yargs(hideBin(process.argv))
  .option("target", {
    type: "string",
    demandOption: true,
    describe:
      "Target in the form <fork-url>:<branch>, <github-username>:<branch>, or just <branch> (uses Azure repo if no fork)",
  })
  .option("service-path", {
    type: "string",
    demandOption: true,
    describe: "Path to the service directory to copy",
  })
  .help().argv as unknown as { target: string; servicePath: string };

// Parse target for fork and branch
let forkUrl = "https://github.com/Azure/azure-rest-api-specs.git";
let branch = argv.target;

if (argv.target.includes(":")) {
  const [fork, br] = argv.target.split(":");
  branch = br;
  if (/^https?:\/\//.test(fork)) {
    forkUrl = fork;
  } else if (/^[\w-]+$/.test(fork)) {
    forkUrl = `https://github.com/${fork}/azure-rest-api-specs.git`;
  } else {
    console.error(`Invalid fork value: ${fork}`);
    process.exit(1);
  }
}

// Compute relative and destination paths
const relServicePath = path.normalize(argv.servicePath);
const destServicePath = path.join(
  REST_API_SPECS_REPO,
  relServicePath.replace(/(\\|\/)(stable|preview)(\\|\/)/, "$1test$3")
);

// If the destination already exists, print a message but do not exit
if (fs.existsSync(destServicePath)) {
  console.log(`Destination path already exists: ${destServicePath}`);
  console.log("Proceeding to run rest-api-diff...");
} else {
  // Clone and copy logic here
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rest-api-specs-"));
  try {
    console.log(`Cloning ${forkUrl} (branch: ${branch}) to ${tempDir}...`);
    execSync(
      `git clone --no-tags --depth 1 --branch ${branch} --single-branch ${forkUrl} "${tempDir}"`,
      { stdio: "inherit" }
    );
  } catch (err: any) {
    console.error(
      `Failed to clone branch '${branch}' from '${forkUrl}'.\n` +
        `Error: ${err.message}`
    );
    process.exit(1);
  }

  // Source path is always from the temp (cloned) repo
  const srcServicePath = path.join(tempDir, relServicePath);

  // Ensure the destination directory exists
  fs.mkdirSync(path.dirname(destServicePath), { recursive: true });

  /**
   * Recursively copy files and directories from src to dest
   */
  function copyRecursive(src: string, dest: string) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src)) {
        copyRecursive(path.join(src, entry), path.join(dest, entry));
      }
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  console.log(
    `Copying ${srcServicePath} to ${destServicePath} (with 'stable' replaced by 'test')...`
  );
  copyRecursive(srcServicePath, destServicePath);
}

// Compute the original and test service paths
const lhsServicePath = path.join(REST_API_SPECS_REPO, relServicePath);
const rhsServicePath = destServicePath;

// Check that both exist before running rest-api-diff
if (!fs.existsSync(lhsServicePath)) {
  console.error(`LHS path does not exist: ${lhsServicePath}`);
  process.exit(1);
}
if (!fs.existsSync(rhsServicePath)) {
  console.error(`RHS path does not exist: ${rhsServicePath}`);
  process.exit(1);
}

// Run rest-api-diff
console.log(
  `Running rest-api-diff --lhs "${lhsServicePath}" --rhs "${rhsServicePath}" ...`
);
const result = spawnSync(
  "npx",
  ["rest-api-diff", "--lhs", lhsServicePath, "--rhs", rhsServicePath],
  { stdio: "inherit", shell: true }
);

if (result.status !== 0) {
  console.error("rest-api-diff failed.");
  process.exit(result.status ?? 1);
}

console.log("rest-api-diff completed successfully.");
