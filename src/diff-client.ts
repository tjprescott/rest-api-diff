import pkg, { Diff } from "deep-diff";
const { diff } = pkg;
import { SwaggerParser } from "./parser.js";
import {
  getApplicableRules,
  RuleResult,
  RuleSignature,
} from "./rules/rules.js";
import { forceArray, loadPaths } from "./util.js";
import * as fs from "fs";
import {
  DiffItem,
  writeFlatViolations,
  writeGroupedViolations,
} from "./diff-file.js";
import { OpenAPIV2 } from "openapi-types";
import { epilogue } from "./index.js";
import assert from "assert";
import { RegistryKind } from "./definitions.js";

export interface DiffClientConfig {
  lhs: string | string[];
  rhs: string | string[];
  args: any;
  rules?: RuleSignature[];
}

export class DiffClient {
  private args: any;
  private rules: RuleSignature[];
  private lhsParser?: SwaggerParser;
  private rhsParser?: SwaggerParser;
  /** Tracks if shortenKeys has been called to avoid re-running the algorithm needlessly. */
  private keysShortened: boolean = false;

  // Public properties

  /** The parsed lhs document. */
  public lhs?: OpenAPIV2.Document;
  /** The parsed rhs document. */
  public rhs?: OpenAPIV2.Document;
  /** The results of the diff operation. Available once processDiff() called. */
  public diffResults?: DiffResult;
  /** The output files generated by the diff operation. Available once buildOutput() called. */
  public resultFiles?: ResultFiles;

  /** Creates an instance of the DiffClient class asynchronously. */
  static async create(config: DiffClientConfig): Promise<DiffClient> {
    const client = new DiffClient(config);
    const lhs = client.args["lhs"];
    const rhs = client.args["rhs"];
    const lhsRoot =
      config.args["lhs-root"] ?? client.#getDefaultRootPath("lhs", lhs);
    const rhsRoot =
      config.args["rhs-root"] ?? client.#getDefaultRootPath("rhs", rhs);

    const lhsParser = await SwaggerParser.create(lhs, lhsRoot, client.args);
    const rhsParser = await SwaggerParser.create(rhs, rhsRoot, client.args);
    client.lhsParser = lhsParser;
    client.rhsParser = rhsParser;
    return client;
  }

  protected constructor(config: DiffClientConfig) {
    this.args = config.args;
    this.rules = config.rules ?? getApplicableRules(config.args);
    const lhs = forceArray(config.lhs);
    const rhs = forceArray(config.rhs);
    this.args["lhs"] = lhs;
    this.args["rhs"] = rhs;
  }

  /**
   * Parses the documents, expanding them into canonical transformations.
   * Upon completion, the lhs and rhs documents will be available for diffing.
   */
  parse() {
    if (!this.lhsParser || !this.rhsParser) {
      throw new Error(
        "Parsers have not been initialized. Call buildParsers() first."
      );
    }
    this.lhs = this.lhsParser.parse().asJSON();
    this.rhs = this.rhsParser.parse().asJSON();
  }

  /**
   * Updates the parsed documents to shorten their keys.
   * Upon completion, the lhs and rhs should have shortened keys
   * and be ready for diffing.
   */
  shortenKeys() {
    if (this.keysShortened) return;
    const lhs = this.lhs;
    const rhs = this.rhs;

    if (!lhs || !rhs) {
      throw new Error("Documents have not been parsed. Call parse() first.");
    }
    // now that the document is parsed, shorten the keys so they are
    // more likely to match in the diff.
    this.lhs = this.#shortenKeysForDocument(lhs);
    this.rhs = this.#shortenKeysForDocument(rhs);
    this.keysShortened = true;
  }

