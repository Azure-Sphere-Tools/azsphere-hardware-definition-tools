import path = require("path");
import * as assert from "assert";
import * as mockfs from "mock-fs";
import { getPinTypes, addPinMappings } from "../pinMappingGeneration";
import * as jsonc from "jsonc-parser";
import * as fs from "fs";
import { Parser } from "../parser";
import { asURI, getDummyPinMapping } from "./testUtils";
import { HardwareDefinition } from "../hardwareDefinition";

suite("pinMappingGeneration", () => {
  const text = `{"Imports":[{ "Path": "odm.json" }],"Peripherals": [{ "Name": "TEMPLATE_LED", "Type": "Gpio", "Mapping": "SEEED_MT3620_MDB_USER_LED" }], "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 }}`;
  const obj = {
    "my_app/my_application.json": text,
    "my_app/odm.json": `{"Peripherals": [{ "Name": "TEMPLATE_LED", "Type": "Gpio", "Mapping": "SEEED_MT3620_MDB_USER_LED2" }], "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 }}`,
  };
  const hwDefPath = path.resolve("my_app/my_application.json");
  const hwDefUri = asURI(hwDefPath);

  setup(() => {
    mockfs(obj);
  });

  teardown(mockfs.restore);
  test("Get correct available pin type", async () => {
    const hwDefinition = new Parser().tryParseHardwareDefinitionFile(fs.readFileSync(hwDefPath, { encoding: 'utf8' }), hwDefUri, '');
    assert.ok(hwDefinition);
    const actual: string[] | undefined = await getPinTypes(hwDefinition);

    if (actual) {
      assert.deepStrictEqual(actual, ["Gpio"]);
    } else {
      assert.fail("Wrong pin type detected");
    }
  });

  test("Does not suggest types whose pins have all been assigned", async () => {
    const importedwDef = new HardwareDefinition("anyuri", undefined, [getDummyPinMapping({ name: "GPIO1", appManifestValue: 1 })]);
    const hwDefinition = new HardwareDefinition("anyUri", undefined, [getDummyPinMapping({ name: "LED", mapping: "GPIO1" })], [importedwDef]);
    
    const actualPinTypesCount = (await getPinTypes(hwDefinition))?.length;
    const expectedPinTypesCount = 0;

    assert.strictEqual(actualPinTypesCount, expectedPinTypesCount);
  });

  test("Add pin mappings to file under 'Peripherals'", async () => {
    const pinsToAdd: string[] = ["SEEED_MT3620_MDB_J1_PIN1_GPIO4", "SEEED_MT3620_MDB_J1_PIN1_GPIO41"];
    const pinType = "Gpio";

    await addPinMappings(pinsToAdd, pinType, hwDefUri, text);

    const expected = jsonc.parse(text);
    pinsToAdd.forEach((pin) =>
      expected["Peripherals"].push({
        Name: "",
        Type: pinType,
        Mapping: pin,
      })
    );

    const actual = jsonc.parse(fs.readFileSync(hwDefPath, { encoding: "utf8" }));

    if (actual) {
      assert.deepStrictEqual(actual, expected);
    } else {
      assert.fail("Pin mappings not added as expected");
    }
  });
});
