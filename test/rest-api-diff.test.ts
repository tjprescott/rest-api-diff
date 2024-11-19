import { fail } from "assert";
import { it } from "vitest";
import { getApplicableRules } from "../src/rules/rules.js";
import { DiffClient, DiffClientConfig } from "../src/diff-client.js";

it("should compare the test file with the config file", async () => {
  fail("Not implemented");
});

it("should group violations when --group-violations is set", async () => {
  fail("Not implemented");
});

it("should write flat violations when --flat-violations is set", async () => {
  fail("Not implemented");
});

it("should compare two files", async () => {
  const args = {
    "group-violations": true,
  };
  const config: DiffClientConfig = {
    lhs: ["test/files/test1a.json"],
    rhs: ["test/files/test1b.json"],
    args: args,
    rules: getApplicableRules(args),
  };
  const client = await DiffClient.create(config);
  client.parse();
  client.processDiff();
  client.buildOutput();
  fail("Not implemented");
});
