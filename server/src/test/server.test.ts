import * as assert from 'assert';
import { tryParseHardwareDefinitionFile, findFullPath, parseCommandsParams } from '../server';
import * as mockfs from 'mock-fs';
import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';

suite('tryParseHardwareDefinitionFile', () => {

	// unmock the file system after each test
	teardown(mockfs.restore);

	test('Parses Hardware Definition root pin mappings', () => {
		const pins = [
			{ name: 'GPIO0', type: 'Gpio', appManifestValue: 0 },
			{ name: 'ISU0_I2C', type: 'I2cMaster', appManifestValue: 'ISU0' }
		];
		mockfs({
			'my_app/mt3620.json':
				`
				{
					"Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
					"Peripherals": [
						{ "Name": "${pins[0].name}", "Type": "${pins[0].type}", "AppManifestValue": ${pins[0].appManifestValue} },
						{ "Name": "${pins[1].name}", "Type": "${pins[1].type}", "AppManifestValue": "${pins[1].appManifestValue}" }
					]
				}
				`
		});

		const hwDefFilePath = 'my_app/mt3620.json';
		const hwDefinition = tryParseHardwareDefinitionFile(fs.readFileSync(hwDefFilePath, { encoding: 'utf8' }), asURI(hwDefFilePath), '');

		if (hwDefinition) {
			const actualPins = hwDefinition.pinMappings;
			assert.strictEqual(actualPins.length, pins.length);
			for (let i = 0; i < pins.length; i++) {
				const expectedPin = pins[i];
				const actualPin = actualPins[i];

				assert.strictEqual(actualPin.name, expectedPin.name);
				assert.strictEqual(actualPin.type, expectedPin.type);
				assert.strictEqual(actualPin.appManifestValue, expectedPin.appManifestValue);
			}
		} else {
			assert.fail('Parsed Hardware Definition was undefined');
		}
	});

	test('Parses Hardware Definition pin mappings with imports', () => {
		const pins = [
			{ name: 'LED', type: 'Gpio', mapping: 'GPIO0' },
			{ name: 'BUTTON', type: 'Gpio', mapping: 'GPIO27' }
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
						{ "Name": "${pins[0].mapping}", "Type": "${pins[0].type}", "AppManifestValue": 45 },
						{ "Name": "${pins[1].mapping}", "Type": "${pins[1].type}", "AppManifestValue": 50 }
					]
				}
				`
		});

		const hwDefFilePath = 'my_app/odm.json';
		const importedHwDefFilePath = 'my_app/mt3620.json';
		const hwDefinition = tryParseHardwareDefinitionFile(fs.readFileSync(hwDefFilePath, { encoding: 'utf8' }), asURI(hwDefFilePath), '');

		if (hwDefinition) {
			// check pins
			const actualPins = hwDefinition.pinMappings;
			assert.strictEqual(actualPins.length, pins.length);
			for (let i = 0; i < pins.length; i++) {
				const expectedPin = pins[i];
				const actualPin = actualPins[i];

				assert.strictEqual(actualPin.name, expectedPin.name);
				assert.strictEqual(actualPin.type, expectedPin.type);
				assert.strictEqual(actualPin.mapping, expectedPin.mapping);
			}

			// check imports
			assert.strictEqual(1, hwDefinition.imports.length);
			const importedHwDefinition = hwDefinition.imports[0];
			assert.strictEqual(importedHwDefinition.uri, asURI(importedHwDefFilePath));
			const importedPins = importedHwDefinition.pinMappings;
			for (let i = 0; i < importedPins.length; i++) {
				const importedPin = importedPins[i];
				const actualPin = actualPins[i];

				assert.strictEqual(actualPin.mapping, importedPin.name);
				assert.strictEqual(actualPin.type, importedPin.type);
			}

		}
	});
});

suite('findFullPath', () => {

	// unmock the file system after each test
	teardown(mockfs.restore);

	test('Returns undefined if file not found under hardware definition path or sdk path', () => {

		mockfs({
			'my_application/hardware_defs': {
				'mt3620.json': 'file_content'
			},
			'azsphere/sdk/HardwareDefinitions': {
				'mt3620.json': 'file_content'
			}
		});
		const importedFilePath = "does_not_exist.json";

		const fullPath = findFullPath(importedFilePath, 'my_application/hardware_defs', 'azsphere/sdk');

		assert.strictEqual(fullPath, undefined);
	});

	test('Looks under "HardwareDefinitions" directory in sdk path', () => {

		mockfs({
			'azsphere/sdk/HardwareDefinitions': {
				'mt3620.json': 'file_contents'
			}
		});
		const importedFilePath = "mt3620.json";

		const fullPath = findFullPath(importedFilePath, 'any/hwdef/path', 'azsphere/sdk');

		const expectedPath = 'azsphere/sdk/HardwareDefinitions/mt3620.json';
		if (fullPath) {
			assert.strictEqual(path.resolve(fullPath), path.resolve(expectedPath));
		} else {
			assert.fail(`Path was undefined`);
		}

	});

	test('Prioritizes hardware definition path over sdk path', () => {

		mockfs({
			'my_application/hardware_defs': {
				'mt3620.json': 'file_content'
			},
			'azsphere/sdk/HardwareDefinitions': {
				'mt3620.json': 'file_contents'
			}
		});
		const importedFilePath = "mt3620.json";

		const fullPath = findFullPath(importedFilePath, 'my_application/hardware_defs', 'azsphere/sdk');

		const expectedPath = 'my_application/hardware_defs/mt3620.json';
		if (fullPath) {
			assert.strictEqual(path.resolve(fullPath), path.resolve(expectedPath));
		} else {
			assert.fail(`Path was undefined`);
		}

	});

suite("CMAKELists Infer", () => {
  test("Azuresphere Target Hardware Definition specified in CMakeLists", () => {
    mockfs({
      my_application: {
        "CMakeLists.txt": `
			cmake_minimum_required (VERSION 3.10)
			
			project (Blink C)
			
			azsphere_configure_tools(TOOLS_REVISION "21.04")
			azsphere_configure_api(TARGET_API_SET "9")
			find_path(
				TARGET_DIRECTORY
				NAMES "myfile.txt"
				PATHS "HardwareDefinitions" "./"
				NO_DEFAULT_PATH NO_CMAKE_FIND_ROOT_PATH)
			# Create executable
			add_executable (\${PROJECT_NAME} main.c)
			target_link_libraries (\${PROJECT_NAME} applibs pthread gcc_s c)
			azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "HardwareDefinitions/" TARGET_DEFINITION "template_appliance.json")
			
			azsphere_target_add_image_package(\${PROJECT_NAME})
			
			message("LOOK HERE \${TARGET_DIRECTORY}")`,
      },
      "my_application/HardwareDefinitions/template_appliance.json":
        "file_content",
    });
    const CMAKEListsPath = "my_application/CMakeLists.txt";

    const fullPath: string | undefined = parseCommandsParams(
      path.resolve(CMAKEListsPath)
    );

    const expectedPath =
      "my_application/HardwareDefinitions/template_appliance.json";
    if (fullPath) {
      assert.strictEqual(path.resolve(fullPath), path.resolve(expectedPath));
    } else {
      assert.fail(`Path was undefined`);
    }
  });
});

function asURI(hwDefFilePath: string): string {
	return URI.file(path.resolve(hwDefFilePath)).toString();
}

