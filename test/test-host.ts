import { DiffClient, DiffClientConfig } from "../src/diff-client.js";
import { SwaggerParser } from "../src/parser.js";

export class TestableDiffClient extends DiffClient {
  /** Retrieve the normally private parser objects for testing. */
  getParsers(): [SwaggerParser, SwaggerParser] {
    const values = [(this as any).lhsParser, (this as any).rhsParser];
    if (!values[0] || !values[1]) {
      throw new Error("Parsers not initialized.");
    }
    return values as [SwaggerParser, SwaggerParser];
  }

  /** Creates an instance of the DiffClient class asynchronously. */
  static async create(config: DiffClientConfig): Promise<TestableDiffClient> {
    const instance = (await super.create(config)) as TestableDiffClient;
    Object.setPrototypeOf(instance, TestableDiffClient.prototype);
    return instance;
  }
}
