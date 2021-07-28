import { Diagnostic } from 'vscode-languageserver/node';

import * as assert from 'assert';
import { HardwareDefinition, PinMapping, toRange } from '../hardwareDefinition';
import { asURI, getRange, getDummyPinMapping } from "./testUtils";
import * as mockfs from 'mock-fs';
import * as fs from 'fs';
import { URI } from 'vscode-uri';
import { tryParseHardwareDefinitionFile } from '../server';
import { validateNamesAndMappings, validatePinBlock } from '../validator';

suite('validateNamesAndMappings', () => {

	test('Validate Indirect Mapping', () => {
		// {"Name": "LED_GPIO0", "Type": "Gpio", "Mapping": "GPIO0"}
		const indirectPin = getDummyPinMapping({ 
			name: {
				value: {
					range: getRange(0, 9, 0, 20),
					text: 'LED_GPIO0'
				}
			},
			type: 'Gpio', 
			mapping: 'GPIO0' 
		});
		// {"Name": "ODM_GPIO0", "Type": "Gpio", "Mapping": "GPIO0"}
		const pinWithSameMapping = getDummyPinMapping({ 
			name: 'ODM_GPIO0', 
			type: 'Gpio', 
			mapping: 'GPIO0' 
		});
		// {"Name": "GPIO0", "Type": "Gpio", "AppManifestValue": 0}
		const sourcePin = getDummyPinMapping({ 
			range: getRange(0, 0, 0, 56), 
			name: 'GPIO0', 
			type: 'Gpio', 
			appManifestValue: 0 
		});

		const hwDefFilePathWithIndirectPin = 'my_app/hardwareDef.json';
		const hwDefFilePathFalseImported = 'my_app/odm.json';
		const hwDefFilePathWithSourcePin = 'my_app/mt3620.json';

		const hwDefWithSourcePin = new HardwareDefinition(asURI(hwDefFilePathWithSourcePin), undefined, [sourcePin]);
		const hwDefFalseImported = new HardwareDefinition(asURI(hwDefFilePathFalseImported), undefined, [pinWithSameMapping], [hwDefWithSourcePin]);
		const hwDefWithIndirectPin = new HardwareDefinition(asURI(hwDefFilePathWithIndirectPin), undefined, [indirectPin], [hwDefFalseImported]);

		const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefWithIndirectPin, true);

		assert.strictEqual(warningDiagnostics.length, 1);

		assert.strictEqual(warningDiagnostics[0].message, indirectPin.mapping?.value.text + ' is indirectly imported from ' + URI.parse(hwDefWithSourcePin.uri).fsPath + '.');
		assert.deepStrictEqual(warningDiagnostics[0].range, indirectPin.mapping?.value.range);
		assert.strictEqual(warningDiagnostics[0].severity, 2);
		assert.strictEqual(warningDiagnostics[0].source, 'az sphere');
		assert.strictEqual(warningDiagnostics[0].code, 'AST4');
		assert.ok(warningDiagnostics[0].relatedInformation);
		assert.deepStrictEqual(warningDiagnostics[0].relatedInformation[0].location.uri, hwDefWithSourcePin.uri);
		assert.deepStrictEqual(warningDiagnostics[0].relatedInformation[0].location.range, sourcePin.range);
		assert.strictEqual(warningDiagnostics[0].relatedInformation[0].message, 'Indirect import');
	});

	test('Validate Duplicate Names', () => {
		// {"Name": "PWM", "Type": "Pwm", "AppManifestValue": "PWM-CONTROLLER-0"}
		const pinWithNoDuplicateLocalName = getDummyPinMapping({ 
			name: { 
				value: { 
					range: getRange(0, 9, 0, 14), 
					text: 'PWM' 
				} 
			}, 
			type: 'Pwm', 
			appManifestValue: 'PWM-CONTROLLER-0'
		});
		// {"Name": "LED", "Type": "Gpio", "AppManifestValue": 0}
		const pinWithDuplicateLocalName_1 = getDummyPinMapping({ 
			name: { 
				value: { 
					range: getRange(1, 9, 1, 14), 
					text: 'LED' 
				} 
			}, 
			type: 'Gpio', 
			appManifestValue: 0 
		});
		// {"Name": "LED", "Type": "Gpio", "AppManifestValue": 1}
		const pinWithDuplicateLocalName_2 = getDummyPinMapping({ 
			name: {
				value: {
					range: getRange(2, 9, 2, 14),
					text: pinWithDuplicateLocalName_1.name.value.text
				}
			},
			type: 'Gpio', 
			appManifestValue: 1 
		});
		// {"Name": "MT3620_GPIO3", "Type": "Gpio", "AppManifestValue": 3}
		const validImportedPin = getDummyPinMapping({
			name: {
				value: {
					range: getRange(0, 9, 0, 14),
					text: 'MT3620_GPIO3'
				}
			},
			type: 'Gpio',
			appManifestValue: 3
		});
		// {"Name": "MT3620_GPIO3", "Type": "Gpio", "AppManifestValue": 2}
		const pinWithDuplicateImportedName = getDummyPinMapping({ 
			name: {
				value: {
					range: getRange(3, 9, 3, 23),
					text: validImportedPin.name.value.text
				}
			},
			type: 'Gpio', 
			appManifestValue: 2
		});

		const importedHwDef = new HardwareDefinition(asURI('sdk/mt3620.json'), undefined, [validImportedPin]);
		const hwDefinitionWithDuplicateNames = new HardwareDefinition(
			asURI('my_app/hardwareDef.json'),
			undefined, 
			[pinWithNoDuplicateLocalName, pinWithDuplicateLocalName_1, pinWithDuplicateLocalName_2, pinWithDuplicateImportedName],
			[importedHwDef]
		);

		const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinitionWithDuplicateNames, true);

		assert.strictEqual(warningDiagnostics.length, 3);
		
		assert.strictEqual(warningDiagnostics[0].message, `Peripheral name ${pinWithDuplicateLocalName_1.name.value.text} is used multiple times.`);
		assert.deepStrictEqual(warningDiagnostics[0].range, pinWithDuplicateLocalName_1.name.value.range);
		assert.strictEqual(warningDiagnostics[0].severity, 1);
		assert.strictEqual(warningDiagnostics[0].source, 'az sphere');
		assert.strictEqual(warningDiagnostics[0].code, 'AST1');
		assert.ok(warningDiagnostics[0].relatedInformation);
		assert.deepStrictEqual(warningDiagnostics[0].relatedInformation[0].location.uri, hwDefinitionWithDuplicateNames.uri);
		assert.deepStrictEqual(warningDiagnostics[0].relatedInformation[0].location.range, pinWithDuplicateLocalName_2.name.value.range);
		assert.strictEqual(warningDiagnostics[0].relatedInformation[0].message, 'Duplicate peripheral name');

		assert.strictEqual(warningDiagnostics[1].message, `Peripheral name ${pinWithDuplicateLocalName_2.name.value.text} is used multiple times.`);
		assert.deepStrictEqual(warningDiagnostics[1].range, pinWithDuplicateLocalName_2.name.value.range);
		assert.strictEqual(warningDiagnostics[1].severity, 1);
		assert.strictEqual(warningDiagnostics[1].source, 'az sphere');
		assert.strictEqual(warningDiagnostics[1].code, 'AST1');
		assert.ok(warningDiagnostics[1].relatedInformation);
		assert.deepStrictEqual(warningDiagnostics[1].relatedInformation[0].location.uri, hwDefinitionWithDuplicateNames.uri);
		assert.deepStrictEqual(warningDiagnostics[1].relatedInformation[0].location.range, pinWithDuplicateLocalName_1.name.value.range);
		assert.strictEqual(warningDiagnostics[1].relatedInformation[0].message, 'Duplicate peripheral name');

		assert.strictEqual(warningDiagnostics[2].message, `Peripheral name ${pinWithDuplicateImportedName.name.value.text} is used multiple times.`);
		assert.deepStrictEqual(warningDiagnostics[2].range, pinWithDuplicateImportedName.name.value.range);
		assert.strictEqual(warningDiagnostics[2].severity, 1);
		assert.strictEqual(warningDiagnostics[2].source, 'az sphere');
		assert.strictEqual(warningDiagnostics[2].code, 'AST1');
		assert.ok(warningDiagnostics[2].relatedInformation);
		assert.deepStrictEqual(warningDiagnostics[2].relatedInformation[0].location.uri, importedHwDef.uri);
		assert.deepStrictEqual(warningDiagnostics[2].relatedInformation[0].location.range, validImportedPin.name.value.range);
		assert.strictEqual(warningDiagnostics[2].relatedInformation[0].message, 'Duplicate peripheral name');
	});

	test('Validate Nonexistent Mappings', () => {
		const existingMapping = 'GPIO0';

		// {"Name": "GPIO0", "Type": "Gpio", "AppManifestValue": 0}
		const importedPin = getDummyPinMapping({ 
			name: existingMapping, 
			type: 'Gpio', 
			appManifestValue: 0 
		});
		// {"Name": "LED", "Type": "Gpio", "Mapping": "GPIO0"}
		const validPin = getDummyPinMapping({ 
			name: 'LED', 
			type: 'Gpio', 
			mapping: existingMapping 
		});

		const nonExistentMapping = 'GPIO28';
		// {"Name": "BUTTON", "Type": "Gpio", "Mapping": "GPIO28"}
		const pinWithInvalidMapping = getDummyPinMapping({ 
			range: getRange(1, 2, 1, 8), 
			name: 'BUTTON', 
			type: 'Gpio', 
			mapping: {
				value: {
					range: getRange(1, 46, 1, 54),
					text: nonExistentMapping
				}
			} 
		});

		const importedHwDefinition = new HardwareDefinition(asURI('my_app/mt3620.json'), undefined, [importedPin]);
		const hwDefinition = new HardwareDefinition(asURI('my_app/appliance.json'), undefined, [validPin, pinWithInvalidMapping], [importedHwDefinition]);

		const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinition, true);

		assert.strictEqual(warningDiagnostics.length, 1);

		assert.strictEqual(warningDiagnostics[0].message, `Peripheral ${nonExistentMapping} not found.`);
		assert.deepStrictEqual(warningDiagnostics[0].range, pinWithInvalidMapping.mapping?.value.range);
		assert.strictEqual(warningDiagnostics[0].severity, 1);
		assert.strictEqual(warningDiagnostics[0].source, 'az sphere');
		assert.strictEqual(warningDiagnostics[0].code, 'AST2');
	});

	test('Includes Related Information in Diagnostic Message if "includeRelatedInfo" = false', () => {
		// { "Name": "LED", "Type": "Gpio", "AppManifestValue": 0 }
		const validPin = getDummyPinMapping({ 
			name: {
				value: {
					range: getRange(0, 0, 0, 5),
					text: 'LED'
				}
			},
			type: 'Gpio', 
			appManifestValue: 0 
		});
		// { "Name": "LED", "Type": "Gpio", "AppManifestValue": 1 }
		const pinWithDuplicateName = getDummyPinMapping({ 
			range: getRange(1, 2, 1, 8), 
			name: {
				value: {
					range: getRange(1, 2, 1, 8),
					text: validPin.name.value.text,
				}
			},
			type: 'Gpio', 
			appManifestValue: 1 
		});

		const hwDefFilePath = 'my_app/hardwareDef.json';
		const hwDefinitionWithDuplicateNames = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, pinWithDuplicateName]);

		const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinitionWithDuplicateNames, false);
		const actualDiagnostic = warningDiagnostics[0];

		// we expect line and char to be incremented by 1 since we start counting lines from 1 in text files (not 0)
		const relatedInfoStartLine = pinWithDuplicateName.name.value.range.start.line + 1;
		const relatedInfoStartChar = pinWithDuplicateName.name.value.range.start.character + 1;
		const baseMessage = `Peripheral name ${validPin.name.value.text} is used multiple times.`;
		const expectedMessage = `${baseMessage} (line ${relatedInfoStartLine}, char ${relatedInfoStartChar})`;
		assert.strictEqual(actualDiagnostic.message, expectedMessage);
		assert.deepStrictEqual(actualDiagnostic.range, validPin.name.value.range);
	});
});

