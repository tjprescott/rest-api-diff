import pkg, { Diff } from "deep-diff";
const { diff } = pkg;
import { SwaggerParser } from "./parser.js";
import {
  getApplicableRules,
  RuleResult,
  RuleSignature,
} from "./rules/rules.js";
import { forceArray } from "./util.js";
import { OpenAPIV2 } from "openapi-types";
import assert from "assert";
import { RegistryKind } from "./definitions.js";
import * as fs from "fs";
import path from "path";

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
    const lhs = client.args["lhs"].map((x: string) => path.resolve(x));
    const rhs = client.args["rhs"].map((x: string) => path.resolve(x));

    const lhsParser = await SwaggerParser.create(lhs, client.args);
    const rhsParser = await SwaggerParser.create(rhs, client.args);
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
    const diffs = diff(lhs, rhs) ?? [];

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
   * an issue, the diff is treated as a failure. If a rule is flagged as a violation,
   * it can be overridden by a later rule, but as soon as a rule confirms something
   * is not a violation, processing stops.
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
    let finalResult: RuleResult | [RuleResult, string] | undefined = undefined;
    let finalResultRuleName: string | undefined = undefined;
    for (const rule of this.rules) {
      const result = rule(data, lhs, rhs);
      if (result === undefined) {
        continue;
      }
      const ruleResult = Array.isArray(result) ? result[0] : result;
      // continue processing rules even if a violation is found in case a later rule exempts a pattern.
      if (ruleResult === RuleResult.FlaggedViolation) {
        finalResult = result;
        finalResultRuleName = rule.name;
        continue;
      } else if (ruleResult === RuleResult.NoViolation) {
        finalResult = result;
        finalResultRuleName = rule.name;
        break;
      }
    }
    // now apply the final rule result
    if (finalResult && Array.isArray(finalResult)) {
      retVal.ruleResult = finalResult[0];
      retVal.ruleName = finalResultRuleName;
      retVal.message = finalResult[1];
    } else if (finalResult) {
      retVal.ruleResult = finalResult;
      retVal.ruleName = finalResultRuleName;
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

    const diffResult = this.#buildDiffFile(convertDiffItems(allViolations));
    const invDiffResult = this.#buildDiffFile(
      convertDiffItems(this.diffResults.noViolations)
    );

    this.resultFiles = {
      raw: [this.lhs, this.rhs],
      normal: this.#pruneDocuments(
        this.lhs,
        this.rhs,
        this.diffResults.noViolations
      ),
      inverse: this.#pruneDocuments(this.lhs, this.rhs, allViolations),
      diff: diffResult,
      diffInverse: invDiffResult,
    };
  }

  /** Returns true if the summary indicates that there are violations. */
  hasViolations(summary: ResultSummary, preserveDefinitions: boolean): boolean {
    if (preserveDefinitions) {
      return (
        summary.flaggedViolations > 0 ||
        summary.assumedViolations > 0 ||
        summary.unresolvedReferences > 0
      );
    } else {
      return (
        summary.flaggedViolations > 0 ||
        summary.assumedViolations > 0 ||
        summary.unresolvedReferences > 0 ||
        summary.unreferencedObjects > 0
      );
    }
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
      path.join(outputFolder, "lhs-inv.json"),
      JSON.stringify(results.inverse[0], null, 2)
    );
    fs.writeFileSync(
      path.join(outputFolder, "rhs-inv.json"),
      JSON.stringify(results.inverse[1], null, 2)
    );
    // write the raw files to output for debugging purposes
    fs.writeFileSync(
      path.join(outputFolder, "lhs-raw.json"),
      JSON.stringify(results.raw[0], null, 2)
    );
    fs.writeFileSync(
      path.join(outputFolder, "rhs-raw.json"),
      JSON.stringify(results.raw[1], null, 2)
    );
    // prune the documents of any paths that are not relevant and
    // output them for visual diffing.
    fs.writeFileSync(
      path.join(outputFolder, "lhs.json"),
      JSON.stringify(results.normal[0], null, 2)
    );
    fs.writeFileSync(
      path.join(outputFolder, "rhs.json"),
      JSON.stringify(results.normal[1], null, 2)
    );
    const preserveDefinitions = this.args["preserve-definitions"];

    // Report unresolved and unreferenced objects
    if (this.args["verbose"]) {
      const lhsUnreferenced = preserveDefinitions
        ? 0
        : this.lhsParser.getUnreferencedTotal();
      const lhsUnresolved = this.lhsParser.getUnresolvedReferences().length;
      if (lhsUnresolved > 0 || lhsUnreferenced > 0) {
        console.warn("=== LEFT-HAND SIDE ===");
        if (lhsUnresolved > 0) {
          this.#reportUnresolvedReferences(this.lhsParser);
        }
        if (lhsUnreferenced > 0) {
          this.#reportUnreferencedObjects(this.lhsParser);
        }
      }
      const rhsUnreferenced = preserveDefinitions
        ? 0
        : this.rhsParser.getUnreferencedTotal();
      const rhsUnresolved = this.rhsParser.getUnresolvedReferences().length;
      if (rhsUnresolved > 0 || rhsUnreferenced > 0) {
        console.warn("\n=== RIGHT-HAND SIDE ===");
        if (rhsUnresolved > 0) {
          this.#reportUnresolvedReferences(this.rhsParser);
        }
        if (rhsUnreferenced > 0) {
          this.#reportUnreferencedObjects(this.rhsParser);
        }
      }
    }
    const groupViolations = this.args["group-violations"];
    const allViolations = [
      ...(this.diffResults?.assumedViolations ?? []),
      ...(this.diffResults?.flaggedViolations ?? []),
    ];

    // write the diff file to the file system
    if (allViolations.length !== 0) {
      const normalPath = path.join(outputFolder, "diff.json");
      const data = groupViolations
        ? Object.fromEntries(results.diff)
        : results.diff;
      fs.writeFileSync(normalPath, JSON.stringify(data, null, 2));
    }

    // write the inverse diff file to the file system
    if (this.diffResults.noViolations.length !== 0) {
      const inversePath = path.join(outputFolder, "diff-inv.json");
      const data = groupViolations
        ? Object.fromEntries(results.diffInverse)
        : results.diffInverse;
      fs.writeFileSync(inversePath, JSON.stringify(data, null, 2));
    }

    // add up the length of each array
    const flaggedRulesViolated = new Set(
      allViolations
        .filter((x) => x.ruleName && !x.ruleName.endsWith("(AUTO)"))
        .map((x) => x.ruleName)
    );
    const assumedRulesViolated = new Set(
      allViolations
        .filter((x) => x.ruleName && x.ruleName.endsWith("(AUTO)"))
        .map((x) => x.ruleName)
    );
    const summary: ResultSummary = {
      flaggedViolations: this.diffResults.flaggedViolations.length,
      assumedViolations: this.diffResults.assumedViolations.length,
      assumedRules: groupViolations ? assumedRulesViolated.size : undefined,
      rulesViolated: groupViolations ? flaggedRulesViolated.size : undefined,
      unresolvedReferences: this.rhsParser.getUnresolvedReferences().length,
      unreferencedObjects: this.rhsParser.getUnreferencedTotal(),
    };

    if (this.hasViolations(summary, preserveDefinitions)) {
      console.warn("\n== ISSUES FOUND! ==\n");
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
        if (summary.assumedRules) {
          console.warn(
            `Assumed Violations: ${summary.assumedViolations} across ${summary.assumedRules} auto-generated groupings`
          );
        } else {
          console.warn(`Assumed Violations: ${summary.assumedViolations}`);
        }
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
      if (!preserveDefinitions && summary.unreferencedObjects) {
        console.warn(
          "Running with `--preserve-defintions` will ensure those unreferenced objects are diffed and will not report the fact that they are unreferenced as a violation."
        );
        if (!this.args["verbose"]) {
          console.warn(
            "or run with `--verbose` to see more detailed information."
          );
        }
      }
    } else {
      console.info(`\n== NO ISSUES FOUND! ==\n`);
      console.info("\n");
      if (summary.unreferencedObjects > 0 && preserveDefinitions) {
        console.info(
          `Note that there were ${summary.unreferencedObjects} unreferenced objects found, but the simple fact that are unreferenced is not considered a violation because you used '--preserve-definitions'.\n`
        );
      }
      console.info(
        `See '${outputFolder}' for details. You may still want to compare 'lhs-inv.json' and 'rhs-inv.json' to check that the differences reflected are truly irrelevant.`
      );
    }
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

  #diffKindToString(diff: Diff<any, any>): string {
    switch (diff.kind) {
      case "E":
        return "Changed";
      case "N":
        return "Added";
      case "D":
        return "Removed";
      case "A":
        return "ArrayItem";
    }
  }

  /**
   * Constructs a default rule name based on the diff kind and path to
   * aid with grouping diffs which aren't subject to any format rule.
   */
  #buildDefaultRuleName(
    diff: Diff<any, any>,
    path: Array<String> | undefined
  ): string {
    if (!path) {
      throw new Error("Unexpected undefined path");
    }
    const verb = this.#diffKindToString(diff);
    let returnValue = "UNGROUPED";
    if (diff.kind === "A") {
      const arrayItemRuleName = this.#buildDefaultRuleName(
        diff.item,
        diff.path
      );
      returnValue = `${verb}_${arrayItemRuleName}`;
    } else {
      const lastPath = path[path.length - 1];
      if (typeof lastPath === "number") {
        const secondToLastPath = path[path.length - 2];
        return `${verb}_${secondToLastPath} (AUTO)`;
      } else {
        return `${verb}_${lastPath} (AUTO)`;
      }
    }
    return returnValue;
  }

  #buildDiffFile(diffs: DiffItem[]): any {
    if (!this.args["group-violations"]) {
      return diffs;
    }
    const groupedDiff: { [key: string]: DiffGroupingResult } = {};
    for (const diff of diffs) {
      diff.ruleName =
        diff.ruleName ?? this.#buildDefaultRuleName(diff.diff, diff.diff.path);
      if (!groupedDiff[diff.ruleName]) {
        groupedDiff[diff.ruleName] = {
          name: diff.ruleName,
          count: 0,
          items: [],
        };
      }
      groupedDiff[diff.ruleName]!.items.push(diff);
      groupedDiff[diff.ruleName]!.count++;
    }
    const finalResults = new Map<string, any>();
    // Sort by count descending
    const sorted = Object.values(groupedDiff).sort((a, b) => b.count - a.count);
    for (const item of sorted) {
      const name = item.name!;
      delete item.name;
      finalResults.set(name, item);
    }
    return finalResults;
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

