# @azure-tools/rest-api-diff

## 0.1.8 (TBD)

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
