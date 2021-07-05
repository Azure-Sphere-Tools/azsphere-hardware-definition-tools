import * as assert from "assert";
import { Position, TextEdit } from "vscode-languageserver-textdocument";
import { HardwareDefinition, PinMapping } from "../hardwareDefinition";
import { getPinMappingSuggestions, pinMappingCompletionItemsAtPosition } from "../suggestions";
import { anyRange, asURI, range } from "./testUtils";

suite("getPinMappingSuggestions", () => {
  test("Gets Pin Mapping Suggestions", () => {
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

  test("Only suggests Pin Mappings that are directly imported", () => {
    
    const basePin1 = new PinMapping("BASE_GPIO0", "Gpio", undefined, 0, anyRange());
    const basePin2 = new PinMapping("BASE_GPIO1", "Gpio", undefined, 1, anyRange());
    const baseHwDef = new HardwareDefinition(asURI("baseHwDef.json"), undefined, [basePin1, basePin2]);

    const directlyImportedPin = new PinMapping("ODM_GPIO0", "Gpio", basePin1.name, undefined, anyRange());
    const importedhwDefinition = new HardwareDefinition(asURI("importedHardwareDef.json"), undefined, [directlyImportedPin], [baseHwDef]);
    
    const hwDefinitionFile = new HardwareDefinition(asURI("hardwareDef.json"), undefined, [], [importedhwDefinition]);

    const suggestedPinMappings = getPinMappingSuggestions(hwDefinitionFile, "Gpio");

    assert.strictEqual(suggestedPinMappings.length, 1);
    assert.strictEqual(suggestedPinMappings[0], directlyImportedPin.name);
    assert.strictEqual(suggestedPinMappings.includes(basePin1.name), false);
    assert.strictEqual(suggestedPinMappings.includes(basePin2.name), false);
  });
});


suite("pinMappingCompletionItemsAtPosition", () => {
  test("Returns Completion Items if caret inside 'Mapping' property", () => {
    

    const gpioPin = new PinMapping("GPIO0", "Gpio", undefined, 0, anyRange());
    const importedhwDefinition = new HardwareDefinition(asURI("importedHardwareDef.json"), undefined, [gpioPin]);
    
    const caretPosition: Position = {line: 0, character: 6}; 
    const pinWithEmptyMapping = new PinMapping("LED", "Gpio", "", undefined, anyRange());
    pinWithEmptyMapping.mappingPropertyRange = range(0, 5, 0, 7);
    const hwDefinitionFile = new HardwareDefinition(asURI("hardwareDef.json"), undefined, [pinWithEmptyMapping], [importedhwDefinition]);

    const actualSuggestions = pinMappingCompletionItemsAtPosition(hwDefinitionFile, caretPosition);

    assert.strictEqual(actualSuggestions.length, 1);
    const actualSuggestion = <TextEdit>actualSuggestions[0].textEdit; 
    assert.strictEqual(actualSuggestion.newText, `"${gpioPin.name}"`);
    assert.strictEqual(actualSuggestion.range, pinWithEmptyMapping.mappingPropertyRange);
  });
});