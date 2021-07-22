import * as assert from "assert";
import { Position, TextEdit } from "vscode-languageserver-textdocument";
import { HardwareDefinition, PinMapping } from "../hardwareDefinition";
import { findPinMappingRange, quickfix } from "../codeActionProvider";
import { anyRange, asURI, range } from "./testUtils";
import { CodeActionParams, Diagnostic, Range } from "vscode-languageserver";
import { findDuplicateMappings, validateNamesAndMappings, validatePinBlock } from "../validator";
import * as mockfs from 'mock-fs';
import { tryParseHardwareDefinitionFile } from "../server";
import * as fs from 'fs';


suite("findPinMappingRange", () => {
  test("Find Warning Pin Mapping", () => {
    const gpioPin = new PinMapping("GPIO0", "Gpio", undefined, 0, range(0, 0, 0, 5));
    const importedhwDefFilePath = "my_app/hardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin]);

    const hwDefFilePath = "my_app/ODM.json";
    const validPin1 = new PinMapping("LED_RED", "Gpio", "GPIO0", undefined, range(0, 0, 0, 7));
    const validPin2 = new PinMapping("LED_BLUE", "Gpio", "GPIO0", undefined, range(1, 0, 1, 7));
    validPin1.mappingPropertyRange = range(0,2,0,3);
    validPin2.mappingPropertyRange = range(1,2,1,3);
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin1,validPin2], [importedhwDefinitionFile]);

    const warningPinMapping = findPinMappingRange({line: 1, character: 2}, hwDefinitionFile);

    if (warningPinMapping) {
      assert.strictEqual(warningPinMapping.name, "LED_BLUE");
    }else {
      assert.fail("Warning Pin Mapping was not found");
    }
  });
});


suite("quickfix", () => {
  teardown(mockfs.restore);
  test("Delete the Duplicate pin mapping", () => {
    const gpioPin = new PinMapping("GPIO0", "Gpio", undefined, 0, range(0, 0, 0, 5));
    const importedhwDefFilePath = "my_app/hardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin]);

    const hwDefFilePath = "my_app/ODM.json";
    const validPin1 = new PinMapping("LED_RED", "Gpio", "GPIO0", undefined, range(0, 0, 0, 7));
    const validPin2 = new PinMapping("LED_BLUE", "Gpio", "GPIO0", undefined, range(1, 0, 1, 7));
    validPin1.mappingPropertyRange = range(0,2,0,3);
    validPin2.mappingPropertyRange = range(1,2,1,3);
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin1,validPin2], [importedhwDefinitionFile]);

    const textDocument = {
      uri: asURI(hwDefFilePath),
      languageId: "",
      version: 0,
      getText: function (range?: Range): string {
        return "{{'Name': 'LED_RED', 'Type': 'Gpio', 'Mapping': 'GPIO0'},{'Name': 'LED_BLUE', 'Type': 'Gpio', 'Mapping': 'GPIO0'}}";
      },
      positionAt: function (offset: number): Position {
        throw new Error("Function not implemented.");
      },
      offsetAt: function (position: Position): number {
        throw new Error("Function not implemented.");
      },
      lineCount: 0
    };

    const text = textDocument.getText();
    const diagnostics: Diagnostic[] = findDuplicateMappings(hwDefinitionFile, text, textDocument, true);
    
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
    const gpioPin = new PinMapping("GPIO0", "Gpio", undefined, 0, range(0, 0, 0, 5));
    const importedhwDefFilePath = "my_app/hardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin]);

    const hwDefFilePath = "my_app/ODM.json";
    const validPin1 = new PinMapping("LED_RED", "Gpio", "GPIO0", undefined, range(0, 0, 0, 7));
    const validPin2 = new PinMapping("LED_BLUE", "Gpio", "GPIO10", undefined, range(1, 0, 1, 7));
    validPin1.mappingPropertyRange = range(0,2,0,3);
    validPin2.mappingPropertyRange = range(1,2,1,3);
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin1,validPin2], [importedhwDefinitionFile]);
    const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinitionFile, true);
    
    const params: CodeActionParams = {
      context: {diagnostics: warningDiagnostics},
      range: {
        start: {character: 0, line: 0},
        end: {character: 1, line: 0}
      },
      textDocument: {uri: asURI(hwDefFilePath)}
    };
    const codeAction = quickfix(hwDefinitionFile,params);
    assert.strictEqual(codeAction[0].title, "Delete the Invalid pin mapping");
  });

  
  test("Assign pin mapping to a pin on a different pin block", () => {

    const gpioPin = new PinMapping("MT3620_GPIO4", "Gpio", undefined, 4, range(0, 0, 0, 12));
    const pwmPin = new PinMapping("MT3620_PWM_CONTROLLER1", "Pwm", undefined, "PWM-CONTROLLER-1", range(1, 0, 1, 21));
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin, pwmPin]);

    const hwDefFilePath = "my_app/hardwareDef.json";
    const validPin = new PinMapping("MY_LED", "Gpio", "MT3620_GPIO4", undefined, range(0, 0, 0, 6));
		const warningPin = new PinMapping("MY_PWM_CONTROLLER0", "Pwm", "MT3620_PWM_CONTROLLER1", undefined, range(1, 0, 1, 18));
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, warningPin], [importedhwDefinitionFile]);

		const warningDiagnostics: Diagnostic[] = validatePinBlock(hwDefinitionFile, true);

    const params: CodeActionParams = {
      context: {diagnostics: warningDiagnostics},
      range: {
        start: {character: 0, line: 0},
        end: {character: 1, line: 0}
      },
      textDocument: {uri: asURI(hwDefFilePath)}
    };
    const codeAction = quickfix(hwDefinitionFile,params);
    assert.strictEqual(codeAction[0].title, "Assign pin mapping to a pin on a different pin block");

  });
});
