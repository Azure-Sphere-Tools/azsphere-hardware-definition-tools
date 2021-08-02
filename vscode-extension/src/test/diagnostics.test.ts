import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';
import * as path from 'path';

suite('Should get diagnostics', () => {
	const docUri = getDocUri('diagnostics.json');
	test('Diagnoses duplicate and non-existent mappings', async () => {
		await testDiagnostics(docUri, [
			{ message: 'Peripheral USER_BUTTON_A not found.', range: toRange(13, 17, 13, 32), severity: vscode.DiagnosticSeverity.Error, source: 'az sphere' },
			{ message: 'USER_BUTTON_A is also mapped to SAMPLE_BUTTON_2.', range: toRange(13, 17, 13, 32), severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere' },
			{ message: 'Peripheral USER_BUTTON_A not found.', range: toRange(18, 17, 18, 32), severity: vscode.DiagnosticSeverity.Error, source: 'az sphere' },
			{ message: 'USER_BUTTON_A is also mapped to SAMPLE_BUTTON_1.', range: toRange(18, 17, 18, 32), severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere' },
			{ message: 'Peripheral USER_BUTTON_B not found.', range: toRange(23, 17, 23, 32), severity: vscode.DiagnosticSeverity.Error, source: 'az sphere' },
		]);
	});

	const pinBlockDocUri = getDocUri('pinblock.json');
	test('Pin Block Conflict', async () => {
		await testDiagnostics(pinBlockDocUri, [
			{ message: 'MT3620_RDB_PWM_CONTROLLER0 configured as Gpio by MT3620_RDB_LED1_BLUE', range: toRange(25, 6, 29, 7), severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere' },
			{ message: 'MT3620_RDB_ISU0_SPI configured as I2cMaster by MT3620_RDB_ISU0_I2C', range: toRange(35, 6, 39, 7), severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere' }
		]);
	});

	const unknownImportUri = getDocUri('unknownImport.json');
	test('Unknown Import', async () => {
		const hwDefinitionFilePath = path.dirname(unknownImportUri.fsPath);
		const SdkPath = process.platform == "linux" 
			? "/opt/azurespheresdk" 
			: "C:\\Program Files (x86)\\Microsoft Azure Sphere SDK";

		await testDiagnostics(unknownImportUri, [
			{ message: `Cannot find 'nonexistent.json' under ${hwDefinitionFilePath} or ${SdkPath}.`, range: toRange(14, 14, 14, 32), severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere' },
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