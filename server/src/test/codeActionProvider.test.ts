import * as assert from "assert";
import { HardwareDefinition } from "../hardwareDefinition";
import { findPinMappingRange, quickfix } from "../codeActionProvider";
import { asURI, getRange, getDummyPinMapping } from "./testUtils";
import { CodeActionParams, Diagnostic } from "vscode-languageserver";
import { flatten, validateNamesAndMappings, validatePinBlock } from "../validator";
import * as mockfs from 'mock-fs';
import { tryParseHardwareDefinitionFile } from "../server";
import * as fs from 'fs';


suite("findPinMappingRange", () => {
  test("Find Warning Pin Mapping", () => {
    const gpioPin = getDummyPinMapping({ range: getRange(0, 0, 0, 5), name: "GPIO0", type: "Gpio", appManifestValue: 0 });
    const importedhwDefFilePath = "my_app/hardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin]);

    const hwDefFilePath = "my_app/ODM.json";
    const validPin1 = getDummyPinMapping({ range: getRange(0, 0, 0, 7), name: "LED_RED", type: "Gpio", mapping: { value: { range: getRange(0, 2, 0, 3), text: "GPIO0" } } });
    const validPin2 = getDummyPinMapping({ range: getRange(1, 0, 1, 7), name: "LED_BLUE", type: "Gpio", mapping: { value: { range: getRange(1, 2, 1, 3), text: "GPIO0" } } });
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin1,validPin2], [importedhwDefinitionFile]);

    const warningPinMapping = findPinMappingRange({line: 1, character: 2}, hwDefinitionFile);

    if (warningPinMapping) {
      assert.strictEqual(warningPinMapping.name.value.text, "LED_BLUE");
    }else {
      assert.fail("Warning Pin Mapping was not found");
    }
  });
});


suite("quickfix", () => {
  teardown(mockfs.restore);
  test("Delete the Duplicate pin mapping", () => {
    const gpioPin = getDummyPinMapping({ range: getRange(0, 0, 0, 5), name: "GPIO0", type: "Gpio", appManifestValue: 0 });
    const importedhwDefFilePath = "my_app/hardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin]);

    const hwDefFilePath = "my_app/ODM.json";
    const validPin1 = getDummyPinMapping({ range: getRange(0, 0, 0, 7), name: "LED_RED", type: "Gpio", mapping: { value: { range: getRange(0, 2, 0, 3), text: "GPIO0" } } });
    const validPin2 = getDummyPinMapping({ range: getRange(1, 0, 1, 7), name: "LED_BLUE", type: "Gpio", mapping: { value: { range: getRange(1, 2, 1, 3), text: "GPIO0" } } });
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin1,validPin2], [importedhwDefinitionFile]);

		const allPeripherals = flatten(hwDefinitionFile).indexedByName;
    const diagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinitionFile, allPeripherals, true);
    
    const params: CodeActionParams = {
      context: {diagnostics: diagnostics},
      range: {
        start: {character: 0, line: 0},
        end: {character: 1, line: 0}
      },
      textDocument: {uri: asURI(hwDefFilePath)}
    };
    const codeAction = quickfix(hwDefinitionFile,params);
    assert.strictEqual(codeAction[0].title, "Delete the Duplicate pin mapping");

  });

  test("Delete the Invalid pin mapping", () => {
    const gpioPin = getDummyPinMapping({ range: getRange(0, 0, 0, 5), name: "GPIO0", type: "Gpio", appManifestValue: 0 });
    const importedhwDefFilePath = "my_app/hardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin]);

    const hwDefFilePath = "my_app/ODM.json";
    const validPin1 = getDummyPinMapping({ range: getRange(0, 0, 0, 7), name: "LED_RED", type: "Gpio", mapping: { value: { range: getRange(0, 2, 0, 3), text: "GPIO0" } } });
    const validPin2 = getDummyPinMapping({ range: getRange(1, 0, 1, 7), name: "LED_BLUE", type: "Gpio", mapping: { value: { range: getRange(1, 2, 1, 3), text: "GPIO10" } } });
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin1,validPin2], [importedhwDefinitionFile]);
		const allPeripherals = flatten(hwDefinitionFile).indexedByName;
    const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinitionFile, allPeripherals, true);
    
    const params: CodeActionParams = {
      context: {diagnostics: warningDiagnostics},
      range: {
        start: {character: 0, line: 0},
        end: {character: 1, line: 0}
      },
      textDocument: {uri: asURI(hwDefFilePath)}
    };
    const codeAction = quickfix(hwDefinitionFile, params);
    assert.strictEqual(codeAction[0].title, "Delete the Invalid pin mapping");
  });

  
  test("Assign pin mapping to a pin on a different pin block", () => {

    const pins = [
			{ name: 'MY_LED', type: 'Gpio', mapping: 'MT3620_GPIO4' },
			{ name: 'MY_PWM_CONTROLLER0', type: 'Pwm', mapping: 'MT3620_PWM_CONTROLLER1' }
		];
		mockfs({
			'my_app/odm.json':
				`
				{
					"Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
					"Imports": [ { "Path": "mt3620.json" } ],
					"Peripherals": [
						{ "Name": "${pins[0].name}", "Type": "${pins[0].type}", "Mapping": "${pins[0].mapping}" },
						{ "Name": "${pins[1].name}", "Type": "${pins[1].type}", "Mapping": "${pins[1].mapping}" }
					]
				}
				`,
			'my_app/mt3620.json':
				`
				{
					"Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
					"Peripherals": [
						{ "Name": "${pins[0].mapping}", "Type": "${pins[0].type}", "AppManifestValue": 4 },
						{ "Name": "${pins[1].mapping}", "Type": "${pins[1].type}", "AppManifestValue": "PWM-CONTROLLER-1" }
					]
				}
				`
		});

		const hwDefFilePath = 'my_app/odm.json';
		const hwDefinition = tryParseHardwareDefinitionFile(fs.readFileSync(hwDefFilePath, { encoding: 'utf8' }), asURI(hwDefFilePath), '');
		assert(hwDefinition);
		const pinsToValidate = flatten(hwDefinition).flattened.filter(p => p.hardwareDefinitionUri == hwDefinition.uri);
		const warningDiagnostics: Diagnostic[] = validatePinBlock(pinsToValidate, new Map(), hwDefinition.uri, false);  
    
    const params: CodeActionParams = {
      context: {diagnostics: warningDiagnostics},
      range: {
        start: {character: 0, line: 0},
        end: {character: 1, line: 0}
      },
      textDocument: {uri: asURI(hwDefFilePath)}
    };
    const codeAction = quickfix(hwDefinition, params);
    assert.strictEqual(codeAction[0].title, "Assign pin mapping to a pin on a different pin block");
  });
});
