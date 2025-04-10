import { expect, it } from "vitest";
import { DiffClientConfig } from "../src/index.js";
import { getApplicableRules } from "../src/rules/rules.js";
import { TestableDiffClient } from "./test-host.js";
import { DefinitionRegistry, RegistryKind } from "../src/definitions.js";
import { SwaggerParser } from "../src/parser.js";
import { extractFileReferences, toSorted } from "../src/util.js";
import path from "path";

function getDefinitionRegistry(parser: SwaggerParser): DefinitionRegistry {
  return (parser as any).defRegistry as DefinitionRegistry;
}

it("has resolved paths as top-level keys", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/test1a.json"],
    rhs: ["test/files/test1b.json"],
    args: {},
    rules: getApplicableRules({}),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  const [parser, _] = client.getParsers();
  const defRegistry = getDefinitionRegistry(parser).getCollection(
    RegistryKind.Definition
  );
  const regKeys = Object.keys(defRegistry);
  expect(regKeys.length).toBe(1);
  const rootPath = process.cwd();
  const expectedPath = path.normalize(`${rootPath}/test/files/test1a.json`);
  expect(regKeys[0]).toBe(expectedPath);
  const regVals = Object.values(defRegistry);
  expect(regVals.length).toBe(1);
  const firstVal = regVals[0] as Map<string, any>;
  expect(firstVal.size).toBe(1);
  expect(firstVal.has("Foo")).toBe(true);
});

it("has simple values as item keys", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/test1a.json"],
    rhs: ["test/files/test1b.json"],
    args: {},
    rules: getApplicableRules({}),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  const [parser, _] = client.getParsers();
  const defRegistry = getDefinitionRegistry(parser).getCollection(
    RegistryKind.Definition
  );
  const regVals = Object.values(defRegistry);
  expect(regVals.length).toBe(1);
  const firstVal = regVals[0] as Map<string, any>;
  expect(firstVal.size).toBe(1);
  expect(firstVal.has("Foo")).toBe(true);
});

it("has resolved paths as top-level keys when loading a folder", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/swaggerMulti"],
    rhs: ["test/files/swaggerCombined"],
    args: {},
    rules: getApplicableRules({}),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  const [lhs, rhs] = client.getParsers();
  const lhsDefs = getDefinitionRegistry(lhs).getCollection(
    RegistryKind.Definition
  );
  const lhsKeys = Object.keys(lhsDefs);
  expect(lhsKeys.length).toBe(1);
  const rootPath = process.cwd();
  const expectedLhsPath = path.normalize(
    `${rootPath}/test/files/swaggerMulti/models.json`
  );
  expect(lhsKeys[0]).toBe(expectedLhsPath);
  const regLhsVals = Object.values(lhsDefs);
  expect(regLhsVals.length).toBe(1);
  const firstLhsVal = regLhsVals[0] as Map<string, any>;
  expect(firstLhsVal.size).toBe(1);
  expect(firstLhsVal.has("Foo")).toBe(true);

  const rhsDefs = getDefinitionRegistry(rhs).getCollection(
    RegistryKind.Definition
  );
  const rhsKeys = Object.keys(rhsDefs);
  expect(lhsKeys.length).toBe(1);
  const expectedRhsPath = path.normalize(
    `${rootPath}/test/files/swaggerCombined/combined.json`
  );
  expect(rhsKeys[0]).toBe(expectedRhsPath);
  const regRhsVals = Object.values(lhsDefs);
  expect(regRhsVals.length).toBe(1);
  const firstRhsVal = regRhsVals[0] as Map<string, any>;
  expect(firstRhsVal.size).toBe(1);
  expect(firstRhsVal.has("Foo")).toBe(true);
});

it("has simple values as item keys when loading a folder", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/swaggerMulti"],
    rhs: ["test/files/swaggerCombined"],
    args: {},
    rules: getApplicableRules({}),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  const [parser, _] = client.getParsers();
  const defRegistry = getDefinitionRegistry(parser).getCollection(
    RegistryKind.Definition
  );
  const regVals = Object.values(defRegistry);
  expect(regVals.length).toBe(1);
  const firstVal = regVals[0] as Map<string, any>;
  expect(firstVal.size).toBe(1);
  expect(firstVal.has("Foo")).toBe(true);
});

it("should resolve external references", async () => {
  const cwd = process.cwd();
  const filePath = path.normalize(
    `${cwd}/test/files/swaggerExternalReferences/operations.json`
  );
  const references = toSorted(await extractFileReferences(filePath, undefined));
  const expected = toSorted([
    path.normalize(`${cwd}/test/files/common/common.json`),
    path.normalize(`${cwd}/test/files/swaggerExternalReferences/models.json`),
    path.normalize(
      `${cwd}/test/files/swaggerExternalReferences/operations.json`
    ),
  ]);
  expect(references).toStrictEqual(expected);
});

it("should resolve external references with relative references", async () => {
  const cwd = process.cwd();
  const filePath = path.normalize(
    `${cwd}/test/files/swaggerExternalReferences/externalRelativeReferences.json`
  );
  const references = toSorted(await extractFileReferences(filePath, undefined));
  const expected = toSorted([
    path.normalize(`${cwd}/test/files/common/common.json`),
    path.normalize(`${cwd}/test/files/common/otherCommon.json`),
    path.normalize(`${cwd}/test/files/swaggerExternalReferences/models.json`),
  ]);
  expect(references).toStrictEqual(expected);
});

it("should ignore example references", async () => {
  const cwd = process.cwd();
  const filePath = path.normalize(
    `${cwd}/test/files/swaggerExternalReferences/operations.json`
  );
  const references = toSorted(await extractFileReferences(filePath, undefined));
  for (const ref of references) {
    expect(ref.includes("examples")).toBe(false);
  }
});

it("expands inheritance chains", async () => {
  const config: DiffClientConfig = {
    lhs: ["test/files/inheritanceChain.json"],
    rhs: ["test/files/inheritanceChain.json"],
    args: {},
    rules: getApplicableRules({}),
  };
  const client = await TestableDiffClient.create(config);
  client.parse();
  const [parser, _] = client.getParsers();
  const defRegistry = getDefinitionRegistry(parser).getCollection(
    RegistryKind.Definition
  );
  let filePath = Object.keys(defRegistry)[0];
  let quad = defRegistry[filePath].get("D");
  let expected_properties = ["aProp", "bProp", "cProp", "dProp"];
  for (const prop of expected_properties) {
    expect(quad.properties).toHaveProperty(prop);
  }
});
