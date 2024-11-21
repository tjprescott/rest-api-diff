import { expect, it } from "vitest";
import { getApplicableRules } from "../src/rules/rules.js";
import { DiffClientConfig } from "../src/diff-client.js";
import { TestableDiffClient } from "./test-host.js";

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
  expect((diffInvFile as Map<string, any>).size).toBe(1);
  const key = [...(diffInvFile as Map<string, any>).keys()][0];
  const diffInvItem = diffInvFile.get(key);
  // ensure name is erased, since it is the map key
  expect((diffInvItem as any).name).toBe(undefined);
  expect(diffInvItem.items.length).toBe(4);
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

it("should compare two Swagger folders", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/swaggerMulti"],
    rhs: ["test/files/swaggerCombined"],
    args: {},
    rules: getApplicableRules({}),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  client.buildOutput();
  const [lhs, rhs] = client.resultFiles!.raw;
  expect(rhs).toStrictEqual(lhs);
});

it("should compare a Swagger folder and a TypeSpec folder", async () => {
  const args = {
    "compile-tsp": true,
  };
  const config: DiffClientConfig = {
    lhs: ["test/files/swaggerMulti"],
    rhs: ["test/files/typespecMulti"],
    args: args,
    rules: getApplicableRules(args),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  client.buildOutput();
  const [lhs, rhs] = client.resultFiles!.normal;
  expect(rhs).toStrictEqual(lhs);
});

it("should resolve external swagger references", async () => {
  const args = {
    "compile-tsp": true,
  };
  const config: DiffClientConfig = {
    lhs: ["test/files/swaggerExternalReferences"],
    rhs: ["test/files/swaggerMulti"],
    args: args,
    rules: getApplicableRules(args),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  client.buildOutput();
  const [lhs, rhs] = client.resultFiles!.raw;
  expect(rhs).toStrictEqual(lhs);
});
