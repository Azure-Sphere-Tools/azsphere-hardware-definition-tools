import { Given, When, Then, DataTable, Before, After } from '@cucumber/cucumber';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { activate, clearWorkingDir, createCMakeFile, createFile, getDocUri, getFileText, positionInDoc, sleep, writeText } from './helper';

// Always use function callbacks instead of arrow functions for cucumber step definitions
// See the faq for more info: https://github.com/cucumber/cucumber-js/blob/main/docs/faq.md

let currentlyOpenDocUri: vscode.Uri = undefined;
let currentCaretPosition: vscode.Position = undefined;

Before(async function() {
	currentlyOpenDocUri = undefined;
	currentCaretPosition = undefined;
	await clearWorkingDir();
});

After(async function() {
	currentlyOpenDocUri = undefined;
	currentCaretPosition = undefined;
	await clearWorkingDir();
});

Given(/^a hardware definition file "([^"]+)":$/, function (fileName: string, fileContent: string) {
	const schemaProperty = `"$schema": "https://raw.githubusercontent.com/Azure-Sphere-Tools/hardware-definition-schema/master/hardware-definition-schema.json"`;
	const closingBracketIndex = fileContent.lastIndexOf("}");
	if (closingBracketIndex !== -1) {
		// add schema property to prevent vscode from making its own suggestions/completion items
		fileContent = fileContent.substring(0, closingBracketIndex) + ",\n" + schemaProperty + fileContent.substring(closingBracketIndex);
	}
	createFile(fileName, fileContent);
});

Given(/^an application manifest file "([^"]+)" using "([^"]+)" as its target hardware definition:$/, function (appManifestPath: string, targetHwDefPath: string, fileContent: string) {
	createFile(appManifestPath, fileContent);
	const cMakeListsPath = createCMakeFile(getDocUri(appManifestPath));
	const contentArray = targetHwDefPath.split("/");
	let targetDir = "";
	const targetDefin = contentArray[contentArray.length - 1];
	for(let i = 0; i < contentArray.length - 1; i++){
		targetDir += contentArray[i] + "/";
	}
	const cMakeListContent = "azsphere_target_hardware_definition(${PROJECT_NAME} TARGET_DIRECTORY " + '"' + targetDir + '"' +" TARGET_DEFINITION " + '"' +targetDefin + '"' + ")";
	createFile(cMakeListsPath, cMakeListContent);
});

When(/^I open "([^"]+)"$/, async function (fileName: string) {
	const docUri = getDocUri(fileName);
	await activate(docUri);
  currentlyOpenDocUri = docUri;
});

Then("I should get the following diagnostics:", async function (diagnosticsTable: DataTable) {
  const expectedDiagnostics: {severity: "Error" | "Warning" | "Information", message: string}[] = diagnosticsTable.hashes();
	assert.ok(currentlyOpenDocUri);

  const actualDiagnostics = vscode.languages.getDiagnostics(currentlyOpenDocUri);

	assert.strictEqual(actualDiagnostics.length, expectedDiagnostics.length);

	expectedDiagnostics.forEach((expectedDiagnostic, i) => {
		const actualDiagnostic = actualDiagnostics[i];
		assert.strictEqual(actualDiagnostic.message, expectedDiagnostic.message);
		assert.strictEqual(vscode.DiagnosticSeverity[actualDiagnostic.severity], expectedDiagnostic.severity);
	});
});

When(/^I move my caret to (.+)$/, async function (textToMoveTo: string) {
	currentCaretPosition = await positionInDoc(textToMoveTo, currentlyOpenDocUri);
	currentCaretPosition = currentCaretPosition.with({character: currentCaretPosition.character + 1});
});

Then("I should get the following suggestions:", async function (suggestionsTable: DataTable) {
	const expectedSuggestions: string[] = suggestionsTable.raw().map(row => row[0]);
	assert.ok(currentlyOpenDocUri);
	assert.ok(currentCaretPosition);

	const actualCompletionList = (await vscode.commands.executeCommand(
		'vscode.executeCompletionItemProvider',
		currentlyOpenDocUri,
		currentCaretPosition
	)) as vscode.CompletionList;

	assert.strictEqual(actualCompletionList.items.length, expectedSuggestions.length);
	expectedSuggestions.forEach((expectedSuggestion, i) => {
		const actualItem = actualCompletionList.items[i];
		assert.strictEqual(actualItem.label, expectedSuggestion);
		assert.strictEqual(actualItem.kind, vscode.CompletionItemKind.Value);
	});
});

When('I run the "Add pin mappings for Hardware Definition File" command', async function() {
	assert.ok(currentlyOpenDocUri);
	const generatePinsCommand = "azsphere-hardware-definition-tools.generatePinMappings";
  vscode.commands.executeCommand(generatePinsCommand);
  await sleep(1000);
});

When('I add {int} pin mappings of type {string}', async function(pinsToAdd: number, pinType: string) {
  assert.ok(currentlyOpenDocUri);
	const selectCurrentItemCommand = "workbench.action.acceptSelectedQuickOpenItem";
	
	// select the pin type
	await writeText(pinType);
	await vscode.commands.executeCommand(selectCurrentItemCommand);
  await sleep(1000);
	
	// select the number of pins to add
	await writeText(pinsToAdd.toString());
	await vscode.commands.executeCommand(selectCurrentItemCommand);
  await sleep(2000);
});

Then(/^"([^"]+)" should contain the following pin mappings:$/, async function(hwDefFileName: string, pinMappingsTable: DataTable) {
	type Pin = {Name: string, Type: string, Mapping: string};
	
	const expectedPins: Pin[] = pinMappingsTable.hashes().map(row => ({
		Name: row.name.replace("<empty>", ""),
		Type: row.type,
		Mapping: row.mapping
	}));
	expectedPins.forEach(p => p.Name = p.Name.replace("<empty>", ""));

	const parsedHwDef = JSON.parse(await getFileText(hwDefFileName));
	const actualPins: Pin[] = parsedHwDef.Peripherals;

	assert.deepStrictEqual(actualPins, expectedPins);
});