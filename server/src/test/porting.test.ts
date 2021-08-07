import * as assert from "assert";
import { tryParseHardwareDefinitionFile } from "../server";
import * as mockfs from "mock-fs";
import * as path from "path";
import { listOdmHardwareDefinitions } from "../porting";

suite("listOdmHardwareDefinitions", () => {
  // unmock the file system after each test
  teardown(mockfs.restore);

  test("Lists Hardware Definition files under ${SdkPath}/HardwareDefinitions with Description and Metadata", async () => {
    const sdkPath = path.resolve("pathToSdk");
    const validHwDefName = "Valid";
    const validHwDefPath = path.join(sdkPath, "HardwareDefinitions/valid.json");
    
    mockfs({
      "pathToSdk/HardwareDefinitions/valid.json": `
				{
          "Description": { "Name": "${validHwDefName}" },
					"Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
					"Peripherals": [ ]
				}
				`,
      "pathToSdk/HardwareDefinitions/invalid.json": `
				{
					"SomeJsonWithNoDescriptionOrMetadata": [1, 2, 3]
				}
				`,
    });
    
    const actualHwDefinitions = await listOdmHardwareDefinitions(sdkPath);
    
    assert.strictEqual(actualHwDefinitions.length, 1);
    assert.strictEqual(actualHwDefinitions[0].name, validHwDefName);
    assert.strictEqual(actualHwDefinitions[0].path, validHwDefPath);
  });
});