/** Describes a diff item */
export interface DiffItem {
  ruleResult: RuleResult;
  ruleName?: string;
  message?: string;
  diff: Diff<any, any>;
}

/** Describes a grouping of diff items. */
export interface DiffGroupingResult {
  name?: string;
  count: number;
  items: DiffItem[];
}

/** Describes the sorted results of diffing. */
interface DiffResult {
  flaggedViolations: DiffItem[];
  assumedViolations: DiffItem[];
  noViolations: DiffItem[];
}

interface ResultFiles {
  raw: [any, any];
  normal: [any, any];
  inverse: [any, any];
  diff: any;
  diffInverse: any;
}

interface ResultSummary {
  flaggedViolations: number;
  rulesViolated: number | undefined;
  assumedViolations: number;
  assumedRules: number | undefined;
  unresolvedReferences: number;
  unreferencedObjects: number;
}

function convertDiffItems(items: DiffItem[]): any[] {
  const results: any[] = [];
  for (const item of items) {
    const allItem = { ...item };
    const diff = { ...allItem.diff };
    const path = diff.path;
    // join and url-encode the path segments
    const fullPath = path!.map((x: string) => encodeURIComponent(x)).join("/");
    (diff as any).path = fullPath;
    allItem.diff = diff;
    results.push(allItem);
  }
  return results;
}
