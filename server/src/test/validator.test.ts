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

	test('Validate Indirect Mapping', () => {
		const indirectPin = new PinMapping('LED_GPIO0', 'Gpio', 'GPIO0', undefined, range(0, 0, 0, 5));
		const pinWithSameMapping = new PinMapping('ODM_GPIO0', 'Gpio', 'GPIO0', undefined, range(0, 0, 0, 5));
		const sourcePin = new PinMapping('GPIO0', 'Gpio', undefined, 0, range(0, 0, 0, 5));
		
		const hwDefFilePathWithIndirectPin = 'my_app/hardwareDef.json';
		const hwDefFilePathFalseImported = 'my_app/odm.json';
		const hwDefFilePathWithSourcePin = 'my_app/mt3620.json';
		
		const hwDefWithSourcePin = new HardwareDefinition(asURI(hwDefFilePathWithSourcePin), undefined, [sourcePin]);
		const hwDefFalseImported = new HardwareDefinition(asURI(hwDefFilePathFalseImported), undefined, [pinWithSameMapping], [hwDefWithSourcePin]);
		const hwDefWithIndirectPin = new HardwareDefinition(asURI(hwDefFilePathWithIndirectPin), undefined, [indirectPin], [hwDefFalseImported]);

		const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefWithIndirectPin, true);
		const actualDiagnostic = warningDiagnostics[0];

		assert.strictEqual(actualDiagnostic.message, indirectPin.mapping + ' is indirectly imported by ' + hwDefWithIndirectPin.uri);
		assert.deepStrictEqual(actualDiagnostic.range, indirectPin.range);
		assert.strictEqual(actualDiagnostic.severity, 2);
		assert.strictEqual(actualDiagnostic.source, 'az sphere');
	});

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

	test('Validate Conflict Based On Pin Block', () => {
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

		const warningDiagnostics: Diagnostic[] = validatePinBlock(hwDefinition, false);
		const actualDiagnostic = warningDiagnostics[0];
		assert.strictEqual(actualDiagnostic.message, pins[1].name + ' configured as Gpio by ' + pins[0].name);
		assert.strictEqual(actualDiagnostic.range.start.line, 6);
		assert.strictEqual(actualDiagnostic.range.start.character, 6);
		assert.strictEqual(actualDiagnostic.range.end.line, 6);
		assert.strictEqual(actualDiagnostic.range.end.character, 90);
		assert.strictEqual(actualDiagnostic.severity, 2);
		assert.strictEqual(actualDiagnostic.source, 'az sphere');
	});
});