suite('validatePinBlock', () => {

	// unmock the file system after each test
	teardown(mockfs.restore);

	test('Validate Conflict Based On Pin Block for GPIO', () => {
		const gpioPin = getDummyPinMapping({ range: getRange(0, 0, 0, 12), name: 'MT3620_GPIO4', type: 'Gpio', appManifestValue: 4 });
		const pwmPin = getDummyPinMapping({ range: getRange(1, 0, 1, 21), name: 'MT3620_PWM_CONTROLLER1', type: 'Pwm', appManifestValue: "PWM-CONTROLLER-1" });
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin, pwmPin]);

    const hwDefFilePath = "my_app/hardwareDef.json";
		const validPin = getDummyPinMapping({ range: getRange(0, 0, 0, 6), name: 'MY_LED', type: 'Gpio', mapping: "MT3620_GPIO4" });
		const warningPin = getDummyPinMapping({ range: getRange(1, 0, 1, 18), name: 'MY_PWM_CONTROLLER0', type: 'Pwm', mapping: "MT3620_PWM_CONTROLLER1" });
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, warningPin], [importedhwDefinitionFile]);

		const warningDiagnostics: Diagnostic[] = validatePinBlock(hwDefinitionFile, true);
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
		const gpioPin = getDummyPinMapping({ range: getRange(0, 0, 0, 12), name: 'MT3620_GPIO4', type: 'Gpio', appManifestValue: 4 });
		const pwmPin = getDummyPinMapping({ range: getRange(1, 0, 1, 21), name: 'MT3620_PWM_CONTROLLER1', type: 'Pwm', appManifestValue: "PWM-CONTROLLER-1" });
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin, pwmPin]);

    const hwDefFilePath = "my_app/hardwareDef.json";
		const validPin = getDummyPinMapping({ range: getRange(0, 0, 0, 18), name: 'MY_PWM_CONTROLLER0', type: 'Pwm', mapping: "MT3620_PWM_CONTROLLER1" });
		const warningPin = getDummyPinMapping({ range: getRange(1, 0, 1, 6), name: 'MY_LED', type: 'Gpio', mapping: "MT3620_GPIO4" });
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, warningPin], [importedhwDefinitionFile]);

		const warningDiagnostics: Diagnostic[] = validatePinBlock(hwDefinitionFile, true);
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
		const i2cMasterPin = getDummyPinMapping({ range: getRange(0, 0, 0, 15), name: 'MT3620_ISU0_I2C', type: 'I2cMaster', appManifestValue: "ISU0" });
		const spiMasterPin = getDummyPinMapping({ range: getRange(1, 0, 1, 15), name: 'MT3620_ISU0_SPI', type: 'SpiMaster', appManifestValue: "ISU0" });
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [i2cMasterPin, spiMasterPin]);

    const hwDefFilePath = "my_app/hardwareDef.json";
		const validPin = getDummyPinMapping({ range: getRange(0, 0, 0, 6), name: 'MY_I2C', type: 'I2cMaster', mapping: "MT3620_ISU0_I2C" });
		const warningPin = getDummyPinMapping({ range: getRange(1, 0, 1, 6), name: 'MY_SPI', type: 'SpiMaster', mapping: "MT3620_ISU0_SPI" });
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, warningPin], [importedhwDefinitionFile]);

		const warningDiagnostics: Diagnostic[] = validatePinBlock(hwDefinitionFile, true);
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

		const gpioPin1 = getDummyPinMapping({ range: getRange(0, 0, 0, 12), name: 'MT3620_GPIO2', type: 'Gpio', appManifestValue: 2 });
		const gpioPin2 = getDummyPinMapping({ range: getRange(1, 0, 1, 12), name: 'MT3620_GPIO3', type: 'Gpio', appManifestValue: 3 });
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
    const importedhwDefinitionFile = new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin1, gpioPin2]);

    const hwDefFilePath = "my_app/hardwareDef.json";
		const validPin1 = getDummyPinMapping({ range: getRange(0, 0, 0, 10), name: 'MY_LED_RED', type: 'Gpio', mapping: "MT3620_GPIO2" });
		const validPin2 = getDummyPinMapping({ range: getRange(1, 0, 1, 11), name: 'MY_LED_BLUE', type: 'Gpio', mapping: "MT3620_GPIO3" });
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin1, validPin2], [importedhwDefinitionFile]);

		const warningDiagnostics: Diagnostic[] = validatePinBlock(hwDefinitionFile, false);
		const actualDiagnostic = warningDiagnostics[0];
		assert.strictEqual(actualDiagnostic, undefined);
	});
});
