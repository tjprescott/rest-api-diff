# OpenAPI Diff

This tool is intended to be used to compare two OpenAPI 2.0 (Swagger) specifications to determine if there are
relevant differences that affect the API contract. The primary use case is to compare a hand-written specification
against the one generated from TypeSpec to determine if the TypeSpec accurately describes the same API contract.

## Install

1. Clone this repository
2. Run `npm install`
3. If you want to make use of TypeSpec compilation features, `npm install @typespec/compiler`

## Usage

1. Run `npm run build`
2. Run `npm run diff -- --lhs <lhs_path> --rhs <rhs_path> [--compile-tsp] [--group-violations]`

`lhs_path` and `rhs_path` are the paths to the Swagger specifications to compare, or the folders
containing them. If the paths are folders, the tool will search for all Swagger files in that folder,
but will not search subfolders.

### Options

- `--compile-tsp`: The tool will attempt to compile TypeSpec files to Swagger using the
  `@azure-tools/autorest` emitter, if no Swagger files are found.
- `--group-violations`: The tool will group violations by rule within `diff.json`, rather than
  listing them as a flat collection.
- `--output-folder`: The folder to write the output files to. If not specified, the output will be
  written to `./output`. The output folder is cleared with each run.

## Output

The output artifacts are:

- `lhs.json` the transformed and pruned API specification for the left-hand side.
- `rhs.json` the transformed and pruned API specification for the right-hand side.
- `diff.json` the list of diff items between the two specifications.

You can run a visual diff on `lhs.json` and `rhs.json` to visually see the differences that should appear in `diff.json`.
![diff](https://github.com/tjprescott/openapi-diff/assets/5723682/ac4ec19d-88fc-4673-8fa9-cc926d63744c)

`diff.json` contains each specific diff that was found between the two specifications and was not resolved by a rule.

The schema of the diff object:

- `ruleResult`: An enum which describes the result of the rule that was applied to the diff. F = Flagged, A = Assumed, or N = NoViolation.
- `ruleName`: The name of the rule that was applied to the diff. For assumed violations, this will be null.
- `message`: For flagged violations, this may contains a message offering more insight into the specific problem.
- `diff`: The diff object, which has the following properties:
  - `kind`: Identifies the kind of change. E = Edit, N = New, D = Delete or A = Array.
  - `path`: A list of path segments from the root of the document to the problematic node.
  - `lhs`: The value of the node in the left-hand side document, if applicable.
  - `rhs`: The value of the node in the right-hand side document, if applicable.

## Rules

The way `openapi-diff` works is by expanding references (except circular references) into inline definitions, combining multiple
files and applying certain special-casing logic (such as `x-ms-parameterized-host`) in order to produce a "canonical" representation
of the Swagger. It then compares the two using the `deep-diff` package. The diff elements are run through a pipeline of rules. Each
rule can make one of three determinations:

- `RuleResult.NoViolation`: this describes a diff that doesn't affect the API surface area, and thus we will ignore the diff and prune
  the path from both `lhs.json` and `rhs.json` so they won't appear in a visual diff.
- `RuleResult.FlaggedViolation`: a pattern is identified that we confirm affects the API surface area and thus represents a violation.
  This will be reported by the tool and may include an amplifying message. It will appear in a visual diff.
- `RuleResult.ContinueProcessing`: the logic of the rule doesn't apply to this diff and thus the tool should continue processing rules.

When processing a diff item against the rules, if either `NoViolation` or `FlaggedViolation` are returned by a rule, it immediately
suspends processing any additional rules. If all rules return `ContinueProcessing` then the diff is assumed to affect the API surface
area and is marked as `RuleResult.AssumedViolation`. It will be reported by the tool and will appear in a visual diff.
