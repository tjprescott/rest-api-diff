# REST API Diff

This tool is intended to be used to compare two OpenAPI 2.0 (Swagger) specifications to determine if there are
relevant differences that affect the API contract. The primary use case is to compare a hand-written specification
against the one generated from TypeSpec to determine if the TypeSpec accurately describes the same API contract.

## Install

1. Run `npm install @azure-tools/rest-api-diff`
2. If you want to make use of TypeSpec compilation features, `npm install @typespec/compiler`

## Usage

1. Run `npx rest-api-diff --lhs <lhs_path> --rhs <rhs_path> [--compile-tsp] [--group-violations]` or `npx rest-api-diff` if you are using a `.env` file (Recommended)

## Dev Install

1. Clone this repository
2. Run `npm install`
3. If you want to make use of TypeSpec compilation features, `npm install @typespec/compiler`

## Dev Usage

1. Run `npm run build` to build the tool. Alternatively, run `npm run watch` in a separate terminal so that changes to the TypeScript files are automatically re-compiled (RECOMMENDED).
2. Run `npm run rest-api-diff -- --lhs <lhs_path> --rhs <rhs_path> [--compile-tsp] [--group-violations]` or `npm run rest-api-diff` if you are using a `.env` file (Recommended)

`lhs_path` and `rhs_path` are the paths to the Swagger specifications to compare, or the folders
containing them. If the paths are folders, the tool will search for all Swagger files in that folder,
but will not search subfolders.

`lhs_root` and `rhs_root` are optional parameters. If you are pointing to Swagger files, they should not be needed. However, if you are compiling
TypeSpec, you should provide this so that the references get generated and resolve correctly. The value should be to set to where the Swagger
files should be generated. Since that would normally result in overwriting the existing files, it's recommended that you just replace the path
segment "stable" or "preview" with "generated" in the path. In this way, the Swagger will be generated into a unique folder with the same relative
references as if it had been generated in the "correct" folder. This allows the tool to resolve the references correctly.

### Options

- `--compile-tsp`: The tool will attempt to compile TypeSpec files to Swagger using the
  `@azure-tools/autorest` emitter. If existing Swagger files are found, they will be overwritten
  by the compilation.
- `--group-violations`: The tool will group violations by rule within `diff.json`, rather than
  listing them as a flat collection. It will include a count of violations and the file will
  be sorted in descending order by count. Assumed violations will be automatically grouped into
  generated groups with the '(AUTO)' suffix.
- `--output-folder`: The folder to write the output files to. If not specified, the output will be
  written to `./output`. The output folder is cleared with each run.
- `--typespec-compiler-path`: The path to the `@typespec/compiler` package. If not specified, the
  tool will attempt to use the globally installed package. If you get "compiler mismatch" errors,
  try configuring this.
- `--typespec-version-selector`: This is used for multiversioned TypeSpec files to select the version
  you want to generate Swagger for. If omitted, the latest version will be generated.
- `--preserve-definitions`: The intended purpose of the tool is to determine if two REST APIs described
  by Swagger are equivalent. Thus, Swagger definitions, parameters, responses, and security definitions,
  which exist solely for code re-use, aren't relevant to that question unless those definitions are used
  with a request or response. Hence, they are, by defult, pruned from the output. If you want to preserve
  these, for example to compare the definitions themselves between two Swaggers, provide this flag.
- `--flatten-paths`: The default format of paths in the output is an array of path segments. If you prefer
  to flatten these into a forward-slash delimited string, provide this flag.
- `--lhs-root`: The root path for the left-hand side Swagger files. This is used to resolve references
  when compiling TypeSpec files. If omitted, the tool will attempt to resolve the references without it.
- `--rhs-root`: The root path for the right-hand side Swagger files. This is used to resolve references
  when compiling TypeSpec files. If omitted, the tool will attempt to resolve the references without it.

### .env File

You can also specify environment variables for all options and/or use a .env file. Example:

```
LHS="KeyVaultOriginal/secrets.json"
RHS="KeyVaultGenerated"
RHS="<PATH_TO_SPECS_REPO>/specification"
COMPILE_TSP="true"
GROUP_VIOLATIONS="true"
TYPESPEC_COMPILER_PATH="<PATH_TO_SPECS_REPO>/node_modules/@typespec/compiler"
TYPESPEC_VERSION_SELECTOR="2021-06-01"
PRESERVE_DEFINITIONS="false"
```

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

For diagnostic purposes, the tool will also output the following "inverse" files:

- `lhs-inv.json` the transformed API with the violations pruned for the left-hand side. Lets you see only the diffs that were considered "non-violations".
- `rhs-inv.json` the transformed API with the violations pruned for the right-hand side. Lets you see only the diffs that were considered "non-violations".
- `diff-inv.json` the list of diff items between the two specifications that were considered "non-violations".

A visual diff of `lhs-inv.json` and `rhs-inv.json` will show you only the differences that the tool considered "non-violations" or irrelevant. `diff-inv.json` will
also tell you which rule was applied that rendered the diff as a "non-violation". These can be useful to validate the rule logic and ensure it is not letting
actually violations sneak through.

Finally the tool will also output `lhs-raw.json` and `rhs-raw.json` which are the transformed files with no pruning or rule application. These can be useful for
debugging purposes.

## Running against the REST API Specs Repo

These steps assume that `--lhs` points to a Swagger folder and `--rhs` points to a TypeSpec folder, both within the REST API specs repo. If this is not the case, your steps will differ.

1. Ensure you have updated the dependencies in your fork by running `npm install` in the REST API specs repo root. You may need to delete `package-lock.json` first. Copy the path to the `node_modules/@typespec/compiler` package.
2. Set the `TYPESPEC_COMPILER_PATH` environment variable (ideally in .env) to the path you copied in step 1.
3. Ensure that LHS and RHS point to the appropriate paths in the REST API specs repo.
4. By convention, if you are comparing hand-written Swagger to TypeSpec, the Swagger should be LHS and the TypeSpec should be RHS. When compiling TypeSpec, you will
   need to set RHS_ROOT. **If you are following the convention, the tool will automatically use the same folder as LHS for RHS_ROOT except changing the "stable" or "preview"
   folder to "temp", which will subsequently be deleted after the tool completes.** This is so the relative paths get generated and resolve correctly without bulldozing
   and existing files.
5. If you are comparing to a multi-versioned TypeSpec, you should probably include the `TYPESPEC_VERSION_SELECTOR` environment variable to ensure you are generating the right version for comparison.

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

When processing a diff item against the rules, if `NoViolation` is returned by a rule, it immediately suspends processing additional rules. If `FlaggedViolation` is returned, rules will continue to be processed in case another rule marks it as `NoViolation`. If all rules are run and no determination is made, then the diff is assumed to affect the API surface area and is tracked as an assumed violation. It will be reported by the tool and will appear in a visual diff. When violations are grouped, these violations will appear in the `UNGROUPED` group.
