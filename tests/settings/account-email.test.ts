import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAccountEmail } from "../../src/main/settings/account-email";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-email-");

describe("readAccountEmail", () => {
  it("reads oauthAccount.emailAddress from the .claude.json sibling of the config dir", () => {
    const home = makeHome();
    writeFileSync(
      join(home, ".claude.json"),
      JSON.stringify({ oauthAccount: { emailAddress: "me@example.com" } }),
    );
    expect(readAccountEmail(join(home, ".claude"))).toBe("me@example.com");
  });

  it("returns null when the file is absent", () => {
    expect(readAccountEmail(join(makeHome(), ".claude"))).toBeNull();
  });

  it("returns null when the file lacks an email, never throws", () => {
    const home = makeHome();
    writeFileSync(
      join(home, ".claude.json"),
      JSON.stringify({ oauthAccount: {} }),
    );
    expect(readAccountEmail(join(home, ".claude"))).toBeNull();
  });
});
