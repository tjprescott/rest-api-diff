import { expect, it } from "vitest";
import { TestableDiffClient } from "./test-host.js";
import { getApplicableRules } from "../src/rules/rules.js";
import { DiffClientConfig } from "../src/index.js";
import { fail } from "assert";
import { loadPaths } from "../src/util.js";

function assertSorted(array: Array<string>) {
  const sorted = array.toSorted();
  for (let i = 0; i < sorted.length; i++) {
    expect(sorted[i]).toEqual(array[i]);
  }
}

it("sorts paths lexically", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/pathSortingA"],
    rhs: ["test/files/pathSortingB"],
    args: {},
    rules: getApplicableRules({}),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  const lhsKeys = Object.keys(client.lhs!);
  const rhsKeys = Object.keys(client.rhs!);

  // ensure that sorting doesn't change the order of the keys
  assertSorted(lhsKeys);
  assertSorted(rhsKeys);

  // compare lhs and rhs paths and ensure they are sorted lexically
  const lhsPaths = Object.keys(client.lhs!.paths);
  const rhsPaths = Object.keys(client.rhs!.paths);
  assertSorted(lhsPaths);
  assertSorted(rhsPaths);
});

it("expands parameterized host", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/testParameterizedHost.json"],
    rhs: ["test/files/testParameterizedHost.json"],
    args: {},
    rules: getApplicableRules({}),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  const lhsKeys = Object.keys(client.lhs!);

  // ensure that sorting doesn't change the order of the keys
  assertSorted(lhsKeys);

  // compare lhs and rhs paths and ensure they are sorted lexically
  const lhsPaths = Object.keys(client.lhs!.paths);
  expect(lhsPaths.length).toBe(1);
  let path = lhsPaths[0];
  expect(path).toBe("{endpoint}/foo/bar");
  assertSorted(lhsPaths);
});

it("expands x-ms-paths", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/testXMsPaths.json"],
    rhs: ["test/files/testXMsPaths.json"],
    args: {},
    rules: getApplicableRules({}),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  const lhsKeys = Object.keys(client.lhs!);

  // ensure that sorting doesn't change the order of the keys
  assertSorted(lhsKeys);

  // compare lhs and rhs paths and ensure they are sorted lexically
  const lhsPaths = Object.keys(client.lhs!.paths);
  expect(lhsPaths.length).toBe(2);
  assertSorted(lhsPaths);
});
