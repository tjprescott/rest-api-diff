import * as fs from "fs";
import { parse } from "yaml";
import { getRegistryName, ReferenceMetadata } from "./util.js";

export interface SuppressionMetadata {
  path: string;
  reason: string;
}

export class SuppressionRegistry {
  private data = new Set<string>();
  public originalSuppressionCount = 0;

  constructor(filepath: string) {
    const contents = fs.readFileSync(filepath, "utf8");
    const data: SuppressionMetadata[] = parse(contents) ?? [];
    for (const item of data) {
      let path = item.path.trim().toLowerCase();
      this.add(path);
    }
    this.originalSuppressionCount = this.data.size;
  }

  /**
   * Associate a transformed path with an original Swagger path for use
   * in suppression violations.
   * @param key the Swagger path which serves as a key
   * @param path the transformed path to add to the suppression list
   */
  add(path: string) {
    path = path.trim().toLowerCase();
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

  propagateSuppression(ref: ReferenceMetadata, basePath: string[] | undefined) {
    if (!basePath) throw new Error("basePath is undefined");
    const base = basePath.join("/");
    const target = `${getRegistryName(ref.registry)}/${ref.name}`.toLowerCase();
    for (const item of this.data) {
      if (item.startsWith(target)) {
        // create a new string suppression propagating the suppression onto the base path
        const newItem = item.replace(target, base);
        this.add(newItem);
      }
    }
  }
}
