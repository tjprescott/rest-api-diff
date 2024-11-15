import { RuleSignature } from "./rules/rules.js";

export interface DiffClientConfig {
  lhs: string[];
  rhs: string[];
  rules?: RuleSignature[];
  options: any;
}

export class DiffClient {
  constructor(config: DiffClientConfig) {
    console.log("DiffClient constructor");
  }
}
