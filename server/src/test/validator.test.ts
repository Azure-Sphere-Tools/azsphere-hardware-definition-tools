import { Diagnostic } from 'vscode-languageserver/node';

import * as assert from 'assert';
import { HardwareDefinition } from '../hardwareDefinition';
import { asURI, getRange, getDummyPinMapping, getDummyImport } from "./testUtils";
import * as mockfs from 'mock-fs';
import { URI } from 'vscode-uri';
import { validateNamesAndMappings, validatePinBlock, findAppManifestValue, validateAppPinConflict, flatten, scanHardwareDefinition } from '../validator';
import { AppManifest, AppPin } from "../applicationManifest";

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
		const odmPin = getDummyPinMapping({ 
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

		const hwDefWithSourcePin = getDummyImport({ 
			hardwareDefinition: new HardwareDefinition(asURI(hwDefFilePathWithSourcePin), undefined, [sourcePin]) 
		});
		const hwDefFalseImported = getDummyImport({
			hardwareDefinition: new HardwareDefinition(asURI(hwDefFilePathFalseImported), undefined, [odmPin], [hwDefWithSourcePin])
		});
		const hwDefWithIndirectPin = new HardwareDefinition(asURI(hwDefFilePathWithIndirectPin), undefined, [indirectPin], [hwDefFalseImported]);

		const allPeripherals = flatten(hwDefWithIndirectPin).indexedByName;
		const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefWithIndirectPin, allPeripherals, true);

		assert.strictEqual(warningDiagnostics.length, 1);

		assert.strictEqual(warningDiagnostics[0].message, indirectPin.mapping?.value.text + ' is indirectly imported from ' + URI.parse(hwDefWithSourcePin.hardwareDefinition.uri).fsPath + '.');
		assert.deepStrictEqual(warningDiagnostics[0].range, indirectPin.mapping?.value.range);
		assert.strictEqual(warningDiagnostics[0].severity, 2);
		assert.strictEqual(warningDiagnostics[0].source, 'az sphere');
		assert.strictEqual(warningDiagnostics[0].code, 'AST4');
		assert.ok(warningDiagnostics[0].relatedInformation);
		assert.deepStrictEqual(warningDiagnostics[0].relatedInformation[0].location.uri, hwDefWithSourcePin.hardwareDefinition.uri);
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

		const importedHwDef = getDummyImport({
			hardwareDefinition: new HardwareDefinition(asURI('sdk/mt3620.json'), undefined, [validImportedPin])
		});
		const hwDefinitionWithDuplicateNames = new HardwareDefinition(
			asURI('my_app/hardwareDef.json'),
			undefined, 
			[pinWithNoDuplicateLocalName, pinWithDuplicateLocalName_1, pinWithDuplicateLocalName_2, pinWithDuplicateImportedName],
			[importedHwDef]
		);

		const allPeripherals = flatten(hwDefinitionWithDuplicateNames).indexedByName;
		const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinitionWithDuplicateNames, allPeripherals, true);

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
		assert.deepStrictEqual(warningDiagnostics[2].relatedInformation[0].location.uri, importedHwDef.hardwareDefinition.uri);
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

		const importedHwDefinition = getDummyImport({
			hardwareDefinition: new HardwareDefinition(asURI('my_app/mt3620.json'), undefined, [importedPin])
		});
		const hwDefinition = new HardwareDefinition(asURI('my_app/appliance.json'), undefined, [validPin, pinWithInvalidMapping], [importedHwDefinition]);

		
		const allPeripherals = flatten(hwDefinition).indexedByName;
		const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinition, allPeripherals, true);

		assert.strictEqual(warningDiagnostics.length, 1);

		assert.strictEqual(warningDiagnostics[0].message, `Peripheral ${nonExistentMapping} not found.`);
		assert.deepStrictEqual(warningDiagnostics[0].range, pinWithInvalidMapping.mapping?.value.range);
		assert.strictEqual(warningDiagnostics[0].severity, 1);
		assert.strictEqual(warningDiagnostics[0].source, 'az sphere');
		assert.strictEqual(warningDiagnostics[0].code, 'AST2');
	});

	test('Sends warnings iff pins with duplicate mappings are in the same hardware definition', () => {
		// {"Name": "MT3620_GPIO0", "Type": "Gpio", "AppManifestValue": 0}
		const mt3620_peripheral_0 = getDummyPinMapping({
			name: 'MT3620_GPIO0',
			type: 'Gpio',
			appManifestValue: 0
		});
		// {"Name": "MT3620_GPIO1", "Type": "Gpio", "AppManifestValue": 1}
		const mt3620_peripheral_1 = getDummyPinMapping({
			name: 'MT3620_GPIO1',
			type: 'Gpio',
			appManifestValue: 1
		});
		// {"Name": "MT3620_GPIO2", "Type": "Gpio", "AppManifestValue": 2}
		const mt3620_peripheral_2 = getDummyPinMapping({
			name: 'MT3620_GPIO2',
			type: 'Gpio',
			appManifestValue: 2
		});

		// {"Name": "AVNET_GPIO0", "Type": "Gpio", "Mapping": "MT3620_GPIO0"}
		const avnet_peripheral_0 = getDummyPinMapping({
			name: 'AVNET_GPIO0',
			type: 'Gpio',
			mapping: {
				value: {
					range: getRange(0, 51, 0, 65),
					text: 'MT3620_GPIO0'
				}
			}
		});
		// {"Name": "AVNET_GPIO1", "Type": "Gpio", "Mapping": "MT3620_GPIO1"}
		const avnet_peripheral_1 = getDummyPinMapping({
			name: 'AVNET_GPIO1',
			type: 'Gpio',
			mapping: {
				value: {
					range: getRange(1, 51, 1, 65),
					text: 'MT3620_GPIO1'
				}
			}
		});

		// {"Name": "LED_OK", "Type": "Gpio", "Mapping": "AVNET_GPIO0"}
		const peripheralWithNoDuplicate = getDummyPinMapping({
			name: 'LED_OK',
			type: 'Gpio',
			mapping: {
				value: {
					range: getRange(0, 46, 0, 54),
					text: 'AVNET_GPIO0'
				}
			}
		});
		// {"Name": "LED_DUPLICATE_0", "Type": "Gpio", "Mapping": "AVNET_GPIO1"}
		const peripheralWithDuplicate0 = getDummyPinMapping({
			name: 'LED_DUPLICATE_0',
			type: 'Gpio',
			mapping: {
				value: {
					range: getRange(1, 55, 1, 63),
					text: 'AVNET_GPIO1'
				}
			}
		});
		// {"Name": "LED_DUPLICATE_1", "Type": "Gpio", "Mapping": "AVNET_GPIO1"}
		const peripheralWithDuplicate1 = getDummyPinMapping({
			name: 'LED_DUPLICATE_1',
			type: 'Gpio',
			mapping: {
				value: {
					range: getRange(2, 55, 2, 63),
					text: 'AVNET_GPIO1'
				}
			}
		});
		// {"Name": "LED_IMPORTED_DUPLICATE", "Type": "Gpio", "Mapping": "MT3620_GPIO0"}
		const peripheralWithImportedDuplicate = getDummyPinMapping({
			name: 'LED_IMPORTED_DUPLICATE',
			type: 'Gpio',
			mapping: {
				value: {
					range: getRange(3, 62, 3, 76),
					text: 'MT3620_GPIO0'
				}
			}
		});

		const mt3620 = getDummyImport({
			hardwareDefinition: new HardwareDefinition('mt3620.json', undefined, [mt3620_peripheral_0, mt3620_peripheral_1, mt3620_peripheral_2], [], [], true)
		});
		const avnet = getDummyImport({
			hardwareDefinition: new HardwareDefinition('avnet.json', undefined, [avnet_peripheral_0, avnet_peripheral_1], [mt3620], [], true)
		});
		const application = new HardwareDefinition(
			'application.json', 
			undefined, 
			[peripheralWithNoDuplicate, peripheralWithDuplicate0, peripheralWithDuplicate1, peripheralWithImportedDuplicate], 
			[avnet]
		);

		const allPeripherals = flatten(application).indexedByName;
		const diagnostics = validateNamesAndMappings(application, allPeripherals, true);

		// 2 diagnostics for the duplicate mappings in the same hardware definition
		// 1 diagnostic  for indirect import (which isn't important for this test)
		assert.strictEqual(diagnostics.length, 3);

		assert.strictEqual(diagnostics[0].message, `${peripheralWithDuplicate0.mapping?.value.text} is also mapped to ${peripheralWithDuplicate1.name.value.text}.`);
		assert.deepStrictEqual(diagnostics[0].range, peripheralWithDuplicate0.mapping?.value.range);
		assert.strictEqual(diagnostics[0].severity, 2);
		assert.strictEqual(diagnostics[0].source, 'az sphere');
		assert.strictEqual(diagnostics[0].code, 'AST3');
		assert.ok(diagnostics[0].relatedInformation);
		assert.deepStrictEqual(diagnostics[0].relatedInformation[0].location.uri, application.uri);
		assert.deepStrictEqual(diagnostics[0].relatedInformation[0].location.range, peripheralWithDuplicate1.mapping?.value.range);
		assert.strictEqual(diagnostics[0].relatedInformation[0].message, 'Duplicate peripheral mapping');

		assert.strictEqual(diagnostics[1].message, `${peripheralWithDuplicate1.mapping?.value.text} is also mapped to ${peripheralWithDuplicate0.name.value.text}.`);
		assert.deepStrictEqual(diagnostics[1].range, peripheralWithDuplicate1.mapping?.value.range);
		assert.strictEqual(diagnostics[1].severity, 2);
		assert.strictEqual(diagnostics[1].source, 'az sphere');
		assert.strictEqual(diagnostics[1].code, 'AST3');
		assert.ok(diagnostics[1].relatedInformation);
		assert.deepStrictEqual(diagnostics[1].relatedInformation[0].location.uri, application.uri);
		assert.deepStrictEqual(diagnostics[1].relatedInformation[0].location.range, peripheralWithDuplicate0.mapping?.value.range);
		assert.strictEqual(diagnostics[1].relatedInformation[0].message, 'Duplicate peripheral mapping');
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

		const allPeripherals = flatten(hwDefinitionWithDuplicateNames).indexedByName;
		const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinitionWithDuplicateNames, allPeripherals, false);
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
		const importedhwDefinitionFile = getDummyImport({
			hardwareDefinition: new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin, pwmPin])
		});

    const hwDefFilePath = "my_app/hardwareDef.json";
		const validPin = getDummyPinMapping({ range: getRange(0, 0, 0, 6), name: 'MY_LED', type: 'Gpio', mapping: "MT3620_GPIO4" });
		const warningPin = getDummyPinMapping({ range: getRange(1, 0, 1, 18), name: 'MY_PWM_CONTROLLER0', type: 'Pwm', mapping: "MT3620_PWM_CONTROLLER1" });
    const hwDefinition = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, warningPin], [importedhwDefinitionFile]);

		const pinsToValidate = flatten(hwDefinition).flattened.filter(p => p.hardwareDefinitionUri == hwDefinition.uri);
		const warningDiagnostics: Diagnostic[] = validatePinBlock(pinsToValidate, new Map(), true);
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
		const importedhwDefinitionFile = getDummyImport({
			hardwareDefinition: new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin, pwmPin])
		});

    const hwDefFilePath = "my_app/hardwareDef.json";
		const validPin = getDummyPinMapping({ range: getRange(0, 0, 0, 18), name: 'MY_PWM_CONTROLLER0', type: 'Pwm', mapping: "MT3620_PWM_CONTROLLER1" });
		const warningPin = getDummyPinMapping({ range: getRange(1, 0, 1, 6), name: 'MY_LED', type: 'Gpio', mapping: "MT3620_GPIO4" });
    const hwDefinition = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, warningPin], [importedhwDefinitionFile]);

		const pinsToValidate = flatten(hwDefinition).flattened.filter(p => p.hardwareDefinitionUri == hwDefinition.uri);
		const warningDiagnostics: Diagnostic[] = validatePinBlock(pinsToValidate, new Map(), true);
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
		const importedhwDefinitionFile = getDummyImport({
			hardwareDefinition: new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [i2cMasterPin, spiMasterPin])
		});

    const hwDefFilePath = "my_app/hardwareDef.json";
		const validPin = getDummyPinMapping({ range: getRange(0, 0, 0, 6), name: 'MY_I2C', type: 'I2cMaster', mapping: "MT3620_ISU0_I2C" });
		const warningPin = getDummyPinMapping({ range: getRange(1, 0, 1, 6), name: 'MY_SPI', type: 'SpiMaster', mapping: "MT3620_ISU0_SPI" });
    const hwDefinition = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, warningPin], [importedhwDefinitionFile]);

		const pinsToValidate = flatten(hwDefinition).flattened.filter(p => p.hardwareDefinitionUri == hwDefinition.uri);
		const warningDiagnostics: Diagnostic[] = validatePinBlock(pinsToValidate, new Map(), true);
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
		const importedhwDefinitionFile = getDummyImport({
			hardwareDefinition: new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin1, gpioPin2])
		});

    const hwDefFilePath = "my_app/hardwareDef.json";
		const validPin1 = getDummyPinMapping({ range: getRange(0, 0, 0, 10), name: 'MY_LED_RED', type: 'Gpio', mapping: "MT3620_GPIO2" });
		const validPin2 = getDummyPinMapping({ range: getRange(1, 0, 1, 11), name: 'MY_LED_BLUE', type: 'Gpio', mapping: "MT3620_GPIO3" });
    const hwDefinition = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin1, validPin2], [importedhwDefinitionFile]);

		const pinsToValidate = flatten(hwDefinition).flattened.filter(p => p.hardwareDefinitionUri == hwDefinition.uri);
		const warningDiagnostics: Diagnostic[] = validatePinBlock(pinsToValidate, new Map(), false);
		const actualDiagnostic = warningDiagnostics[0];
		assert.strictEqual(actualDiagnostic, undefined);
	});
});

