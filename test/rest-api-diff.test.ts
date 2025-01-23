import { expect, it } from "vitest";
import { getApplicableRules, RuleResult } from "../src/rules/rules.js";
import { DiffClientConfig } from "../src/diff-client.js";
import { TestableDiffClient } from "./test-host.js";
import { loadPaths, toSorted } from "../src/util.js";
import fs from "fs";
import os from "os";
import path from "path";
import { Diff } from "deep-diff";

it("config should group violations when --group-violations is set", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-output-"));
  const args = { "group-violations": true, "output-folder": tempDir };
  const config: DiffClientConfig = {
    lhs: ["test/files/test2a.json"],
    rhs: ["test/files/test2b.json"],
    args: args,
    rules: getApplicableRules(args),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  client.buildOutput();
  client.writeOutput();

  const diffPath = path.join(tempDir, "diff.json");
  const diffFile = JSON.parse(fs.readFileSync(diffPath, "utf8"));
  const keys = [...Object.keys(diffFile)];
  expect(keys).toStrictEqual([
    "Changed_format (AUTO)",
    "Added_favoriteColor (AUTO)",
    "ArrayItem_Added_required (AUTO)",
  ]);

  const diffInvPath = path.join(tempDir, "diff-inv.json");
  const diffInvFile = JSON.parse(fs.readFileSync(diffInvPath, "utf8"));
  const invKeys = [...Object.keys(diffInvFile)];
  expect(invKeys).toStrictEqual([
    "ignoreSwaggerPropertiesRule",
    "ignoreSwaggerDefinitionsRule",
  ]);

  // Ensure the values are sorted by value
  const invCounts = Object.values(diffInvFile).map(
    (item: any) => item.items.length
  );
  expect(invCounts).toStrictEqual([7, 3]);
  expect(invCounts).toStrictEqual(invCounts.sort());

  // ensure name is removed from each value
  for (const val of Object.values(diffInvFile)) {
    expect((val as any).name).toBeUndefined();
  }
});

it("config should flatten paths when --flatten-paths is set", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-output-"));
  const args = { "flatten-paths": true, "output-folder": tempDir };
  const config: DiffClientConfig = {
    lhs: ["test/files/test2a.json"],
    rhs: ["test/files/test2b.json"],
    args: args,
    rules: getApplicableRules(args),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  client.buildOutput();
  client.writeOutput();

  const diffPath = path.join(tempDir, "diff.json");
  const items = JSON.parse(fs.readFileSync(diffPath, "utf8"));
  expect(items[0].diff.path).toEqual(
    "paths/%2F/get/responses/200/schema/properties/age/format"
  );
});

it("config should flatten paths when --flatten-paths and --group-violations is set", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-output-"));
  const args = {
    "flatten-paths": true,
    "group-violations": true,
    "output-folder": tempDir,
  };
  const config: DiffClientConfig = {
    lhs: ["test/files/test2a.json"],
    rhs: ["test/files/test2b.json"],
    args: args,
    rules: getApplicableRules(args),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  client.buildOutput();
  client.writeOutput();

  const diffPath = path.join(tempDir, "diff.json");
  const diffFile = JSON.parse(fs.readFileSync(diffPath, "utf8"));
  const items = diffFile["Changed_format (AUTO)"].items;
  expect(items[0].diff.path).toEqual(
    "paths/%2F/get/responses/200/schema/properties/age/format"
  );
});

it("config should not group violations when --group-violations is not set", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-output-"));
  const args = { "output-folder": tempDir };
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
  client.writeOutput();

  const filePath = path.join(tempDir, "diff-inv.json");
  const diffInvFile = JSON.parse(fs.readFileSync(filePath, "utf8"));
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
    "rhs-root": "test/files/typespecMulti",
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
}, 30000); // longer timeout necessary to compile TypeSpec

it("should resolve external swagger references", async () => {
  const paths = await loadPaths(
    ["test/files/swaggerExternalReferences"],
    undefined,
    {}
  );
  const pathKeys = toSorted([...paths.keys()]);
  const cwd = process.cwd();
  const expected = toSorted([
    path.normalize(`${cwd}/test/files/common/common.json`),
    path.normalize(`${cwd}/test/files/common/otherCommon.json`),
    path.normalize(
      `${cwd}/test/files/swaggerExternalReferences/externalRelativeReferences.json`
    ),
    path.normalize(`${cwd}/test/files/swaggerExternalReferences/models.json`),
    path.normalize(
      `${cwd}/test/files/swaggerExternalReferences/operations.json`
    ),
  ]);
  expect(paths.size).toBe(5);
  expect(pathKeys).toStrictEqual(expected);
});

it("should compare folders with external references", async () => {
  const args = {};
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
  const [lhs, rhs] = client.resultFiles!.normal;
  expect(rhs).toStrictEqual(lhs);
});

function noNameRule(data: Diff<any, any>): any {
  if (data.path?.includes("name")) {
    return RuleResult.FlaggedViolation;
  }
}

function nameOkayRule(data: Diff<any, any>): any {
  if (data.path?.includes("name")) {
    return RuleResult.NoViolation;
  }
}

it("a rule that declares noViolation should override a rule that flags a violation", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/test1a.json"],
    rhs: ["test/files/test1b.json"],
    args: {},
    rules: [noNameRule, nameOkayRule],
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  for (const violation of client.diffResults?.noViolations ?? []) {
    expect(violation.ruleName).toBe("nameOkayRule");
  }
  expect(client.diffResults?.flaggedViolations.length).toBe(0);
});

it("matching no rule should results in an UNGROUPED violation", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/test1a.json"],
    rhs: ["test/files/test1b.json"],
    args: {},
    rules: [],
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  expect(client.diffResults?.flaggedViolations.length).toBe(0);
  expect(client.diffResults?.noViolations.length).toBe(0);
  for (const violation of client.diffResults?.assumedViolations ?? []) {
    expect(violation.ruleName).toBeUndefined();
  }
});

it("should normalize body parameter names for stable sorting", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/test4a.json"],
    rhs: ["test/files/test4b.json"],
    args: {},
    rules: getApplicableRules({}),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  expect(client.diffResults?.flaggedViolations.length).toBe(0);
  expect(client.diffResults?.noViolations.length).toBe(0);
  expect(client.diffResults?.assumedViolations.length).toBe(0);
});

it("should propagate suppressions that are expanded during parsing", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/suppressions1a.json"],
    rhs: ["test/files/suppressions1b.json"],
    args: {
      suppressions: "test/files/suppressions1.yaml",
    },
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
  expect(client.diffResults?.suppressedViolations.length).toBe(2);
  expect(client.diffResults?.noViolations.length).toBe(1);
});

it("should propagate suppressions that are expanded while collecting definitions", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/suppressions2a.json"],
    rhs: ["test/files/suppressions2b.json"],
    args: {
      suppressions: "test/files/suppressions2.yaml",
    },
    rules: [],
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  expect(client.diffResults?.flaggedViolations.length).toBe(0);
  expect(client.diffResults?.noViolations.length).toBe(0);
  expect(client.diffResults?.assumedViolations.length).toBe(0);
});

it("should sort arrays of strings for stable comparison", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/test5a.json"],
    rhs: ["test/files/test5b.json"],
    args: {},
    rules: getApplicableRules({}),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  client.processDiff();
  expect(client.diffResults?.flaggedViolations.length).toBe(0);
  expect(client.diffResults?.noViolations.length).toBe(2);
  expect(client.diffResults?.assumedViolations.length).toBe(0);
});
