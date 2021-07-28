import path = require("path");
import * as assert from "assert";
import * as mockfs from "mock-fs";
import { getPinTypes, addPinMappings } from "../pinMappingGeneration";
import * as jsonc from "jsonc-parser";
import * as fs from "fs";

suite("pinMappingGeneration", () => {
  const text = `{"Imports":[{ "Path": "odm.json" }],"Peripherals": [{ "Name": "TEMPLATE_LED", "Type": "Gpio", "Mapping": "SEEED_MT3620_MDB_USER_LED" }]}`;
  const obj = {
    "my_app/my_appmanifest.json": text,
    "my_app/odm.json": `{"Peripherals": [{ "Name": "TEMPLATE_LED", "Type": "Gpio", "Mapping": "SEEED_MT3620_MDB_USER_LED2" }]}`,
  };
  const uri = path.resolve("my_app/my_appmanifest.json");

  setup(() => {
    mockfs(obj);
  });

  teardown(mockfs.restore);
  test("Get correct available pin type", async () => {
    const actual: string[] | undefined = await getPinTypes(uri);

    if (actual) {
      assert.deepStrictEqual(actual, ["Gpio"]);
    } else {
      assert.fail("Wrong pin type detected");
    }
  });

  test("Add pin mappings to file under 'Peripherals'", async () => {
    const pinsToAdd: string[] = ["SEEED_MT3620_MDB_J1_PIN1_GPIO4", "SEEED_MT3620_MDB_J1_PIN1_GPIO41"];
    const pinType = "Gpio";
    const currentFile = { text: text, uri: uri };

    await addPinMappings(pinsToAdd, pinType, currentFile);

    const expected = jsonc.parse(text);
    pinsToAdd.forEach((pin) =>
      expected["Peripherals"].push({
        Name: "",
        Type: pinType,
        Mapping: pin,
      })
    );

    const actual = jsonc.parse(fs.readFileSync(uri, { encoding: "utf8" }));

    if (actual) {
      assert.deepStrictEqual(actual, expected);
    } else {
      assert.fail("Pin mappings not added as expected");
    }
  });
});
