import { describe, expect, it } from "vitest";
import { formatSingaporeDateTime } from "@/lib/format/date-time";

describe("date formatting", () => {
  it("formats dashboard timestamps in Singapore time", () => {
    expect(formatSingaporeDateTime("2026-06-03T11:33:00.000Z")).toBe("3 Jun, 07:33 pm");
  });
});
