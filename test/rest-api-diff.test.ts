import { fail } from "assert";
import { expect, it } from "vitest";
import { getApplicableRules } from "../src/rules/rules.js";
import { DiffClientConfig } from "../src/diff-client.js";
import { TestableDiffClient } from "./test-host.js";
import exp from "constants";

it("config should group violations when --group-violations is set", async () => {
  const args = { "group-violations": true };
  const config: DiffClientConfig = {
    lhs: ["test/files/test1a.json"],
    rhs: ["test/files/test1b.json"],
    args: args,
    rules: getApplicableRules(args),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  client.buildOutput();
  const diffInvFile = client.resultFiles?.diffInverse;
  expect((diffInvFile as Array<any>).length).toBe(1);
  const diffInvItem = diffInvFile[0];
  expect(diffInvItem.items.length).toBe(4);
  expect(diffInvItem.name).toBe("ignoreSwaggerPropertiesRule");
});

it("config should not group violations when --group-violations is not set", async () => {
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
  const diffInvFile = client.resultFiles?.diffInverse;
  expect((diffInvFile as Array<any>).length).toBe(4);
  for (const item of diffInvFile as Array<any>) {
    expect(item.ruleName).toEqual("ignoreSwaggerPropertiesRule");
  }
});

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