  /**
   * Runs the deep-diff algorithm on the documents and sorts the results into
   * three categories: flaggedViolations, assumedViolations, and noViolations.
   */
  processDiff() {
    if (!this.lhs || !this.rhs) {
      throw new Error("Documents have not been parsed. Call parse() first.");
    }
    // shorten keys if not already done
    this.shortenKeys();
    const lhs = this.lhs;
    const rhs = this.rhs;
    const diffs = diff(lhs, rhs);
    if (!diffs) {
      throw new Error(`Error occurred while processing diffs.\n\n${epilogue}`);
    }

    const results: DiffResult = {
      flaggedViolations: [],
      assumedViolations: [],
      noViolations: [],
    };
    for (const diffItem of diffs ?? []) {
      const result = this.processRules(diffItem, lhs, rhs);
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
    const resultTotal =
      results.flaggedViolations.length +
      results.assumedViolations.length +
      results.noViolations.length;
    assert(
      resultTotal === diffs.length,
      `Expected ${diffs.length} results, but got ${resultTotal}`
    );
    this.diffResults = results;
  }

  /**
   * Processes all rules against the given diff. If no rule confirms or denies
   * an issue, the diff is treated as a failure.
   * @param data the diff data to evaluate.
   * @returns an allowed DiffRuleResult. Only "ContinueProcessing" is not allowed.
   */
  private processRules(
    data: Diff<any, any>,
    lhs: OpenAPIV2.Document,
    rhs: OpenAPIV2.Document
  ): DiffItem {
    let retVal: DiffItem = {
      ruleResult: RuleResult.AssumedViolation,
      ruleName: undefined,
      diff: data,
    };
    for (const rule of this.rules) {
      const result = rule(data, lhs, rhs);
      if (result === undefined) {
        continue;
      } else if (Array.isArray(result)) {
        retVal.ruleResult = result[0];
        retVal.ruleName = rule.name;
        retVal.message = result[1];
        break;
      } else {
        retVal.ruleResult = result;
        retVal.ruleName = rule.name;
        break;
      }
    }
    return retVal as DiffItem;
  }

  /**
   * Constructs the output files based on the diff results.
   */
  buildOutput() {
    if (!this.lhs || !this.rhs || !this.diffResults) {
      throw new Error(
        "Documents have not been parsed. Call processDiff() first."
      );
    }
    const flaggedViolations = this.diffResults.flaggedViolations ?? [];
    const assumedViolations = this.diffResults.assumedViolations ?? [];
    const allViolations = [...flaggedViolations, ...assumedViolations];

    this.resultFiles = {
      raw: [this.lhs, this.rhs],
      normal: this.#pruneDocuments(
        this.lhs,
        this.rhs,
        this.diffResults.noViolations
      ),
      inverse: this.#pruneDocuments(this.lhs, this.rhs, allViolations),
    };
  }

