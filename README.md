# REST API Diff

This tool compares two OpenAPI 2.0 (Swagger) specifications to identify relevant differences in the API contract.

## Install

```bash
npm install -g @azure-tools/rest-api-diff
```

## Usage

```bash
npx rest-api-diff \
  --lhs <lhs_path_or_dir> \
  --rhs <rhs_path_or_dir> \
  [--group-violations] \
  [--output-folder <folder>] \
  [--flatten-paths] \
  [--preserve-definitions] \
  [--verbose] \
  [--suppressions <file>]
```

- `--lhs`: Path or directory for the “left‑hand” Swagger files.
- `--rhs`: Path or directory for the “right‑hand” Swagger files.
- `--group-violations`: Group violations by rule into summary entries.
- `--output-folder`: Folder for all output artifacts (default `./output`).
- `--flatten-paths`: Collapse path arrays into a single slash‑delimited string.
- `--preserve-definitions`: Keep definitions, parameters, responses, and securityDefinitions in output.
- `--verbose`: Print detailed log messages.
- `--suppressions`: Path to a YAML file listing diffs to suppress.

## Dev Install

```bash
git clone https://github.com/azure-tools/rest-api-diff.git
cd rest-api-diff
npm install
```

## Dev Usage

```bash
npm run build
npm run rest-api-diff -- --lhs <lhs_path_or_dir> --rhs <rhs_path_or_dir> [options]
```

## .env Support

You may define any of the above options via environment variables in a `.env` file:

```text
LHS="specs/original"
RHS="specs/generated"
GROUP_VIOLATIONS="true"
OUTPUT_FOLDER="output"
FLATTEN_PATHS="true"
PRESERVE_DEFINITIONS="false"
VERBOSE="true"
SUPPRESSIONS="suppressions.yml"
```

## Output Artifacts

- **lhs.json**: Transformed, pruned LHS Swagger.
- **rhs.json**: Transformed, pruned RHS Swagger.
- **diff.json**: All diffs that affect the API contract.
- **lhs-inv.json**, **rhs-inv.json**, **diff-inv.json**: Inverse views (non‑violations).
- **lhs-raw.json**, **rhs-raw.json**: Raw transformations without pruning.

Use a visual‑diff tool on `lhs.json`/`rhs.json` to inspect flagged differences.

## Suppressions

Create a YAML file to suppress known differences:

```yaml
- path: "paths//users//get/"
  reason: "Allowed pagination change"
```

Supply it with `--suppressions <file>` to filter those diffs out of `diff.json`.

## Rules

The tool expands references, combines multiple files, and applies special logic (e.g., `x-ms-parameterized-host`) to produce a canonical Swagger representation. It then compares the two using `deep-diff` and runs each diff through a pipeline of rules:

- `NoViolation`: Ignore diff and prune path from both Swaggers.
- `FlaggedViolation`: Report diff as a violation; appears in visual output.
- `ContinueProcessing`: Diff evaluated by subsequent rules.
- Unmatched diffs are treated as assumed violations.

## Running against the REST API Specs Repo

1. Ensure dependencies in your fork by running `npm install` in the REST API specs repo root.
2. Point `--lhs` and `--rhs` to the appropriate Swagger folders.
3. By convention, compare hand‑written Swagger (LHS) against generated Swagger (RHS).
