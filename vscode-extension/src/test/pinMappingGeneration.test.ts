import * as vscode from 'vscode';
import * as assert from 'assert';
import * as jsonc from "jsonc-parser";
import { getDocUri, getDocPath, activate, sleep, createFile, removeFile } from './helper';
import { teardown } from "mocha";

suite('Pin mapping generation', async () => {
  const sourceMappingPath = 'completion/tmpSource.json';
  const sourceMappingData = '{"Peripherals": [{ "Name": "GPIO1", "Type": "Gpio", "MainCoreHeaderValue": "(0)", "AppManifestValue": 0 }, { "Name": "GPIO2", "Type": "Gpio", "MainCoreHeaderValue": "(2)", "AppManifestValue": 3 }], "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 }}';

  const mappingPath = 'completion/tmp.json';
  const mappingData = '{"Imports":[{ "Path": "tmpSource.json" }],"Peripherals": [{ "Name": "TMP_GPIO1", "Type": "Gpio", "Mapping": "GPIO1" }], "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 }}';

  createFile(sourceMappingPath, sourceMappingData);
  createFile(mappingPath, mappingData);
  
  const docUri = getDocUri(mappingPath);

  teardown(() => {
    removeFile(sourceMappingPath);
    removeFile(mappingPath);
  });

  test('Pin mapping generation of selected pin type', async () => {
    await activate(docUri);
    const generatePinsCommand = "azsphere-hardware-definition-tools.generatePinMappings";
    const goToNextItemCommand = "workbench.action.quickOpenSelectNext";
    const selectCurrentItemCommand = "workbench.action.acceptSelectedQuickOpenItem";
    vscode.commands.executeCommand(generatePinsCommand);
    await sleep(2000);
    // select the currently active item in the quickpick
    await vscode.commands.executeCommand(selectCurrentItemCommand);
    // sleep to wait for language server to respond
    await sleep(2000);
    // select the number of pins to add
    await vscode.commands.executeCommand(selectCurrentItemCommand);
    // sleep to wait for language server to respond
    await sleep(2000);
    // assert on modified hardware definition here
    const res = await vscode.workspace.openTextDocument(docUri);
    const actual = jsonc.parse(res.getText());
    const expected = jsonc.parse('{"Imports":[{ "Path": "tmpSource.json" }],"Peripherals": [{ "Name": "TMP_GPIO1", "Type": "Gpio", "Mapping": "GPIO1" }, { "Name": "", "Type": "Gpio", "Mapping": "GPIO2" }], "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 }}');
    assert.deepStrictEqual(actual, expected);
  });
});