  /** Write results to output files and print summary to console. */
  writeOutput() {
    if (!this.resultFiles) {
      throw new Error(
        "Output files have not been built. Call buildOutput() first."
      );
    }
    if (!this.diffResults) {
      throw new Error(
        "Diff results have not been processed. Call processDiff() first."
      );
    }
    if (!this.lhsParser || !this.rhsParser) {
      throw new Error(
        "Parsers have not been initialized. Call buildParsers() first."
      );
    }
    const results = this.resultFiles;
    // ensure the output folder exists and is empty
    const outputFolder = this.args["output-folder"];
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
    fs.writeFileSync(
      `${outputFolder}/lhs-inv.json`,
      JSON.stringify(results.inverse[0], null, 2)
    );
    fs.writeFileSync(
      `${outputFolder}/rhs-inv.json`,
      JSON.stringify(results.inverse[1], null, 2)
    );
    // write the raw files to output for debugging purposes
    fs.writeFileSync(
      `${outputFolder}/lhs-raw.json`,
      JSON.stringify(results.raw[0], null, 2)
    );
    fs.writeFileSync(
      `${outputFolder}/rhs-raw.json`,
      JSON.stringify(results.raw[1], null, 2)
    );
    // prune the documents of any paths that are not relevant and
    // output them for visual diffing.
    fs.writeFileSync(
      `${outputFolder}/lhs.json`,
      JSON.stringify(results.normal[0], null, 2)
    );
    fs.writeFileSync(
      `${outputFolder}/rhs.json`,
      JSON.stringify(results.normal[1], null, 2)
    );
    // Report unresolved and unreferenced objects
    if (this.args["verbose"]) {
      console.warn("=== LEFT-HAND SIDE ===");
      this.#reportUnresolvedReferences(this.lhsParser);
      if (!this.args["preserve-definitions"]) {
        this.#reportUnreferencedObjects(this.lhsParser);
      }
      console.warn("\n=== RIGHT-HAND SIDE ===");
      this.#reportUnresolvedReferences(this.rhsParser);
      if (!this.args["preserve-definitions"]) {
        this.#reportUnreferencedObjects(this.rhsParser);
      }
    }
    const groupViolations = this.args["group-violations"];
    const allViolations = [
      ...(this.diffResults?.assumedViolations ?? []),
      ...(this.diffResults?.flaggedViolations ?? []),
    ];
    if (allViolations.length === 0) {
      console.log("No violations found");
      return 0;
    }
    // write out the diff.json file based on the grouping preference
    const normalPath = `${outputFolder}/diff.json`;
    const inversePath = `${outputFolder}/diff-inv.json`;
    if (groupViolations) {
      writeGroupedViolations(allViolations, normalPath);
      writeGroupedViolations(this.diffResults.noViolations, inversePath);
    } else {
      writeFlatViolations(allViolations, normalPath);
      writeFlatViolations(this.diffResults.noViolations, inversePath);
    }
    // add up the length of each array
    const summary: ResultSummary = {
      flaggedViolations: this.diffResults.flaggedViolations.length,
      assumedViolations: this.diffResults.assumedViolations.length,
      rulesViolated: groupViolations
        ? new Set(allViolations.map((x) => x.ruleName)).size
        : undefined,
      unresolvedReferences: this.rhsParser.getUnresolvedReferences().length,
      unreferencedObjects: this.rhsParser.getUnreferencedTotal(),
    };
    console.warn("\n== ISSUES FOUND! ==\n");
    const preserveDefinitions = this.args["preserve-definitions"];
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
      if (!this.args["verbose"]) {
        console.warn(
          "or run with `--verbose` to see more detailed information."
        );
      }
    }
  }

  /** Logs a message to console if --verbose is set. */
  #logIfVerbose(message: string) {
    if (this.args["verbose"]) {
      console.log(message);
    }
  }

  /**
   * Applies a heuristic to attempt to automatically resolve a root path and
   * avoid having to specify --lhs-root or --rhs-root.
   * @param side the side to get the default root path for. Used for the logging message only.
   * @param paths the paths to use to determine the default root path.
   */
  #getDefaultRootPath(side: "lhs" | "rhs", paths: string[]): string {
    let defaultPath: string = "";
    if (paths.length === 1) {
      // if the one path is a file, use the folder, otherwise use the path
      const stat = fs.statSync(paths[0]);
      if (stat.isDirectory()) {
        defaultPath = paths[0];
      } else {
        defaultPath = process.cwd();
        //defaultPath = paths[0].split("/").slice(0, -1).join("/");
      }
    } else {
      defaultPath = process.cwd();
    }
    this.#logIfVerbose(`Default ${side} root path: ${defaultPath}`);
    return defaultPath;
  }

  /**
   * Shortens certain keys that need to be expanded for parsing but should be
   * shorted for diffing purposes.
   * @param source the source document to shorten keys for
   * @returns a new document with shortened keys
   */
  #shortenKeysForDocument(source: OpenAPIV2.Document): OpenAPIV2.Document {
    // deep copy the documents
    let doc = JSON.parse(JSON.stringify(source));

    const keysToShorten = [
      "definitions",
      "parameters",
      "responses",
      "securityDefinitions",
    ];

    for (const key of keysToShorten) {
      const coll = doc[key];
      // update each key to only take the name after the last forward slash
      if (coll) {
        const updatedColl: any = {};
        for (const [key, val] of Object.entries(coll)) {
          const shortenedKey = key.split("/").pop()!;
          updatedColl[shortenedKey] = val;
        }
        doc[key] = updatedColl;
      }
    }
    return doc;
  }

  /**
   * Returns a copy of the provided document with the specified
   * paths removed.
   */
  #deletePaths(doc: OpenAPIV2.Document, paths: string[][]): OpenAPIV2.Document {
    const copy = { ...doc };
    for (const path of paths) {
      // reset to document root
      let current = copy;
      const lastSegment = path.length - 1;
      for (let i = 0; i < lastSegment; i++) {
        const segment = path[i];
        current = (current as any)[segment];
      }
      delete (current as any)[path[lastSegment]];
    }
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
  #pruneDocuments(
    inputLhs: OpenAPIV2.Document,
    inputRhs: OpenAPIV2.Document,
    differences: DiffItem[]
  ): [OpenAPIV2.Document, OpenAPIV2.Document] {
    // deep copy the documents
    let lhs = JSON.parse(JSON.stringify(inputLhs));
    let rhs = JSON.parse(JSON.stringify(inputRhs));

    const lhsDiffs = differences.filter(
      (x) => (x.diff as any).lhs !== undefined
    );
    const rhsDiffs = differences.filter(
      (x) => (x.diff as any).rhs !== undefined
    );
    lhs = this.#deletePaths(
      lhs,
      lhsDiffs.map((x) => x.diff.path!)
    );
    rhs = this.#deletePaths(
      rhs,
      rhsDiffs.map((x) => x.diff.path!)
    );

    // delete some standard collections from the documents
    const preserveDefinitions = this.args["preserve-definitions"];
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

  #reportUnresolvedReferences(parser: SwaggerParser): void {
    const unresolvedReferences = parser.getUnresolvedReferences();
    if (unresolvedReferences.length > 0) {
      console.warn(
        `== UNRESOLVED REFERENCES == (${unresolvedReferences.length})\n\n`
      );
      console.warn(`${unresolvedReferences.join("\n")}`);
    }
  }

  #reportUnreferencedObjects(parser: SwaggerParser): void {
    const unreferencedDefinitions = parser.getUnreferenced();
    // We don't care about unused security definitions because we don't really
    // use them in Azure. (We will still diff them though)
    unreferencedDefinitions.delete(RegistryKind.SecurityDefinition);
    if (unreferencedDefinitions.size > 0) {
      let total = 0;
      for (const value of unreferencedDefinitions.values()) {
        total += value.length;
      }
      console.warn(`\n== UNREFERENCED DEFINITIONS == (${total})\n`);
    }
    for (const [key, value] of unreferencedDefinitions.entries()) {
      if (value.length > 0) {
        console.warn(
          `\n**${RegistryKind[key]}** (${value.length})\n\n${value.join("\n")}`
        );
      }
    }
  }
}

interface DiffResult {
  flaggedViolations: DiffItem[];
  assumedViolations: DiffItem[];
  noViolations: DiffItem[];
}

interface ResultFiles {
  raw: [any, any];
  normal: [any, any];
  inverse: [any, any];
}

interface ResultSummary {
  flaggedViolations: number;
  rulesViolated: number | undefined;
  assumedViolations: number;
  unresolvedReferences: number;
  unreferencedObjects: number;
}
