import pkg, { Diff } from "deep-diff";
const { diff } = pkg;
import { SwaggerParser } from "./parser.js";
import {
  getApplicableRules,
  RuleResult,
  RuleSignature,
} from "./rules/rules.js";
import { loadPaths } from "./util.js";
import * as fs from "fs";
import {
  DiffItem,
  writeFlatViolations,
  writeGroupedViolations,
} from "./diff-file.js";
import { OpenAPIV2 } from "openapi-types";
import { epilogue } from "./index.js";
import assert from "assert";

export interface DiffClientConfig {
  lhs: string | string[];
  rhs: string | string[];
  args: any;
  rules?: RuleSignature[];
}

export class DiffClient {
  private args: any;
  private rules: RuleSignature[];
  private lhsRoot: string;
  private rhsRoot: string;
  private lhsParser?: SwaggerParser;
  private rhsParser?: SwaggerParser;

  // Public properties

  /** The parsed lhs document. */
  public lhs?: OpenAPIV2.Document;
  /** The parsed rhs document. */
  public rhs?: OpenAPIV2.Document;
  /** The results of the diff operation. Available once processDiff() called. */
  public diffResults?: DiffResult;

  /** Tracks if shortenKeys has been called to avoid re-running the algorithm needlessly. */
  private keysShortened: boolean = false;

  constructor(config: DiffClientConfig) {
    this.args = config.args;
    this.rules = config.rules ?? getApplicableRules(config.args);
    const lhs = [...config.lhs];
    const rhs = [...config.rhs];
    this.args["lhs"] = lhs;
    this.args["rhs"] = rhs;
    this.lhsRoot =
      config.args["lhs-root"] ?? this.getDefaultRootPath("lhs", lhs);
    this.rhsRoot =
      config.args["rhs-root"] ?? this.getDefaultRootPath("rhs", rhs);
  }

