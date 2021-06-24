import * as assert from 'assert';
import { findFullPath } from '../server';
import * as mockfs from 'mock-fs';
import * as path from 'path';

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
});
