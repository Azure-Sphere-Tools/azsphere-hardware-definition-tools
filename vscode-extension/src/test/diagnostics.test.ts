import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should get diagnostics', () => {
	const docUri = getDocUri('diagnostics.json');

	test('Diagnoses duplicate and non-existent mappings', async () => {
		await testDiagnostics(docUri, [
			{ message: '"USER_BUTTON_A" is already mapped', range: toRange(18, 6, 18, 32), severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere' },
			{ message: 'Mapping USER_BUTTON_A is invalid. There is no imported pin mapping with that name.', range: toRange(10, 4, 14, 5), severity: vscode.DiagnosticSeverity.Error, source: 'az sphere' },
			{ message: 'Mapping USER_BUTTON_A is invalid. There is no imported pin mapping with that name.', range: toRange(15, 4, 19, 5), severity: vscode.DiagnosticSeverity.Error, source: 'az sphere' },
			{ message: 'Mapping USER_BUTTON_B is invalid. There is no imported pin mapping with that name.', range: toRange(20, 4, 24, 5), severity: vscode.DiagnosticSeverity.Error, source: 'az sphere' }
		]);
	});

	const pinBlockDocUri = getDocUri('pinblock.json');
	test('Pin Block Conflict', async () => {
		await testDiagnostics(pinBlockDocUri, [
			{ message: 'MT3620_RDB_PWM_CONTROLLER0 configured as Gpio by MT3620_RDB_LED1_BLUE', range: toRange(25, 6, 29, 7), severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere' },
			{ message: 'MT3620_RDB_ISU0_SPI configured as I2cMaster by MT3620_RDB_ISU0_I2C', range: toRange(35, 6, 39, 7), severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere' }
		]);
	});
});


function toRange(sLine: number, sChar: number, eLine: number, eChar: number) {
	const start = new vscode.Position(sLine, sChar);
	const end = new vscode.Position(eLine, eChar);
	return new vscode.Range(start, end);
}

async function testDiagnostics(docUri: vscode.Uri, expectedDiagnostics: vscode.Diagnostic[]) {
	await activate(docUri);

	const actualDiagnostics = vscode.languages.getDiagnostics(docUri);

	assert.equal(actualDiagnostics.length, expectedDiagnostics.length);

	expectedDiagnostics.forEach((expectedDiagnostic, i) => {
		const actualDiagnostic = actualDiagnostics[i];
		assert.equal(actualDiagnostic.message, expectedDiagnostic.message);
		assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range);
		assert.equal(actualDiagnostic.severity, expectedDiagnostic.severity);
	});
}