suite('validateApplicationManifest', () => {

	// unmock the file system after each test
	teardown(mockfs.restore);

	test('Validate that the correct AppManifestValue is found', () => {
		const gpioPin = getDummyPinMapping({ range: getRange(0, 0, 0, 12), name: 'MT3620_GPIO4', type: 'Gpio', appManifestValue: 4 });
		const pwmPin = getDummyPinMapping({ range: getRange(1, 0, 1, 21), name: 'MT3620_PWM_CONTROLLER1', type: 'Pwm', appManifestValue: "PWM-CONTROLLER-1" });
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
		const importedhwDefinitionFile = getDummyImport({
			hardwareDefinition: new HardwareDefinition(asURI(importedhwDefFilePath), undefined, [gpioPin, pwmPin])
		});

    const hwDefFilePath = "my_app/hardwareDef.json";
		const validPin = getDummyPinMapping({ range: getRange(0, 0, 0, 6), name: 'MY_LED', type: 'Gpio', mapping: "MT3620_GPIO4" });
		const warningPin = getDummyPinMapping({ range: getRange(1, 0, 1, 18), name: 'MY_PWM_CONTROLLER0', type: 'Pwm', mapping: "MT3620_PWM_CONTROLLER1" });
    const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, [validPin, warningPin], [importedhwDefinitionFile]);
		const hwDefinitionScan = scanHardwareDefinition(hwDefinitionFile, true);

		const appManifestArray = findAppManifestValue(hwDefinitionScan, ['$MY_LED', '$MY_PWM_CONTROLLER0']);
		assert.strictEqual(appManifestArray[0], 4);
		assert.strictEqual(appManifestArray[1], "PWM-CONTROLLER-1");
	});

	test('Validate The Application Pin Conflict', () => {
		const appValues: Map<string, any> = new Map();
		appValues.set('Gpio', {
			range: getRange(1,0,1,22),
			key: {
				range: getRange(1,0,1,5),
				text: 'Gpio',
			},
			value: {
				range: getRange(1,6,1,22),
				text: ["$SAMPLE_LED_RED2"],
			}
		});

		appValues.set('I2cMaster', {
			range: getRange(2,0,2,23),
			key: {
				range: getRange(2,0,2,10),
				text: 'I2cMaster',
			},
			value: {
				range: getRange(2,11,2,23),
				text: ["$SAMPLE_I2C1"],
			}
		});

		appValues.set('Pwm', {
			range: getRange(3,0,3,17),
			key: {
				range: getRange(3,0,3,4),
				text: 'Pwm',
			},
			value: {
				range: getRange(3,5,3,17),
				text: ["$SAMPLE_Pwm2"],
			}
		});

		appValues.set('Uart', {
			range: getRange(4,0,4,19),
			key: {
				range: getRange(4,0,4,5),
				text: 'Uart',
			},
			value: {
				range: getRange(4,6,4,19),
				text: ["$SAMPLE_UART2"],
			}
		});

		appValues.set('SpiMaster', {
			range: getRange(5,0,5,14),
			key: {
				range: getRange(5,0,5,9),
				text: 'SpiMaster',
			},
			value: {
				range: getRange(5,10,5,14),
				text: ["ISU1"],
			}
		});

		appValues.set('Adc', {
			range: getRange(6,0,6,20),
			key: {
				range: getRange(6,0,6,3),
				text: 'Adc',
			},
			value: {
				range: getRange(6,4,6,20),
				text: ["ADC-CONTROLLER-0"],
			}
		});
		const appPin = new AppPin(
      appValues.get('Gpio'),
      appValues.get('I2cMaster'),
      appValues.get('Pwm'),
      appValues.get('Uart'),
      appValues.get('SpiMaster'),
      appValues.get('Adc'),
      ["FGHIJ"],
      appValues);


			const partnerValues: Map<string, any> = new Map();
			partnerValues.set('Gpio', {
				range: getRange(1,0,1,22),
				key: {
					range: getRange(1,0,1,5),
					text: 'Gpio',
				},
				value: {
					range: getRange(1,6,1,22),
					text: ["$SAMPLE_LED_RED1"],
				}
			});
	
			partnerValues.set('I2cMaster', {
				range: getRange(2,0,2,23),
				key: {
					range: getRange(2,0,2,10),
					text: 'I2cMaster',
				},
				value: {
					range: getRange(2,11,2,23),
					text: ["$SAMPLE_I2C1"],
				}
			});
	
			partnerValues.set('Pwm', {
				range: getRange(3,0,3,17),
				key: {
					range: getRange(3,0,3,4),
					text: 'Pwm',
				},
				value: {
					range: getRange(3,5,3,17),
					text: ["$SAMPLE_Pwm1"],
				}
			});
	
			partnerValues.set('Uart', {
				range: getRange(4,0,4,19),
				key: {
					range: getRange(4,0,4,5),
					text: 'Uart',
				},
				value: {
					range: getRange(4,6,4,19),
					text: ["$SAMPLE_UART1"],
				}
			});
	
			partnerValues.set('SpiMaster', {
				range: getRange(5,0,5,14),
				key: {
					range: getRange(5,0,5,9),
					text: 'SpiMaster',
				},
				value: {
					range: getRange(5,10,5,28),
					text: ["$SAMPLE_SpiMaster1"],
				}
			});
	
			partnerValues.set('Adc', {
				range: getRange(6,0,6,20),
				key: {
					range: getRange(6,0,6,3),
					text: 'Adc',
				},
				value: {
					range: getRange(6,4,6,27),
					text: ["$SAMPLE_ADC_CONTROLLER0"],
				}
			});
			const partnerPin = new AppPin(
				partnerValues.get('Gpio'),
				partnerValues.get('I2cMaster'),
				partnerValues.get('Pwm'),
				partnerValues.get('Uart'),
				partnerValues.get('SpiMaster'),
				partnerValues.get('Adc'),
				["ABCDE"],
				partnerValues);
			
		const appManifest = new AppManifest("ABCDE", appPin);
		const partnerAppManifest = new AppManifest("FGHIJ", partnerPin);

		const gpioPin1 = getDummyPinMapping({ range: getRange(0, 0, 0, 12), name: 'MT3620_GPIO5', type: 'Gpio', appManifestValue: 5 });
		const gpioPin2 = getDummyPinMapping({ range: getRange(1, 0, 1, 13), name: 'MT3620_GPIO60', type: 'Gpio', appManifestValue: 60 });
		const I2cMasterPin1 = getDummyPinMapping({ range: getRange(2, 0, 2, 15), name: 'MT3620_ISU0_I2C', type: 'I2cMaster', appManifestValue: "ISU0" });
		const I2cMasterPin2 = getDummyPinMapping({ range: getRange(3, 0, 3, 15), name: 'MT3620_ISU1_I2C', type: 'I2cMaster', appManifestValue: "ISU1" });		
		const PwmPin1 = getDummyPinMapping({ range: getRange(4, 0, 4, 22), name: 'MT3620_PWM_CONTROLLER0', type: 'Pwm', appManifestValue: "PWM-CONTROLLER-0" });
		const PwmPin2 = getDummyPinMapping({ range: getRange(5, 0, 5, 22), name: 'MT3620_PWM_CONTROLLER1', type: 'Pwm', appManifestValue: "PWM-CONTROLLER-1" });	
		const UartPin1 = getDummyPinMapping({ range: getRange(6, 0, 6, 16), name: 'MT3620_ISU2_UART', type: 'Uart', appManifestValue: "ISU2" });
		const UartPin2 = getDummyPinMapping({ range: getRange(7, 0, 7, 16), name: 'MT3620_ISU3_UART', type: 'Uart', appManifestValue: "ISU3" });	
		const SpiMasterPin = getDummyPinMapping({ range: getRange(8, 0, 8, 15), name: 'MT3620_ISU4_SPI', type: 'SpiMaster', appManifestValue: "ISU4" });
		const AdcPin = getDummyPinMapping({ range: getRange(9, 0, 9, 22), name: 'MT3620_ADC_CONTROLLER0', type: 'Adc', appManifestValue: "ADC-CONTROLLER-0" });
    const importedhwDefFilePath = "my_app/importedHardwareDef.json";
		const pinArray = [gpioPin1, gpioPin2, I2cMasterPin1, I2cMasterPin2, PwmPin1, PwmPin2, UartPin1, UartPin2, SpiMasterPin, AdcPin];
		const importedhwDefinitionFile = getDummyImport({
			hardwareDefinition: new HardwareDefinition(asURI(importedhwDefFilePath), undefined, pinArray)
		});

		const hwGpioPin1 = getDummyPinMapping({ range: getRange(0, 0, 0, 15), name: 'SAMPLE_LED_RED1', type: 'Gpio', mapping: "MT3620_GPIO5" });
		const hwGpioPin2 = getDummyPinMapping({ range: getRange(1, 0, 1, 15), name: 'SAMPLE_LED_RED2', type: 'Gpio', mapping: "MT3620_GPIO60" });
		const hwI2cMasterPin1 = getDummyPinMapping({ range: getRange(2, 0, 2, 11), name: 'SAMPLE_I2C1', type: 'I2cMaster', mapping: "MT3620_ISU0_I2C" });
		const hwI2cMasterPin2 = getDummyPinMapping({ range: getRange(3, 0, 3, 11), name: 'SAMPLE_I2C2', type: 'I2cMaster', mapping: "MT3620_ISU1_I2C" });
		const hwPwmPin1 = getDummyPinMapping({ range: getRange(4, 0, 4, 11), name: 'SAMPLE_Pwm1', type: 'Pwm', mapping: "MT3620_PWM_CONTROLLER0" });
		const hwPwmPin2 = getDummyPinMapping({ range: getRange(5, 0, 5, 11), name: 'SAMPLE_Pwm2', type: 'Pwm', mapping: "MT3620_PWM_CONTROLLER1" });
		const hwUartPin1 = getDummyPinMapping({ range: getRange(6, 0, 6, 12), name: 'SAMPLE_UART1', type: 'Uart', mapping: "MT3620_ISU2_UART" });
		const hwUartPin2 = getDummyPinMapping({ range: getRange(7, 0, 7, 12), name: 'SAMPLE_UART2', type: 'Uart', mapping: "MT3620_ISU3_UART" });
		const hwSpiMasterPin = getDummyPinMapping({ range: getRange(8, 0, 8, 17), name: 'SAMPLE_SpiMaster1', type: 'SpiMaster', mapping: "MT3620_ISU4_SPI" });
		const hwAdcPin = getDummyPinMapping({ range: getRange(9, 0, 9, 22), name: 'SAMPLE_ADC_CONTROLLER0', type: 'Adc', mapping: "MT3620_ADC_CONTROLLER0" });
    const hwDefFilePath = "my_app/hardwareDef.json";
		const hwPinArray = [hwGpioPin2, hwI2cMasterPin1, hwPwmPin2, hwUartPin2];
		const hwDefinitionFile = new HardwareDefinition(asURI(hwDefFilePath), undefined, hwPinArray, [importedhwDefinitionFile]);
		const hwDefinitionScan = scanHardwareDefinition(hwDefinitionFile, true);

		const partnerhwDefFilePath = "my_app/hardwareDef1.json";
		const partnerhwPinArray = [hwGpioPin1, hwI2cMasterPin1, hwPwmPin1, hwUartPin1, hwSpiMasterPin, hwAdcPin];
		const partnerhwDefinitionFile = new HardwareDefinition(asURI(partnerhwDefFilePath), undefined, partnerhwPinArray, [importedhwDefinitionFile]);
		const hpartnerwDefinitionScan = scanHardwareDefinition(partnerhwDefinitionFile, true);

		const warningDiagnostics = validateAppPinConflict(hwDefinitionScan, hpartnerwDefinitionScan, appManifest, partnerAppManifest);
		
		assert.strictEqual(warningDiagnostics.length, 3);
		
		assert.strictEqual(warningDiagnostics[0].message, "App manifest value of $SAMPLE_I2C1 is also declared in partner app FGHIJ through $SAMPLE_I2C1.");
		assert.deepStrictEqual(warningDiagnostics[0].range, getRange(2,11,2,23));
		assert.strictEqual(warningDiagnostics[0].severity, 2);
		assert.strictEqual(warningDiagnostics[0].source, 'az sphere');
		assert.strictEqual(warningDiagnostics[0].code, 'AST12');

		assert.strictEqual(warningDiagnostics[1].message, "$SAMPLE_Pwm2 configured as Gpio by $SAMPLE_LED_RED1 in partner app FGHIJ.");
		assert.deepStrictEqual(warningDiagnostics[1].range, getRange(3,5,3,17));
		assert.strictEqual(warningDiagnostics[1].severity, 2);
		assert.strictEqual(warningDiagnostics[1].source, 'az sphere');
		assert.strictEqual(warningDiagnostics[1].code, 'AST11');

		assert.strictEqual(warningDiagnostics[2].message, "App manifest value of ADC-CONTROLLER-0 is also declared in partner app FGHIJ through $SAMPLE_ADC_CONTROLLER0.");
		assert.deepStrictEqual(warningDiagnostics[2].range, getRange(6,4,6,20));
		assert.strictEqual(warningDiagnostics[2].severity, 2);
		assert.strictEqual(warningDiagnostics[2].source, 'az sphere');
		assert.strictEqual(warningDiagnostics[2].code, 'AST12');
		
	});
});

