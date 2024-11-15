import { getApplicableRules, RuleSignature } from "./rules/rules.js";

export interface DiffClientConfig {
  lhs: string | string[];
  rhs: string | string[];
  args: any;
  rules?: RuleSignature[];
}

export class DiffClient {
  private args: any;
  private rules: RuleSignature[];
  private lhs: string[];
  private lhsRoot: string;
  private rhs: string[];
  private rhsRoot: string;

  constructor(config: DiffClientConfig) {
    this.args = config.args;
    this.rules = config.rules ?? getApplicableRules(config.args);
    this.lhs = [...config.lhs];
    this.rhs = [...config.rhs];
    this.lhsRoot = config.args["lhs-root"] ?? this.getDefaultRootPath(this.lhs);
    this.rhsRoot = config.args["rhs-root"] ?? this.getDefaultRootPath(this.rhs);
  }

  getDefaultRootPath(paths: string[]): string {
    if (paths.length === 1) {
      return paths[0];
    } else {
      return process.cwd();
    }
  }

  async run() {
    let lhsParser = new SwaggerParser(
      await loadPaths(in1, args),
      lhsRoot,
      args
    );
    await lhsParser.updateDiscoveredReferences();
    let rhsParser = new SwaggerParser(
      await loadPaths(in2, args),
      rhsRoot,
      args
    );
    await rhsParser.updateDiscoveredReferences();
    let lhs = lhsParser.parse().asJSON();
    let rhs = rhsParser.parse().asJSON();

    [lhs, rhs] = shortenKeys(lhs, rhs);

    // sort the diffs into three buckets: flagged violations, assumed violations, and no violations
    const results = processDiff(diff(lhs, rhs), lhs, rhs);
    if (!results) {
      throw new Error(`Error occurred while processing diffs.\n\n${epilogue}`);
    }
    const flaggedViolations = results.flaggedViolations ?? [];
    const assumedViolations = results.assumedViolations ?? [];
    const allViolations = [...flaggedViolations, ...assumedViolations];

    // ensure the output folder exists and is empty
    const outputFolder = args["output-folder"];
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
    const [lhsInv, rhsInv] = pruneDocuments(lhs, rhs, allViolations);
    fs.writeFileSync(
      `${args["output-folder"]}/lhs-inv.json`,
      JSON.stringify(lhsInv, null, 2)
    );
    fs.writeFileSync(
      `${args["output-folder"]}/rhs-inv.json`,
      JSON.stringify(rhsInv, null, 2)
    );

    // write the raw files to output for debugging purposes
    fs.writeFileSync(
      `${args["output-folder"]}/lhs-raw.json`,
      JSON.stringify(lhs, null, 2)
    );
    fs.writeFileSync(
      `${args["output-folder"]}/rhs-raw.json`,
      JSON.stringify(rhs, null, 2)
    );

    // prune the documents of any paths that are not relevant and
    // output them for visual diffing.
    const [lhsNew, rhsNew] = pruneDocuments(lhs, rhs, results.noViolations);
    fs.writeFileSync(
      `${args["output-folder"]}/lhs.json`,
      JSON.stringify(lhsNew, null, 2)
    );
    fs.writeFileSync(
      `${args["output-folder"]}/rhs.json`,
      JSON.stringify(rhsNew, null, 2)
    );

    // Report unresolved and unreferenced objects
    if (args["verbose"]) {
      console.warn("=== LEFT-HAND SIDE ===");
      lhsParser.reportUnresolvedReferences();
      if (!args["preserve-definitions"]) {
        lhsParser.reportUnreferencedObjects();
      }

      console.warn("\n=== RIGHT-HAND SIDE ===");
      rhsParser.reportUnresolvedReferences();
      if (!args["preserve-definitions"]) {
        rhsParser.reportUnreferencedObjects();
      }
    }

    const groupViolations = args["group-violations"];
    if (allViolations.length === 0) {
      console.log("No differences found");
      return 0;
    }
    // write out the diff.json file based on the grouping preference
    const normalPath = `${outputFolder}/diff.json`;
    const inversePath = `${outputFolder}/diff-inv.json`;
    if (groupViolations) {
      writeGroupedViolations(allViolations, normalPath);
      writeGroupedViolations(results.noViolations, inversePath);
    } else {
      writeFlatViolations(allViolations, normalPath);
      writeFlatViolations(results.noViolations, inversePath);
    }
    // add up the length of each array
    const summary: ResultSummary = {
      flaggedViolations: flaggedViolations.length,
      assumedViolations: assumedViolations.length,
      rulesViolated: groupViolations
        ? new Set(allViolations.map((x) => x.ruleName)).size
        : undefined,
      unresolvedReferences:
        rhsParser.defRegistry.getUnresolvedReferences().length,
      unreferencedObjects: rhsParser.defRegistry.getUnreferencedTotal(),
    };
    console.warn("\n== ISSUES FOUND! ==\n");
    const preserveDefinitions = args["preserve-definitions"];
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
      if (!args["verbose"]) {
        console.warn(
          "or run with `--verbose` to see more detailed information."
        );
      }
    }
  }

  function shortenKeys(
    inputLhs: OpenAPIV2.Document,
    inputRhs: OpenAPIV2.Document
  ): [OpenAPIV2.Document, OpenAPIV2.Document] {
    // deep copy the documents
    let lhs = JSON.parse(JSON.stringify(inputLhs));
    let rhs = JSON.parse(JSON.stringify(inputRhs));
  
    const keysToShorten = [
      "definitions",
      "parameters",
      "responses",
      "securityDefinitions",
    ];
  
    for (const doc of [lhs, rhs]) {
      for (const key of keysToShorten) {
        const coll = doc[key];
        // update each key to only take the name after the last forward slash
        if (coll) {
          const newLhsCollection: any = {};
          for (const [lhsKey, val] of Object.entries(coll)) {
            const lhsShortenedKey = lhsKey.split("/").pop()!;
            newLhsCollection[lhsShortenedKey] = val;
          }
          doc[key] = newLhsCollection;
        }
      }
    }
    return [lhs, rhs];
  }
  
  /** Deletes a specified path from a given OpenAPI document. */
  function deletePath(
    doc: OpenAPIV2.Document,
    path: string[]
  ): OpenAPIV2.Document {
    const copy = { ...doc };
    let current = copy;
    const lastSegment = path.length - 1;
    for (let i = 0; i < lastSegment; i++) {
      const segment = path[i];
      current = (current as any)[segment];
    }
    delete (current as any)[path[lastSegment]];
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
  function pruneDocuments(
    inputLhs: OpenAPIV2.Document,
    inputRhs: OpenAPIV2.Document,
    differences: DiffItem[] | undefined
  ): [OpenAPIV2.Document, OpenAPIV2.Document] {
    // deep copy the documents
    let lhs = JSON.parse(JSON.stringify(inputLhs));
    let rhs = JSON.parse(JSON.stringify(inputRhs));
  
    for (const diff of differences ?? []) {
      const path = diff.diff.path;
      if (!path) continue;
      if ((diff.diff as any).lhs !== undefined) {
        lhs = deletePath(lhs, path);
      }
      if ((diff.diff as any).rhs !== undefined) {
        rhs = deletePath(rhs, path);
      }
    }
  
    // delete some standard collections from the documents
    const preserveDefinitions = args["preserve-definitions"];
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
  
  /** Determines if a rule can be applied. */
  function isFilterable(path: string[]): boolean {
    const pathLength = path.length;
    if (pathLength < 2) return true;
    const firstPath = path[0];
    const secondToLastPath = path[path.length - 2];
    // Special top-level collections are key-value pairs where the keys aren't filterable
    if (pathLength === 2) {
      if (firstPath === "parameters") return false;
      if (firstPath === "definitions") return false;
      if (firstPath === "responses") return false;
      if (firstPath === "securityDefinitions") return false;
    }
    // properties can appear anywhere and property keys are not filterable by rules!
    if (secondToLastPath === "properties") return false;
    return true;
  }
  
  /**
   * Processes all rules against the given diff. If no rule confirms or denies
   * an issue, the diff is treated as a failure.
   * @param data the diff data to evaluate.
   * @returns an allowed DiffRuleResult. Only "ContinueProcessing" is not allowed.
   */
  function processRules(
    data: Diff<any, any>,
    lhs: OpenAPIV2.Document,
    rhs: OpenAPIV2.Document
  ): DiffItem {
    let retVal: any = {
      ruleResult: RuleResult.AssumedViolation,
      ruleName: undefined,
      diff: data,
    };
    const rules = getApplicableRules(args);
    for (const rule of rules) {
      const result = rule(data, lhs, rhs);
      if (Array.isArray(result)) {
        retVal.ruleResult = result[0];
        retVal.ruleName = rule.name;
        retVal.message = result[1];
        break;
      } else if (result === RuleResult.ContinueProcessing) {
        continue;
      } else {
        retVal.ruleResult = result;
        retVal.ruleName = rule.name;
        break;
      }
    }
    return retVal as DiffItem;
  }
  
  export interface DiffResult {
    flaggedViolations: DiffItem[];
    assumedViolations: DiffItem[];
    noViolations: DiffItem[];
  }
  
  function processDiff(
    differences: Diff<any, any>[] | undefined,
    lhs: OpenAPIV2.Document,
    rhs: OpenAPIV2.Document
  ): DiffResult {
    const results: DiffResult = {
      flaggedViolations: [],
      assumedViolations: [],
      noViolations: [],
    };
    for (const data of differences ?? []) {
      if (!isFilterable(data.path!)) continue;
      const result = processRules(data, lhs, rhs);
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
    return results;
  }  
}

interface ResultSummary {
  flaggedViolations: number;
  rulesViolated: number | undefined;
  assumedViolations: number;
  unresolvedReferences: number;
  unreferencedObjects: number;
}
