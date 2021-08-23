import * as assert from "assert";
import { Position, TextEdit } from "vscode-languageserver-textdocument";
import { HardwareDefinition } from "../hardwareDefinition";
import { getPinMappingSuggestions, pinMappingCompletionItemsAtPosition } from "../suggestions";
import { asURI, getDummyPinMapping, getDummyImport, getRange } from "./testUtils";

suite("getPinMappingSuggestions", () => {
  test("Gets Pin Mapping Suggestions", () => {
    const gpioPin1 = getDummyPinMapping({ range: getRange(0, 0, 0, 5), name: "GPIO0", type: "Gpio", appManifestValue: 0 });
    const gpioPin2 = getDummyPinMapping({ range: getRange(1, 0, 1, 5), name: "GPIO1", type: "Gpio", appManifestValue: 1 });
    const pinWithDifferentType = getDummyPinMapping({ range: getRange(2, 0, 2, 5), name: "PWM0", type: "Pwm", appManifestValue: 28 });
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
    const importedhwDefinitionFile = getDummyImport({
      hardwareDefinition: new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin1, gpioPin2, pinWithDifferentType])
    });

    const hwDefFilePath = "my_app/hardwareDef.json";
    const validPin = getDummyPinMapping({ range: getRange(0, 0, 0, 5), name: "LED", type: "Gpio", mapping: "GPIO1" });
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin], [importedhwDefinitionFile]);

    const validPinMappings = getPinMappingSuggestions(hwDefinitionFile, "Gpio");

    assert.strictEqual(validPinMappings.length, 1);
    assert.strictEqual(validPinMappings[0], "GPIO0");
  });

  test("Only suggests Pin Mappings that are directly imported", () => {
    const basePin1 = getDummyPinMapping({ range: getRange(), name: "BASE_GPIO0", type: "Gpio", appManifestValue: 0 });
    const basePin2 = getDummyPinMapping({ range: getRange(), name: "BASE_GPIO1", type: "Gpio", appManifestValue: 1 });
    const baseHwDef = getDummyImport({
      hardwareDefinition: new HardwareDefinition(asURI("baseHwDef.json"), undefined, [basePin1, basePin2])
    });

    const directlyImportedPin = getDummyPinMapping({ range: getRange(), name: "ODM_GPIO0", type: "Gpio", mapping: basePin1.name.value.text });
    const importedhwDefinition = getDummyImport({
      hardwareDefinition: new HardwareDefinition(asURI("importedHardwareDef.json"), undefined, [directlyImportedPin], [baseHwDef])
    });

    const hwDefinitionFile = new HardwareDefinition(asURI("hardwareDef.json"), undefined, [], [importedhwDefinition]);

    const suggestedPinMappings = getPinMappingSuggestions(hwDefinitionFile, "Gpio");

    assert.strictEqual(suggestedPinMappings.length, 1);
    assert.strictEqual(suggestedPinMappings[0], directlyImportedPin.name.value.text);
    assert.strictEqual(suggestedPinMappings.includes(basePin1.name.value.text), false);
    assert.strictEqual(suggestedPinMappings.includes(basePin2.name.value.text), false);
  });

  test("Does not suggest Pin Mappings that cause pin block conflicts", () => {
    const gpioPin = getDummyPinMapping({ range: getRange(0, 0, 0, 5), name: "GPIO0", type: "Gpio", appManifestValue: 0 });
    const gpioPinSharingPinBlock = getDummyPinMapping({ range: getRange(1, 0, 1, 5), name: "GPIO4", type: "Gpio", appManifestValue: 4 });
    const pwmPinSharingPinBlock = getDummyPinMapping({ range: getRange(1, 0, 1, 5), name: "PWM1", type: "PWM", appManifestValue: "PWM-CONTROLLER-1" });

    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
    const importedhwDefinitionFile = getDummyImport({
      hardwareDefinition: new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin, gpioPinSharingPinBlock, pwmPinSharingPinBlock])
    });

    const hwDefFilePath = "my_app/hardwareDef.json";
    const hwDefinition = new HardwareDefinition(asURI(hwDefFilePath), undefined, [pwmPinSharingPinBlock], [importedhwDefinitionFile]);

    const validPinMappings = getPinMappingSuggestions(hwDefinition, "Gpio");

    assert.strictEqual(validPinMappings.length, 1);
    assert.strictEqual(validPinMappings[0], gpioPin.name.value.text);
    assert.notStrictEqual(validPinMappings[0], gpioPinSharingPinBlock.name.value.text);
  });
});

suite("pinMappingCompletionItemsAtPosition", () => {
  test("Returns Completion Items if caret inside 'Mapping' property", () => {
    const gpioPin = getDummyPinMapping({ range: getRange(), name: "GPIO0", type: "Gpio", appManifestValue: 0 });
    const importedhwDefinition = getDummyImport({
      hardwareDefinition: new HardwareDefinition(asURI("importedHardwareDef.json"), undefined, [gpioPin])
    });

    const caretPosition: Position = { line: 0, character: 6 };
    // const pinWithEmptyMapping = new PinMapping("LED", "Gpio", "", undefined, anyRange());
    const pinWithEmptyMapping = getDummyPinMapping({ range: getRange(), name: "LED", type: "Gpio", mapping: { value: { range: getRange(0, 5, 0, 7), text: "" } } });
    const hwDefinitionFile = new HardwareDefinition(asURI("hardwareDef.json"), undefined, [pinWithEmptyMapping], [importedhwDefinition]);

    const actualSuggestions = pinMappingCompletionItemsAtPosition(hwDefinitionFile, caretPosition);

    assert.strictEqual(actualSuggestions.length, 1);
    const actualSuggestion = <TextEdit>actualSuggestions[0].textEdit;
    assert.strictEqual(actualSuggestion.newText, `"${gpioPin.name.value.text}"`);
    assert.strictEqual(actualSuggestion.range, pinWithEmptyMapping.mapping?.value.range);
  });
});
