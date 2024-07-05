# OpenAPI Diff

This tool is intended to be used to compare two OpenAPI 2.0 (Swagger) specifications to determine if there are
relevant differences that affect the API contract. The primary use case is to compare a hand-written specification
against the one generated from TypeSpec to determine if the TypeSpec accurately describes the same API contract.

## Install

1. Clone this repository
2. Run `npm install`

## Usage

1. Run `npm run build`
2. Run `npm run diff -- --lhs <lhs_path> --rhs <rhs_path> [--compile-tsp]`

`lhs_path` and `rhs_path` are the paths to the OpenAPI 2.0 specifications (Swagger) to compare,
or the folders containing them. If the paths are folders, the tool will recursively search for all
Swagger files in the folder. If no Swagger files are found, but TypeSpec files are found and the
`--compile-tsp` flag it set, the tool will attempt to compile the TypeSpec files to Swagger using
the `@azure-tools/autorest` emitter.

## Output

The output artifacts are:

- `lhs.json` the transformed and pruned API specification for the left-hand side.
- `rhs.json` the transformed and pruned API specification for the right-hand side.
- `diff.json` the list of diff items between the two specifications.

You can run a visual diff on `lhs.json` and `rhs.json` to visually see the differences that should appear in `diff.json`.

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
