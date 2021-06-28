import {
	Diagnostic,
} from 'vscode-languageserver/node';

import * as assert from 'assert';
import * as mockfs from 'mock-fs';
import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';
import { tryParseHardwareDefinitionFile } from '../server';
import { validateNamesAndMappings } from '../validator';

suite('validateNamesAndMappings', () => {
	
	// unmock the file system after each test
	teardown(mockfs.restore);

	test('Validate Duplicate Names', () => {
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
						{ "Name": "${pins[0].name}", "Type": "${pins[1].type}", "Mapping": "${pins[1].mapping}" }
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
		const hwDefinition = tryParseHardwareDefinitionFile(fs.readFileSync(hwDefFilePath, { encoding: 'utf8' }), asURI(hwDefFilePath), '');

		if (hwDefinition) {
			const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinition, false);
			const actualDiagnostic = warningDiagnostics[0];

			assert.strictEqual(actualDiagnostic.message, pins[0].name + ' is already used by another pin mapping');
			assert.strictEqual(actualDiagnostic.range.start.line, 6);
			assert.strictEqual(actualDiagnostic.range.start.character, 6);
			assert.strictEqual(actualDiagnostic.range.end.line, 6);
			assert.strictEqual(actualDiagnostic.range.end.character, 60);
			assert.strictEqual(actualDiagnostic.severity, 2);
			assert.strictEqual(actualDiagnostic.source, 'az sphere');
		}
	});

	test('Validate Non-existent Mappings', () => {
		const nonExistentMapping = "GPIO28";
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
						{ "Name": "${pins[1].name}", "Type": "${pins[1].type}", "Mapping": "${nonExistentMapping}" }
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
		const hwDefinition = tryParseHardwareDefinitionFile(fs.readFileSync(hwDefFilePath, { encoding: 'utf8' }), asURI(hwDefFilePath), '');

		if (hwDefinition) {
			const warningDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinition, false);
			const actualDiagnostic = warningDiagnostics[0];

			assert.strictEqual(actualDiagnostic.message, 'Mapping ' + nonExistentMapping + ' is invalid. There is no imported pin mapping with that name.');
			assert.strictEqual(actualDiagnostic.range.start.line, 6);
			assert.strictEqual(actualDiagnostic.range.start.character, 6);
			assert.strictEqual(actualDiagnostic.range.end.line, 6);
			assert.strictEqual(actualDiagnostic.range.end.character, 63);
			assert.strictEqual(actualDiagnostic.severity, 2);
			assert.strictEqual(actualDiagnostic.source, 'az sphere');
		}
	});
});

function asURI(hwDefFilePath: string): string {
	return URI.file(path.resolve(hwDefFilePath)).toString();
}