  /**
   * Creates and initializes the parsers for the LHS and RHS documents. Upon
   * completion, the parsers and their definition registries will be ready
   * for use.
   */
  async buildParsers() {
    const lhsPaths = this.args["lhs"];
    const rhsPaths = this.args["rhs"];
    let lhsParser = new SwaggerParser(
      await loadPaths(lhsPaths, this.args),
      this.lhsRoot,
      this.args
    );
    await lhsParser.updateDiscoveredReferences();
    let rhsParser = new SwaggerParser(
      await loadPaths(rhsPaths, this.args),
      this.rhsRoot,
      this.args
    );
    await rhsParser.updateDiscoveredReferences();
    this.lhsParser = lhsParser;
    this.rhsParser = rhsParser;
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
    this.lhs = this.shortenKeysForDocument(lhs);
    this.rhs = this.shortenKeysForDocument(rhs);
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

  //   const flaggedViolations = results.flaggedViolations ?? [];
  //   const assumedViolations = results.assumedViolations ?? [];
  //   const allViolations = [...flaggedViolations, ...assumedViolations];

  //   // ensure the output folder exists and is empty
  //   const outputFolder = this.args["output-folder"];
  //   if (!fs.existsSync(outputFolder)) {
  //     fs.mkdirSync(outputFolder);
  //   } else {
  //     const files = fs.readdirSync(outputFolder);
  //     for (const file of files) {
  //       fs.unlinkSync(`${outputFolder}/${file}`);
  //     }
  //   }

  //   // create inverse files that show only the stuff that has been pruned
  //   // for diagnostic purposes.
  //   const [lhsInv, rhsInv] = pruneDocuments(lhs, rhs, allViolations);
  //   fs.writeFileSync(
  //     `${outputFolder}/lhs-inv.json`,
  //     JSON.stringify(lhsInv, null, 2)
  //   );
  //   fs.writeFileSync(
  //     `${outputFolder}/rhs-inv.json`,
  //     JSON.stringify(rhsInv, null, 2)
  //   );

  //   // write the raw files to output for debugging purposes
  //   fs.writeFileSync(
  //     `${outputFolder}/lhs-raw.json`,
  //     JSON.stringify(lhs, null, 2)
  //   );
  //   fs.writeFileSync(
  //     `${outputFolder}/rhs-raw.json`,
  //     JSON.stringify(rhs, null, 2)
  //   );

  //   // prune the documents of any paths that are not relevant and
  //   // output them for visual diffing.
  //   const [lhsNew, rhsNew] = pruneDocuments(lhs, rhs, results.noViolations);
  //   fs.writeFileSync(
  //     `${outputFolder}/lhs.json`,
  //     JSON.stringify(lhsNew, null, 2)
  //   );
  //   fs.writeFileSync(
  //     `${outputFolder}/rhs.json`,
  //     JSON.stringify(rhsNew, null, 2)
  //   );

  //   // Report unresolved and unreferenced objects
  //   if (this.args["verbose"]) {
  //     console.warn("=== LEFT-HAND SIDE ===");
  //     lhsParser.reportUnresolvedReferences();
  //     if (!this.args["preserve-definitions"]) {
  //       lhsParser.reportUnreferencedObjects();
  //     }

  //     console.warn("\n=== RIGHT-HAND SIDE ===");
  //     rhsParser.reportUnresolvedReferences();
  //     if (!this.args["preserve-definitions"]) {
  //       rhsParser.reportUnreferencedObjects();
  //     }
  //   }

  //   const groupViolations = this.args["group-violations"];
  //   if (allViolations.length === 0) {
  //     console.log("No differences found");
  //     return 0;
  //   }
  //   // write out the diff.json file based on the grouping preference
  //   const normalPath = `${outputFolder}/diff.json`;
  //   const inversePath = `${outputFolder}/diff-inv.json`;
  //   if (groupViolations) {
  //     writeGroupedViolations(allViolations, normalPath);
  //     writeGroupedViolations(results.noViolations, inversePath);
  //   } else {
  //     writeFlatViolations(allViolations, normalPath);
  //     writeFlatViolations(results.noViolations, inversePath);
  //   }
  //   // add up the length of each array
  //   const summary: ResultSummary = {
  //     flaggedViolations: flaggedViolations.length,
  //     assumedViolations: assumedViolations.length,
  //     rulesViolated: groupViolations
  //       ? new Set(allViolations.map((x) => x.ruleName)).size
  //       : undefined,
  //     unresolvedReferences:
  //       rhsParser.defRegistry.getUnresolvedReferences().length,
  //     unreferencedObjects: rhsParser.defRegistry.getUnreferencedTotal(),
  //   };
  //   console.warn("\n== ISSUES FOUND! ==\n");
  //   const preserveDefinitions = this.args["preserve-definitions"];
  //   if (summary.flaggedViolations) {
  //     if (summary.rulesViolated) {
  //       console.warn(
  //         `Flagged Violations: ${summary.flaggedViolations} across ${summary.rulesViolated} rules`
  //       );
  //     } else {
  //       console.warn(`Flagged Violations: ${summary.flaggedViolations}`);
  //     }
  //   }
  //   if (summary.assumedViolations) {
  //     console.warn(`Assumed Violations: ${summary.assumedViolations}`);
  //   }
  //   if (summary.unresolvedReferences) {
  //     console.warn(`Unresolved References: ${summary.unresolvedReferences}`);
  //   }
  //   if (!preserveDefinitions && summary.unreferencedObjects) {
  //     console.warn(`Unreferenced Objects: ${summary.unreferencedObjects}`);
  //   }
  //   console.warn("\n");
  //   console.warn(
  //     `See '${outputFolder}' for details. See 'lhs.json', 'rhs.json' and 'diff.json'.`
  //   );
  //   if (
  //     !preserveDefinitions &&
  //     (summary.unresolvedReferences || summary.unreferencedObjects)
  //   ) {
  //     console.warn(
  //       "Try running with `--preserve-defintions` to include unreferenced definitions in the comparison"
  //     );
  //     if (!this.args["verbose"]) {
  //       console.warn(
  //         "or run with `--verbose` to see more detailed information."
  //       );
  //     }
  //   }
  // }

  /** Logs a message to console if --verbose is set. */
  private logIfVerbose(message: string) {
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
  private getDefaultRootPath(side: "lhs" | "rhs", paths: string[]): string {
    let defaultPath: string = "";
    if (paths.length === 1) {
      // if the one path is a file, use the folder, otherwise use the path
      const stat = fs.statSync(paths[0]);
      if (stat.isDirectory()) {
        defaultPath = paths[0];
      } else {
        defaultPath = paths[0].split("/").slice(0, -1).join("/");
      }
    } else {
      defaultPath = process.cwd();
    }
    this.logIfVerbose(`Default ${side} root path: ${defaultPath}`);
    return defaultPath;
  }

  /**
   * Shortens certain keys that need to be expanded for parsing but should be
   * shorted for diffing purposes.
   * @param source the source document to shorten keys for
   * @returns a new document with shortened keys
   */
  private shortenKeysForDocument(
    source: OpenAPIV2.Document
  ): OpenAPIV2.Document {
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
  private deletePaths(
    doc: OpenAPIV2.Document,
    paths: string[][]
  ): OpenAPIV2.Document {
    const copy = { ...doc };
    let current = copy;
    for (const path of paths) {
      const lastSegment = path.length - 1;
      for (let i = 0; i < lastSegment; i++) {
        const segment = path[i];
        current = (current as any)[segment];
      }
      delete (current as any)[path[lastSegment]];
    }
    return copy;
  }

  // /**
  //  * Accepts two documents and prunes any paths that are outlined in the diff. Should be
  //  * passed the collection of "noViolation" diffs.
  //  * @param inputLhs the left-hand side document
  //  * @param inputRhs the right-hand side document
  //  * @param differences the differences you want to prune
  //  * @returns a tuple of the pruned left-hand side and right-hand side documents
  //  */
  // private pruneDocuments(
  //   inputLhs: OpenAPIV2.Document,
  //   inputRhs: OpenAPIV2.Document,
  //   differences: DiffItem[] | undefined
  // ): [OpenAPIV2.Document, OpenAPIV2.Document] {
  //   // deep copy the documents
  //   let lhs = JSON.parse(JSON.stringify(inputLhs));
  //   let rhs = JSON.parse(JSON.stringify(inputRhs));

  //   for (const diff of differences ?? []) {
  //     const path = diff.diff.path;
  //     if (!path) continue;
  //     if ((diff.diff as any).lhs !== undefined) {
  //       lhs = this.deletePath(lhs, path);
  //     }
  //     if ((diff.diff as any).rhs !== undefined) {
  //       rhs = this.deletePath(rhs, path);
  //     }
  //   }

  //   // delete some standard collections from the documents
  //   const preserveDefinitions = this.args["preserve-definitions"];
  //   if (!preserveDefinitions) {
  //     const keysToDelete = [
  //       "definitions",
  //       "parameters",
  //       "responses",
  //       "securityDefinitions",
  //     ];
  //     for (const key of keysToDelete) {
  //       delete (lhs as any)[key];
  //       delete (rhs as any)[key];
  //     }
  //   }
  //   return [lhs, rhs];
  // }
}

interface DiffResult {
  flaggedViolations: DiffItem[];
  assumedViolations: DiffItem[];
  noViolations: DiffItem[];
}

interface ResultSummary {
  flaggedViolations: number;
  rulesViolated: number | undefined;
  assumedViolations: number;
  unresolvedReferences: number;
  unreferencedObjects: number;
}