suite('validateImports', () => {
	teardown(mockfs.restore);

	test('Find directly imported errors', () => {
		const pinMapping1 = getDummyPinMapping({
			name: {
				value: {
					range: getRange(13, 0, 13, 27),
					text: 'LED'
				}
			}
		});
		const pinMapping2 = getDummyPinMapping({
			name: {
				value: {
					range: getRange(14, 0, 14, 27),
					text: 'LED'
				}
			}
		});

		const importRange = getRange(10, 0, 11, 100);
		const importedHwDef = getDummyImport({
			range: importRange,
			hardwareDefinition: new HardwareDefinition('imported.json', undefined, [ pinMapping1, pinMapping2 ])
		});
		const mainHwDef = new HardwareDefinition('main.json', undefined, [], [ importedHwDef ]);

		// Include related info
		let diagnostics = scanHardwareDefinition(mainHwDef, true).diagnostics;

		assert.strictEqual(diagnostics.length, 1);

		assert.strictEqual(diagnostics[0].message, `Imported hardware definition contains errors.`);
		assert.deepStrictEqual(diagnostics[0].range, importRange);
		assert.strictEqual(diagnostics[0].severity, 1);
		assert.strictEqual(diagnostics[0].source, 'az sphere');
		assert.strictEqual(diagnostics[0].code, 'AST9');
		assert.ok(diagnostics[0].relatedInformation);
		assert.deepStrictEqual(diagnostics[0].relatedInformation[0].location.uri, importedHwDef.hardwareDefinition.uri);
		assert.deepStrictEqual(diagnostics[0].relatedInformation[0].location.range, pinMapping1.name.value.range);
		assert.strictEqual(diagnostics[0].relatedInformation[0].message, 'Imported error');

		// Exclude related info
		diagnostics = scanHardwareDefinition(mainHwDef, false).diagnostics;

		assert.strictEqual(diagnostics.length, 1);

		assert.strictEqual(
			diagnostics[0].message,
			`Imported hardware definition contains errors. `
			+ `(line ${pinMapping1.name.value.range.start.line + 1}, `
			+ `char ${pinMapping1.name.value.range.start.character + 1} `
			+ `in ${URI.parse(importedHwDef.hardwareDefinition.uri).fsPath})`
		);
		assert.deepStrictEqual(diagnostics[0].range, importRange);
		assert.strictEqual(diagnostics[0].severity, 1);
		assert.strictEqual(diagnostics[0].source, 'az sphere');
		assert.strictEqual(diagnostics[0].code, 'AST9');
		assert.ok(!diagnostics[0].relatedInformation);
	});

	test('Find indirectly imported errors', () => {
		const pinMapping1 = getDummyPinMapping({ name: 'LED' });
		const pinMapping2 = getDummyPinMapping({ name: 'LED' });

		const errorRange = getRange(9, 0, 10, 100);
		const baseHwDef = getDummyImport({
			range: errorRange,
			hardwareDefinition: new HardwareDefinition('base.json', undefined, [ pinMapping1, pinMapping2 ])
		});
		const importRange = getRange(10, 0, 11, 100);
		const importedHwDef = getDummyImport({
			range: importRange,
			hardwareDefinition: new HardwareDefinition('imported.json', undefined, [], [ baseHwDef ])
		});
		const mainHwDef = new HardwareDefinition('main.json', undefined, [], [ importedHwDef ]);

		// Include related info
		let diagnostics = scanHardwareDefinition(mainHwDef, true).diagnostics;

		assert.strictEqual(diagnostics.length, 1);

		assert.strictEqual(diagnostics[0].message, `Imported hardware definition contains errors.`);
		assert.deepStrictEqual(diagnostics[0].range, importRange);
		assert.strictEqual(diagnostics[0].severity, 1);
		assert.strictEqual(diagnostics[0].source, 'az sphere');
		assert.strictEqual(diagnostics[0].code, 'AST9');
		assert.ok(diagnostics[0].relatedInformation);
		assert.deepStrictEqual(diagnostics[0].relatedInformation[0].location.uri, importedHwDef.hardwareDefinition.uri);
		assert.deepStrictEqual(diagnostics[0].relatedInformation[0].location.range, errorRange);
		assert.strictEqual(diagnostics[0].relatedInformation[0].message, 'Imported error');

		// Exclude related info
		diagnostics = scanHardwareDefinition(mainHwDef, false).diagnostics;

		assert.strictEqual(diagnostics.length, 1);

		assert.strictEqual(
			diagnostics[0].message,
			`Imported hardware definition contains errors. `
			+ `(line ${errorRange.start.line + 1}, `
			+ `char ${errorRange.start.character + 1} `
			+ `in ${URI.parse(importedHwDef.hardwareDefinition.uri).fsPath})`
		);
		assert.deepStrictEqual(diagnostics[0].range, importRange);
		assert.strictEqual(diagnostics[0].severity, 1);
		assert.strictEqual(diagnostics[0].source, 'az sphere');
		assert.strictEqual(diagnostics[0].code, 'AST9');
		assert.ok(!diagnostics[0].relatedInformation);
	});
});
