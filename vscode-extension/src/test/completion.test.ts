import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should do completion', () => {
	const docUri = getDocUri('completion/completion.json');

	test('Completes Available Mappings of same type', async () => {
		await testCompletion(docUri, new vscode.Position(10, 53), {
			items: [
				{ label: '"ODM_GPIO1"', kind: vscode.CompletionItemKind.Value }
			]
		});
		await testCompletion(docUri, new vscode.Position(12, 51), {
			items: [
				{ label: '"ODM_PWM0"', kind: vscode.CompletionItemKind.Value },
			]
		});
	});
});

async function testCompletion(
	docUri: vscode.Uri,
	position: vscode.Position,
	expectedCompletionList: vscode.CompletionList
) {
	await activate(docUri);

	// Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
	const actualCompletionList = (await vscode.commands.executeCommand(
		'vscode.executeCompletionItemProvider',
		docUri,
		position
	)) as vscode.CompletionList;

	assert.ok(actualCompletionList.items.length >= expectedCompletionList.items.length);
	expectedCompletionList.items.forEach((expectedItem, i) => {
		const actualItem = actualCompletionList.items[i];
		assert.equal(actualItem.label, expectedItem.label);
		assert.equal(actualItem.kind, expectedItem.kind);
	});
}
