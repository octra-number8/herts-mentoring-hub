import { BaseSequencer, type TestSpecification } from "vitest/node";

/** Run files alphabetically: later files may change shared seeded state. */
export default class AlphabeticalSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
  async shard(files: TestSpecification[]) {
    return files;
  }
}
