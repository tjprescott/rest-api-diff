export class SuppressionRegistry {
  data = new Set<string>();

  constructor(paths: string[]) {
    this.data = new Set<string>();
    for (let path of paths) {
      path = path.trim().toLowerCase();
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
