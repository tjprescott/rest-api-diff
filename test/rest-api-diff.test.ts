import { fail } from "assert";
import { expect, it } from "vitest";
import { getApplicableRules } from "../src/rules/rules.js";
import { DiffClientConfig } from "../src/diff-client.js";
import { TestableDiffClient } from "./test-host.js";

it("should compare two files", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/test1a.json"],
    rhs: ["test/files/test1b.json"],
    args: {},
    rules: getApplicableRules({}),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  client.buildOutput();
  const [lhsParser, rhsParser] = client.getParsers();
  expect(lhsParser.getUnresolvedReferences().length).toBe(0);
  expect(lhsParser.getUnreferencedTotal()).toBe(0);
  expect(rhsParser.getUnresolvedReferences().length).toBe(0);
  expect(rhsParser.getUnreferencedTotal()).toBe(0);
  expect(client.diffResults?.assumedViolations.length).toBe(0);
  expect(client.diffResults?.flaggedViolations.length).toBe(0);
  expect(client.diffResults?.noViolations.length).toBe(4);
});
