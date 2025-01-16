import * as fs from "fs";
import { parse } from "yaml";

export interface SuppressionMetadata {
  path: string;
  reason: string;
}

export class SuppressionRegistry {
  data = new Set<string>();

  constructor(filepath: string) {
    const contents = fs.readFileSync(filepath, "utf8");
    const data: SuppressionMetadata[] = parse(contents);
    for (const item of data) {
      let path = item.path.trim().toLowerCase();
      this.data.add(path);
    }
  }

  /**
   * Associate a transformed path with an original Swagger path for use
   * in suppression violations.
   * @param key the Swagger path which serves as a key
   * @param path the transformed path to add to the suppression list
   */
  add(key: string, path: string) {
    path = path.trim().toLowerCase();
    key = key.toLowerCase();
    this.data.add(path);
  }

  /**
   * Returns true if a transformed path is included in the suppression list.
   * @param path The transformed path to check for suppression
   */
  has(path: string | undefined): boolean {
    if (!path) return false;
    path = path.trim().toLowerCase();
    return this.data.has(path);
  }
}
