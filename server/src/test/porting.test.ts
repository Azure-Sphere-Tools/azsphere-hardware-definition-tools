import * as assert from "assert";
import * as mockfs from "mock-fs";
import * as path from "path";
import { JsonHardwareDefinition, listOdmHardwareDefinitions, portHardwareDefinition } from "../porting";
import { readFile } from "fs/promises";
import { Parser } from "../parser";
import { HW_DEFINITION_SCHEMA_URL } from "../utils";

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


suite("portHardwareDefinition", () => {
  // unmock the file system after each test
  teardown(mockfs.restore);

  test("Ports Hardware Definitions with matching app manifest values", async () => {
    const hwDefToPortName = "App";
    const hwDefToPortPath = "HardwareDefinitions/app.json";

    const targetHwDefPath = "HardwareDefinitions/odm_B.json";
    mockfs({
      "HardwareDefinitions/app.json": `
				{
          "Description": {
            "Name": "${hwDefToPortName}",
            "MainCoreHeaderFileTopContent": [ "// Some text" ]
          },
					"Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
          "Imports":[{ "Path": "odm_A.json" }],
					"Peripherals": [
            { "Name": "MY_GPIO", "Type": "Gpio", "Mapping": "GPIO_A" },
            { "Name": "MY_PWM", "Type": "Pwm", "Mapping": "PWM_A" }
           ]
				}
				`,
      "HardwareDefinitions/odm_A.json": `
				{
          "Description": { "Name": "ODM A" },
					"Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
          "Imports":[{ "Path": "mt3620.json" }],
					"Peripherals": [
            { "Name": "GPIO_A", "Type": "Gpio", "Mapping": "GPIO_1" },
            { "Name": "PWM_A", "Type": "Pwm", "Mapping": "PWM_1" }
           ]
				}
				`,
      "HardwareDefinitions/odm_B.json": `
          { 
            "Description": { "Name": "ODM B" },
            "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
            "Imports":[{ "Path": "mt3620.json" }],
            "Peripherals": [
              { "Name": "GPIO_B", "Type": "Gpio", "Mapping": "GPIO_1" },
              { "Name": "PWM_B", "Type": "Pwm", "Mapping": "PWM_1" }
             ]
          }
          `,
      "HardwareDefinitions/mt3620.json": `
            { 
              "Description": { "Name": "Root HW Definition" },
              "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
              "Peripherals": [
                { "Name": "GPIO_1", "Type": "Gpio", "AppManifestValue": 1 },
                { "Name": "PWM_1", "Type": "Pwm", "AppManifestValue": "PWM-CONTROLLER-1" }
               ]
            }
            `
    });

    const { jsonHwDef, hwDefToPort, targetHwDef } = await preparePortingInput(hwDefToPortPath, targetHwDefPath);
    
    const actualPorted = JSON.stringify(portHardwareDefinition(jsonHwDef, hwDefToPort, targetHwDef, targetHwDefPath));
    
    const expectedPorted = `
    {
      "$schema": "${HW_DEFINITION_SCHEMA_URL}",
      "Description": { 
        "Name": "Ported to support ${targetHwDefPath} - Created from ${hwDefToPortName}",
        "MainCoreHeaderFileTopContent": [ "// Some text" ]      
      },
      "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
      "Imports":[{ "Path": "${targetHwDefPath}" }],
      "Peripherals": [
        { "Name": "MY_GPIO", "Type": "Gpio", "Mapping": "GPIO_B" },
        { "Name": "MY_PWM", "Type": "Pwm", "Mapping": "PWM_B" }
       ]
    }`;
    assert.deepStrictEqual(JSON.parse(actualPorted), JSON.parse(expectedPorted));
  });

  test("Replaces peripherals without exact match with available pins of same type", async () => {
    const hwDefToPortName = "App";
    const hwDefToPortPath = "HardwareDefinitions/app.json";

    const targetHwDefPath = "HardwareDefinitions/odm_B.json";
    mockfs({
      "HardwareDefinitions/app.json": `
				{
          "Description": { "Name": "${hwDefToPortName}" },
					"Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
          "Imports":[{ "Path": "odm_A.json" }],
					"Peripherals": [
            {"Name": "MY_LED", "Type": "Gpio", "Mapping": "ODM_A_GPIO0" },
            {"Name": "MY_BUTTON", "Type": "Gpio", "Mapping": "ODM_A_GPIO1" }
           ]
				}
				`,
      "HardwareDefinitions/odm_A.json": `
				{
					
          "Description": { "Name": "ODM A" },
					"Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
          "Imports":[{ "Path": "mt3620.json" }],
					"Peripherals": [
            {"Name": "ODM_A_GPIO0", "Type": "Gpio", "Mapping": "GPIO0" },
            {"Name": "ODM_A_GPIO1", "Type": "Gpio", "Mapping": "GPIO1" }
           ]
				}
				`,
      "HardwareDefinitions/odm_B.json": `
          {
            
            "Description": { "Name": "ODM B" },
            "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
            "Imports":[{ "Path": "mt3620.json" }],
            "Peripherals": [
              {"Name": "ODM_B_GPIO1", "Type": "Gpio", "Mapping": "GPIO1" },
              {"Name": "ODM_B_GPIO2", "Type": "Gpio", "Mapping": "GPIO2" }
             ]
          }
          `,
      "HardwareDefinitions/mt3620.json": `
            {
              
              "Description": { "Name": "Root HW Definition" },
              "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
              "Peripherals": [
                {"Name": "GPIO0", "Type": "Gpio", "AppManifestValue": 0 },
                {"Name": "GPIO1", "Type": "Gpio", "AppManifestValue": 1 },
                {"Name": "GPIO2", "Type": "Gpio", "AppManifestValue": 2 }
               ]
            }
            `
    });

    const { jsonHwDef, hwDefToPort, targetHwDef } = await preparePortingInput(hwDefToPortPath, targetHwDefPath);

    const actualPorted = JSON.stringify(portHardwareDefinition(jsonHwDef, hwDefToPort, targetHwDef, targetHwDefPath));
    
    const expectedPorted = `
    {
      "$schema": "${HW_DEFINITION_SCHEMA_URL}",
      "Description": { "Name": "Ported to support ${targetHwDefPath} - Created from ${hwDefToPortName}" },
      "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
      "Imports":[{ "Path": "${targetHwDefPath}" }],
      "Peripherals": [
        {"Name": "MY_LED", "Type": "Gpio", "Mapping": "ODM_B_GPIO2" },
        {"Name": "MY_BUTTON", "Type": "Gpio", "Mapping": "ODM_B_GPIO1" }
       ]
    }`;
    assert.deepStrictEqual(JSON.parse(actualPorted), JSON.parse(expectedPorted));
  });

  test("Preserves peripherals if can't find exact matches or alternative pins of same type", async () => {
    const hwDefToPortName = "App";
    const hwDefToPortPath = "HardwareDefinitions/app.json";

    const targetHwDefPath = "HardwareDefinitions/odm_B.json";
    mockfs({
      "HardwareDefinitions/app.json": `
				{
          "Description": { "Name": "${hwDefToPortName}" },
					"Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
          "Imports":[{ "Path": "odm_A.json" }],
					"Peripherals": [
            { "Name": "VALID_PIN", "Type": "Gpio", "Mapping": "GPIO_A" },
            { "Name": "PIN_WITH_UNKNOWN_MAPPING", "Type": "Gpio", "Mapping": "SOME_UNKNOWN_PIN" },
            { "Name": "PIN_WITHOUT_MAPPING_FIELD", "Type": "Pwm", "AppManifestValue": "PWM-CONTROLLER-1" },
            { "Name": "PIN_WITHOUT_ALTERNATIVES", "Type": "Adc", "Mapping": "ADC_0" }
           ]
				}
				`,
      "HardwareDefinitions/odm_A.json": `
				{
					
          "Description": { "Name": "ODM A" },
					"Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
          "Imports":[{ "Path": "mt3620.json" }],
					"Peripherals": [
            { "Name": "GPIO_A", "Type": "Gpio", "Mapping": "GPIO_1" },
            { "Name": "ADC_A", "Type": "Adc", "Mapping": "ADC_0" },
           ]
				}
				`,
      "HardwareDefinitions/odm_B.json": `
          {
            
            "Description": { "Name": "ODM B" },
            "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
            "Imports":[{ "Path": "mt3620.json" }],
            "Peripherals": [
              { "Name": "GPIO_B", "Type": "Gpio", "Mapping": "GPIO_1" }
             ]
          }
          `,
      "HardwareDefinitions/mt3620.json": `
            {
              
              "Description": { "Name": "Root HW Definition" },
              "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
              "Peripherals": [
                { "Name": "GPIO_1", "Type": "Gpio", "AppManifestValue": 1 },
                { "Name": "ADC_0", "Type": "Adc", "AppManifestValue": "ADC-CONTROLLER-0" }
               ]
            }
            `
    });

    const { jsonHwDef, hwDefToPort, targetHwDef } = await preparePortingInput(hwDefToPortPath, targetHwDefPath);

    const actualPorted = JSON.stringify(portHardwareDefinition(jsonHwDef, hwDefToPort, targetHwDef, targetHwDefPath));
    
    const expectedPorted = `
    {
      "$schema": "${HW_DEFINITION_SCHEMA_URL}",
      "Description": { "Name": "Ported to support ${targetHwDefPath} - Created from ${hwDefToPortName}" },
      "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
      "Imports":[{ "Path": "${targetHwDefPath}" }],
      "Peripherals": [
        { "Name": "VALID_PIN", "Type": "Gpio", "Mapping": "GPIO_B" },
        { "Name": "PIN_WITH_UNKNOWN_MAPPING", "Type": "Gpio", "Mapping": "SOME_UNKNOWN_PIN" },
        { "Name": "PIN_WITHOUT_MAPPING_FIELD", "Type": "Pwm", "AppManifestValue": "PWM-CONTROLLER-1" },
        { "Name": "PIN_WITHOUT_ALTERNATIVES", "Type": "Adc", "Mapping": "ADC_0" }
       ]
    }`;
    assert.deepStrictEqual(JSON.parse(actualPorted), JSON.parse(expectedPorted));
  });
});

async function preparePortingInput(hwDefToPortPath: string, targetHwDefPath: string) {
  const hwDefText = await readFile(hwDefToPortPath, { encoding: "utf8" });
  const hwDefToPort = new Parser().tryParseHardwareDefinitionFile(hwDefText, "", "");
  assert.ok(hwDefToPort);
  const targetHwDef = new Parser().tryParseHardwareDefinitionFile(await readFile(targetHwDefPath, { encoding: "utf8" }), "", "");
  assert.ok(targetHwDef);
  const jsonHwDef = <JsonHardwareDefinition>JSON.parse(hwDefText);
  return { jsonHwDef, hwDefToPort, targetHwDef };
}