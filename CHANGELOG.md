# @azure-tools/rest-api-diff

## 0.3.0 (TBD)

- **BREAKING CHANGE** Removed all ability to compile TypeSpec files. You must now point `--lhs` and `--rhs` to Swagger ONLY.

## 0.2.2 (2025-04-14)

- Reverted change for inheritance chains. This will be fixed in a future release.
- Removed `--group-violations`. Now violations will always be grouped.
- `.env` file will now override cached variables set in the environment.

## 0.2.1 (2025-04-09)

- Added `--suppressions` option to point to a filing containing point suppressions of violations.
- Fixed issue where inheritance chains were not being properly expanded.

## 0.2.0 (2025-03-11)

- Fixed issue where relative references would sometimes be resolved incorrectly. `--lhs-root`
  and `--rhs-root` are still needed when compiling TypeSpec. See README.md.
- Arrays of strings are now sorted to ensure that differences in sorting do not trigger diffs.
- Fixed issue where local references with `-` character would not be resolved.
- Using `--group-violations` will auto-generate groupings.
- Added `--flatten-paths` option to allowing flattening paths in the output to compress vertical space.
- Add rule to better ignore diffs in `x-ms-examples`.
- Add rule to flag the addition or removal of paths or responses as a violation.
- Add rule to better ignore top-level and operation-level tags, but not property tags.
- Do not flag `common-types` as unreferenced.
- Clean up output for accuracy and readability.

## 0.1.8 (2025-01-08)

- Rule application logic changed such that a flagged rule continues to run rules in case
  there is a rule that markes it as NoViolation. If I diff is determined to be NoViolation,
  no further rules are run.
- Fixed issue where the tool sometimes would fail if paths used forward or backslashes.
- Fixed issue where a difference in body parameter names would result in false positive violations.
- Fixed issue where relative references would sometimes be resolved incorrectly. As a result, `--lhs-root`
  and `--rhs-root` options were no longer needed and have been removed.

## 0.1.7 (2024-11-25)

- Fixed issue where paths were being sorted correctly, leading to unreadable visual diffs.
- Changed the grouped violation structure to a dictionary where the rule name is the key. This makes
  it easier to collapse groups and still see the name.

## 0.1.6 (2024-11-19)

- Fixed issue where flags did not work correctly when supplied on the command line.

## 0.1.5 (2024-11-08)

- Added functionality to automatically attempt to resolve external references.
- Added `--lhs-root` and `--rhs-root` options for use with external reference resolution.
- Fixed issue where `$derivedClasses` could appear in the lhs or rhs output. It should not!
- Change structure of grouped violations so that it provides a count of violations and sorts the results in descending order by count.

## 0.1.4 (2024-10-15)

- Prevent crash if unable to find package version.

## 0.1.3 (2024-10-04)

- Fix display of tool version in help.
- Allow invocation using `npx rest-api-diff`.

## 0.1.1 (2024-08-15)

- Adds global error handling so users know who to reach out to for issues and provide the tool version.

## 0.1.0 (2024-08-12)

- Initial release
