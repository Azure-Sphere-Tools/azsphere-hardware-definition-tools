import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

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

	const appManifestADocUri = getDocUri('applicationA/app_manifest.json');
	test('Partner ApplicationA Conflict', async () => {
		await testDiagnostics(appManifestADocUri, [
			{message: 'App manifest value of 5 is also declared in partner app 005180bc-402f-4cb3-a662-72937dbcde47 through $SAMPLE_LED_RED1.', range: toRange(7,12,7,39),severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere'},
			{message: 'App manifest value of $SAMPLE_I2C1 is also declared in partner app 005180bc-402f-4cb3-a662-72937dbcde47 through $SAMPLE_I2C1.', range: toRange(8,17,8,34),severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere'},
			{message: '$SAMPLE_Pwm2 configured as Gpio by $SAMPLE_LED_RED1 in partner app 005180bc-402f-4cb3-a662-72937dbcde47.', range: toRange(9,11,9,29),severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere'},
			{message: 'App manifest value of ADC-CONTROLLER-0 is also declared in partner app 005180bc-402f-4cb3-a662-72937dbcde47 through $SAMPLE_ADC_CONTROLLER0.', range: toRange(12,11,12,33),severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere'}
		]);
	});

	const appManifestBDocUri = getDocUri('applicationB/app_manifest.json');
	test('Partner ApplicationB Conflict', async () => {
		await testDiagnostics(appManifestBDocUri, [
			{message: '$SAMPLE_LED_RED1 configured as Pwm by $SAMPLE_Pwm2 in partner app 25025d2c-66da-4448-bae1-ac26fcdd3627.', range: toRange(6,12,6,33),severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere'},
			{message: 'App manifest value of $SAMPLE_LED_RED1 is also declared in partner app 25025d2c-66da-4448-bae1-ac26fcdd3627 through 5.', range: toRange(6,12,6,33),severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere'},
			{message: 'App manifest value of $SAMPLE_I2C1 is also declared in partner app 25025d2c-66da-4448-bae1-ac26fcdd3627 through $SAMPLE_I2C1.', range: toRange(7,17,7,34),severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere'},
			{message: 'App manifest value of $SAMPLE_ADC_CONTROLLER0 is also declared in partner app 25025d2c-66da-4448-bae1-ac26fcdd3627 through ADC-CONTROLLER-0.', range: toRange(11,11,11,40),severity: vscode.DiagnosticSeverity.Warning, source: 'az sphere'}
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