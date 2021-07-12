import { Diagnostic } from "vscode-languageserver/node";

import * as assert from "assert";
import * as path from "path";
import { URI } from "vscode-uri";
import { validateNamesAndMappings, getPinMappingSuggestions } from "../validator";
import { HardwareDefinition, PinMapping } from "../hardwareDefinition";
import { Range } from "vscode-languageserver-textdocument";

suite("getPinMappingSuggestions", () => {
  test("Get Pin Mapping Suggestions", () => {
    const gpioPin1 = new PinMapping("GPIO0", "Gpio", undefined, 0, range(0, 0, 0, 5));
    const gpioPin2 = new PinMapping("GPIO1", "Gpio", undefined, 1, range(1, 0, 1, 5));
    const pinWithDifferentType = new PinMapping("PWM0", "Pwm", undefined, 28, range(2, 0, 2, 5));
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin1, gpioPin2, pinWithDifferentType]);

    const hwDefFilePath = "my_app/hardwareDef.json";
    const validPin = new PinMapping("LED", "Gpio", "GPIO1", undefined, range(0, 0, 0, 5));
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin], [importedhwDefinitionFile]);

    const validPinMappings = getPinMappingSuggestions(hwDefinitionFile, "Gpio");

    assert.strictEqual(validPinMappings.length, 1);
    assert.strictEqual(validPinMappings[0], "GPIO0");
  });
});

suite("validateNamesAndMappings", () => {
  test("Validate Duplicate Names", () => {
    const validPin = new PinMapping("LED", "Gpio", undefined, 0, range(0, 0, 0, 5));
    const pinWithDuplicateName = new PinMapping(validPin.name, "Gpio", undefined, 1, range(1, 2, 1, 8));

    const hwDefFilePath = "my_app/hardwareDef.json";
    const hwDefinitionWithDuplicateNames = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, pinWithDuplicateName]);

    const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinitionWithDuplicateNames, true);
    const actualDiagnostic = warningDiagnostics[0];

    assert.strictEqual(actualDiagnostic.message, pinWithDuplicateName.name + " is already used by another pin mapping");
    assert.deepStrictEqual(actualDiagnostic.range, pinWithDuplicateName.range);
    assert.strictEqual(actualDiagnostic.severity, 2);
    assert.strictEqual(actualDiagnostic.source, "az sphere");

    assert.ok(actualDiagnostic.relatedInformation);
    assert.deepStrictEqual(actualDiagnostic.relatedInformation[0].location.range, validPin.range);
  });

  test("Validate Non-existent Mappings", () => {
    const existingMapping = "GPIO0";

    const importedPin = new PinMapping(existingMapping, "Gpio", undefined, 0, anyRange());
    const validPin = new PinMapping("LED", "Gpio", existingMapping, undefined, anyRange());

    const nonExistentMapping = "GPIO28";
    const pinWithInvalidMapping = new PinMapping("BUTTON", "Gpio", nonExistentMapping, undefined, range(1, 2, 1, 8));

    const importedHwDefinition = new HardwareDefinition(asURI("my_app/mt3620.json"), undefined, [importedPin]);
    const hwDefinition = new HardwareDefinition(asURI("my_app/appliance.json"), undefined, [validPin, pinWithInvalidMapping], [importedHwDefinition]);

    const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinition, true);
    const actualDiagnostic = warningDiagnostics[0];

    assert.strictEqual(actualDiagnostic.message, "Mapping " + nonExistentMapping + " is invalid. There is no imported pin mapping with that name.");
    assert.deepStrictEqual(actualDiagnostic.range, pinWithInvalidMapping.range);
    assert.strictEqual(actualDiagnostic.severity, 2);
    assert.strictEqual(actualDiagnostic.source, "az sphere");
  });

  test('Includes Related Information in Diagnostic Message if "includeRelatedInfo" = false', () => {
    const validPin = new PinMapping("LED", "Gpio", undefined, 0, range(0, 0, 0, 5));
    const pinWithDuplicateName = new PinMapping(validPin.name, "Gpio", undefined, 1, range(1, 2, 1, 8));
    const hwDefFilePath = "my_app/hardwareDef.json";
    const hwDefinitionWithDuplicateNames = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, pinWithDuplicateName]);

    const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinitionWithDuplicateNames, false);
    const actualDiagnostic = warningDiagnostics[0];

    // we expect line and char to be incremented by 1 since we start counting lines from 1 in text files (not 0)
    const relatedInfoStartLine = validPin.range.start.line + 1;
    const relatedInfoStartChar = validPin.range.start.character + 1;
    const baseMessage = `${pinWithDuplicateName.name} is already used by another pin mapping`;
    const expectedMessage = `${baseMessage} (line ${relatedInfoStartLine}, char ${relatedInfoStartChar})`;
    assert.strictEqual(actualDiagnostic.message, expectedMessage);
    assert.deepStrictEqual(actualDiagnostic.range, pinWithDuplicateName.range);
  });
});

function asURI(hwDefFilePath: string): string {
  return URI.file(path.resolve(hwDefFilePath)).toString();
}

function range(startLine: number, startChar: number, endLine: number, endChar: number): Range {
  return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
}

/**
 * Returns a Range with arbitrary values.
 * Useful for when we need to provide a Range that we don't care about
 */
function anyRange(): Range {
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 27 } };
}
