import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app icon", () => {
  it("provides the approved square PNG through the App Router", () => {
    const icon = readFileSync("src/app/icon.png");

    expect(icon.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
    expect(icon.readUInt32BE(16)).toBe(512);
    expect(icon.readUInt32BE(20)).toBe(512);
  });
});
