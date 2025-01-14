export class SuppressionManager {
  flatList = new Set<string>();
  data: Map<string, string[]>;

  constructor(paths: string[]) {
    this.data = new Map<string, string[]>();
    for (const path of paths) {
      this.data.set(path, []);
    }
  }

  /**
   * Associate a transformed path with an original Swagger path for use
   * in suppression violations.
   * @param key the Swagger path which serves as a key
   * @param path the transformed path to add to the suppression list
   */
  add(key: string, path: string) {
    const values = this.data.get(key);
    if (!values) return;
    values.push(path);
    this.flatList.add(path);
    this.data.set(key, values);
  }

  /**
   * Returns true if a transformed path is included in the suppression list.
   * @param path The transformed path to check for suppression
   */
  has(path: string): boolean {
    return this.flatList.has(path);
  }
}
