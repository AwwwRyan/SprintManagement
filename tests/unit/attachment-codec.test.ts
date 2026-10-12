import { describe, expect, it } from "vitest";
import { base64ByteLength, fitsStorageBudget, joinBase64, splitBase64, stripDataUrl, toDataUrl } from "@/lib/attachment-codec";
import { ATTACHMENT_CHUNK_CHARS } from "@/lib/constants";

describe("attachment codec (Firestore-stored images)", () => {
  it("splits and rejoins base64 losslessly, in index order", () => {
    const data = "QUJD".repeat(1000);
    const parts = splitBase64(data, 999);
    expect(parts.length).toBe(Math.ceil(data.length / 999));
    const shuffled = parts.map((d, index) => ({ index, data: d })).reverse();
    expect(joinBase64(shuffled)).toBe(data);
  });

  it("keeps every chunk under the Firestore 1 MiB document limit", () => {
    expect(ATTACHMENT_CHUNK_CHARS).toBeLessThan(1_000_000);
    const parts = splitBase64("A".repeat(ATTACHMENT_CHUNK_CHARS * 2 + 5));
    expect(parts.map((p) => p.length)).toEqual([ATTACHMENT_CHUNK_CHARS, ATTACHMENT_CHUNK_CHARS, 5]);
  });

  it("round-trips data URLs", () => {
    expect(stripDataUrl(toDataUrl("image/webp", "QUJD"))).toBe("QUJD");
    expect(stripDataUrl("QUJD")).toBe("QUJD");
  });

  it("computes decoded byte length including padding", () => {
    expect(base64ByteLength(Buffer.from("abc").toString("base64"))).toBe(3);
    expect(base64ByteLength(Buffer.from("abcd").toString("base64"))).toBe(4);
    expect(base64ByteLength(Buffer.from("abcde").toString("base64"))).toBe(5);
  });

  it("enforces the stored-size budget", () => {
    expect(fitsStorageBudget(Buffer.alloc(400 * 1024).toString("base64"))).toBe(true);
    expect(fitsStorageBudget(Buffer.alloc(3 * 1024 * 1024).toString("base64"))).toBe(false);
  });
});
