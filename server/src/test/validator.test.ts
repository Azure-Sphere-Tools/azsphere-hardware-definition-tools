import { Diagnostic } from 'vscode-languageserver/node';

import * as assert from 'assert';
import { HardwareDefinition, PinMapping } from '../hardwareDefinition';
import { anyRange, asURI, range } from "./testUtils";
import * as mockfs from 'mock-fs';
import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';
import { tryParseHardwareDefinitionFile } from '../server';
import { validateNamesAndMappings, validatePinBlock } from '../validator';

suite('validateNamesAndMappings', () => {

	test('Validate Duplicate Names', () => {
		const validPin = new PinMapping('LED', 'Gpio', undefined, 0, range(0, 0, 0, 5));
		const pinWithDuplicateName = new PinMapping(validPin.name, 'Gpio', undefined, 1, range(1, 2, 1, 8));

		const hwDefFilePath = 'my_app/hardwareDef.json';
		const hwDefinitionWithDuplicateNames = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, pinWithDuplicateName]);

		const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinitionWithDuplicateNames, true);
		const actualDiagnostic = warningDiagnostics[0];

		assert.strictEqual(actualDiagnostic.message, pinWithDuplicateName.name + ' is already used by another pin mapping');
		assert.deepStrictEqual(actualDiagnostic.range, pinWithDuplicateName.range);
		assert.strictEqual(actualDiagnostic.severity, 2);
		assert.strictEqual(actualDiagnostic.source, 'az sphere');

		assert.ok(actualDiagnostic.relatedInformation);
		assert.deepStrictEqual(actualDiagnostic.relatedInformation[0].location.range, validPin.range);
	});

	test('Validate Non-existent Mappings', () => {
		const existingMapping = "GPIO0";

		const importedPin = new PinMapping(existingMapping, 'Gpio', undefined, 0, anyRange());
		const validPin = new PinMapping('LED', 'Gpio', existingMapping, undefined, anyRange());

		const nonExistentMapping = "GPIO28";
		const pinWithInvalidMapping = new PinMapping('BUTTON', 'Gpio', nonExistentMapping, undefined, range(1, 2, 1, 8));


		const importedHwDefinition = new HardwareDefinition(asURI('my_app/mt3620.json'), undefined, [importedPin]);
		const hwDefinition = new HardwareDefinition(asURI('my_app/appliance.json'), undefined, [validPin, pinWithInvalidMapping], [importedHwDefinition]);

		const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinition, true);
		const actualDiagnostic = warningDiagnostics[0];

		assert.strictEqual(actualDiagnostic.message, 'Mapping ' + nonExistentMapping + ' is invalid. There is no imported pin mapping with that name.');
		assert.deepStrictEqual(actualDiagnostic.range, pinWithInvalidMapping.range);
		assert.strictEqual(actualDiagnostic.severity, 2);
		assert.strictEqual(actualDiagnostic.source, 'az sphere');
	});

	test('Includes Related Information in Diagnostic Message if "includeRelatedInfo" = false', () => {
		const validPin = new PinMapping('LED', 'Gpio', undefined, 0, range(0, 0, 0, 5));
		const pinWithDuplicateName = new PinMapping(validPin.name, 'Gpio', undefined, 1, range(1, 2, 1, 8));
		const hwDefFilePath = 'my_app/hardwareDef.json';
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

suite('validatePinBlock', () => {

	// unmock the file system after each test
	teardown(mockfs.restore);

	test('Validate Conflict Based On Pin Block for GPIO', () => {

		const gpioPin = new PinMapping("MT3620_GPIO4", "Gpio", undefined, 4, range(0, 0, 0, 12));
    const pwmPin = new PinMapping("MT3620_PWM_CONTROLLER1", "Pwm", undefined, "PWM-CONTROLLER-1", range(1, 0, 1, 21));
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin, pwmPin]);

    const hwDefFilePath = "my_app/hardwareDef.json";
    const validPin = new PinMapping("MY_LED", "Gpio", "MT3620_GPIO4", undefined, range(0, 0, 0, 6));
		const warningPin = new PinMapping("MY_PWM_CONTROLLER0", "Pwm", "MT3620_PWM_CONTROLLER1", undefined, range(1, 0, 1, 18));
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, warningPin], [importedhwDefinitionFile]);

		const warningDiagnostics: Diagnostic[] = validatePinBlock(hwDefinitionFile, false);
		const actualDiagnostic = warningDiagnostics[0];
	
		assert.strictEqual(actualDiagnostic.message, 'MY_PWM_CONTROLLER0 configured as Gpio by MY_LED');
		assert.strictEqual(actualDiagnostic.range.start.line, 1);
		assert.strictEqual(actualDiagnostic.range.start.character, 0);
		assert.strictEqual(actualDiagnostic.range.end.line, 1);
		assert.strictEqual(actualDiagnostic.range.end.character, 18);
		assert.strictEqual(actualDiagnostic.severity, 2);
		assert.strictEqual(actualDiagnostic.source, 'az sphere');
	});

	test('Validate Conflict Based On Pin Block for PWM', () => {

		const gpioPin = new PinMapping("MT3620_GPIO4", "Gpio", undefined, 4, range(0, 0, 0, 12));
    const pwmPin = new PinMapping("MT3620_PWM_CONTROLLER1", "Pwm", undefined, "PWM-CONTROLLER-1", range(1, 0, 1, 21));
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin, pwmPin]);

    const hwDefFilePath = "my_app/hardwareDef.json";
		const validPin = new PinMapping("MY_PWM_CONTROLLER0", "Pwm", "MT3620_PWM_CONTROLLER1", undefined, range(0, 0, 0, 18));
    const warningPin = new PinMapping("MY_LED", "Gpio", "MT3620_GPIO4", undefined, range(1, 0, 1, 6));
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, warningPin], [importedhwDefinitionFile]);

		const warningDiagnostics: Diagnostic[] = validatePinBlock(hwDefinitionFile, false);
		const actualDiagnostic = warningDiagnostics[0];
	
		assert.strictEqual(actualDiagnostic.message, 'MY_LED configured as Pwm by MY_PWM_CONTROLLER0');
		assert.strictEqual(actualDiagnostic.range.start.line, 1);
		assert.strictEqual(actualDiagnostic.range.start.character, 0);
		assert.strictEqual(actualDiagnostic.range.end.line, 1);
		assert.strictEqual(actualDiagnostic.range.end.character, 6);
		assert.strictEqual(actualDiagnostic.severity, 2);
		assert.strictEqual(actualDiagnostic.source, 'az sphere');
	});

	test('Validate Conflict Based On Pin Block for ISU0', () => {

		const gpioPin = new PinMapping("MT3620_ISU0_I2C", "I2cMaster", undefined, "ISU0", range(0, 0, 0, 15));
    const pwmPin = new PinMapping("MT3620_ISU0_SPI", "SpiMaster", undefined, "ISU0", range(1, 0, 1, 15));
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin, pwmPin]);

    const hwDefFilePath = "my_app/hardwareDef.json";
		const validPin = new PinMapping("MY_I2C", "I2cMaster", "MT3620_ISU0_I2C", undefined, range(0, 0, 0, 6));
    const warningPin = new PinMapping("MY_SPI", "SpiMaster", "MT3620_ISU0_SPI", undefined, range(1, 0, 1, 6));
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, warningPin], [importedhwDefinitionFile]);

		const warningDiagnostics: Diagnostic[] = validatePinBlock(hwDefinitionFile, false);
		const actualDiagnostic = warningDiagnostics[0];
	
		assert.strictEqual(actualDiagnostic.message, 'MY_SPI configured as I2cMaster by MY_I2C');
		assert.strictEqual(actualDiagnostic.range.start.line, 1);
		assert.strictEqual(actualDiagnostic.range.start.character, 0);
		assert.strictEqual(actualDiagnostic.range.end.line, 1);
		assert.strictEqual(actualDiagnostic.range.end.character, 6);
		assert.strictEqual(actualDiagnostic.severity, 2);
		assert.strictEqual(actualDiagnostic.source, 'az sphere');
	});

	test('No Conflict Based On Pin Block', () => {
		const gpioPin1 = new PinMapping("MT3620_GPIO2", "Gpio", undefined, 2, range(0, 0, 0, 12));
    const gpioPin2 = new PinMapping("MT3620_GPIO3", "Gpio", undefined, 3, range(1, 0, 1, 12));
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin1, gpioPin2]);

    const hwDefFilePath = "my_app/hardwareDef.json";
    const validPin1 = new PinMapping("MY_LED_RED", "Gpio", "MT3620_GPIO2", undefined, range(0, 0, 0, 10));
		const validPin2 = new PinMapping("MY_LED_BLUE", "Gpio", "MT3620_GPIO3", undefined, range(1, 0, 1, 11));
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin1, validPin2], [importedhwDefinitionFile]);

		const warningDiagnostics: Diagnostic[] = validatePinBlock(hwDefinitionFile, false);
		const actualDiagnostic = warningDiagnostics[0];
		assert.strictEqual(actualDiagnostic, undefined);
	});
});
