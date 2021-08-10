import * as assert from "assert";
import { hwDefinitionHeaderGen } from "../hwDefHeaderGeneration";

suite("hardwareDefinitionHeaderGeneration", () => {
  test("Valid command execution", async () => {
    const actual = await hwDefinitionHeaderGen(__dirname, "cd");

    if (actual) {
      assert.deepStrictEqual(actual.type, 3);
    } else {
      assert.fail("The command was not run successfully.");
    }
  });

  test("Invalid command execution - folder doesn't exist", async () => {
    const actual = await hwDefinitionHeaderGen("test/invalidfolder", "cd");

    if (actual) {
      assert.deepStrictEqual(actual.type, 1);
      // Will handle both stderr && err
      assert.deepStrictEqual(actual.message.includes("Header file generation error"), true);
    } else {
      assert.fail("Hardware definition header generation AS command was not successful.");
    }
  });
});
