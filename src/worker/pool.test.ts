import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./pool";

describe("mapWithConcurrency", () => {
  it("never starts more than the configured concurrency", async () => {
    let active = 0;
    let maxActive = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 4, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return item;
    });

    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it("can stop after a batch", async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => item, (current) => current.length < 4);

    expect(results).toEqual([1, 2, 3, 4]);
  });
});
