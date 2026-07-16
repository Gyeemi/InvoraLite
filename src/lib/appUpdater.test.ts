import { describe, expect, it } from "vitest";
import { isNoRemoteUpdateManifestError } from "./appUpdater";

describe("isNoRemoteUpdateManifestError", () => {
  it("treats missing GitHub latest.json as no update", () => {
    expect(
      isNoRemoteUpdateManifestError(
        "Could not fetch a valid release JSON from the remote",
      ),
    ).toBe(true);
  });

  it("does not swallow unrelated failures", () => {
    expect(isNoRemoteUpdateManifestError("signature verification failed")).toBe(
      false,
    );
  });
});
