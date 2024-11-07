# @azure-tools/rest-api-diff

## 0.1.5 (TBD)

- Added functionality to automatically attempt to resolve external references.
- Added `--lhs-root` and `--rhs-root` options for use with external reference resolution.
- Fixed issue where `$derivedClasses` could appear in the lhs or rhs output. It should not!

## 0.1.4 (2024-10-15)

- Prevent crash if unable to find package version.

## 0.1.3 (2024-10-04)

- Fix display of tool version in help.
- Allow invocation using `npx rest-api-diff`.

## 0.1.1 (2024-08-15)

- Adds global error handling so users know who to reach out to for issues and provide the tool version.

## 0.1.0 (2024-08-12)

- Initial release
