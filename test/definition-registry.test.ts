import { expect, it } from "vitest";
import { DiffClientConfig } from "../src/index.js";
import { getApplicableRules } from "../src/rules/rules.js";
import { TestableDiffClient } from "./test-host.js";
import { fail } from "assert";
import { DefinitionRegistry, RegistryKind } from "../src/definitions.js";
import { SwaggerParser } from "../src/parser.js";

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
  const expectedPath = `${rootPath}\\test\\files\\test1a.json`;
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
