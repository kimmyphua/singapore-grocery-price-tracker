import { describe, expect, it } from "vitest";
import { isCollectorAuthorized } from "@/lib/redmart/collector-auth";

const token = "a".repeat(64);

function requestWithBearer(value: string) {
  return new Request("https://prices.example/api/collector", {
    headers: { authorization: `Bearer ${value}` },
  });
}

describe("RedMart collector authorization", () => {
  it("rejects missing and malformed authorization", () => {
    expect(
      isCollectorAuthorized(
        new Request("https://prices.example/api/collector"),
        token,
      ),
    ).toBe(false);
    expect(
      isCollectorAuthorized(
        new Request("https://prices.example/api/collector", {
          headers: { authorization: token },
        }),
        token,
      ),
    ).toBe(false);
  });

  it("rejects incorrect tokens of equal and different lengths", () => {
    expect(isCollectorAuthorized(requestWithBearer("b".repeat(64)), token)).toBe(
      false,
    );
    expect(isCollectorAuthorized(requestWithBearer("short"), token)).toBe(
      false,
    );
  });

  it("accepts the configured bearer token", () => {
    expect(isCollectorAuthorized(requestWithBearer(token), token)).toBe(true);
  });
});
