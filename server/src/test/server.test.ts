import * as assert from "assert";
import * as mockito from "ts-mockito";
import { anyString, anything } from "ts-mockito";
import * as mockfs from "mock-fs";
import path = require("path");
import { Position, TextDocument } from "vscode-languageserver-textdocument";
import { FileOperationsFeatureShape } from "vscode-languageserver/lib/common/fileOperations";
import { WorkspaceFolders } from "vscode-languageserver/lib/common/workspaceFolders";
import { ExtensionSettings, GET_AVAILABLE_ODM_HARDWARE_DEFINITIONS_CMD, GET_AVAILABLE_PINS_CMD, GET_AVAILABLE_PIN_TYPES_CMD, LanguageServer, PORT_HARDWARE_DEFINITION_CMD, POST_PIN_AMOUNT_TO_GENERATE_CMD, startLanguageServer, VALIDATE_HW_DEFINITION_CMD } from "../server";
import { asURI, dummyAppManifest, getDummyPinMapping, getRange } from "./testUtils";
import { Connection, InitializeParams, RemoteClient, RemoteConsole, ShowMessageNotification, ShowMessageParams, ShowMessageRequest, TextDocumentEdit, TextDocuments, TextDocumentsConfiguration, WorkspaceEdit, _RemoteWorkspace } from "vscode-languageserver";
import { Configuration } from "vscode-languageserver/lib/common/configuration";
import { Parser } from "../parser";
import { HardwareDefinition, toPosition } from "../hardwareDefinition";
import { APP_DUPLICATE_VALUE_WARNING_CODE, nonexistentMappingError, NONEXISTENT_MAPPING_ERROR_CODE } from "../diagnostics";
import { HW_DEFINITION_SCHEMA_URL } from "../utils";
import { AppManifest } from "../applicationManifest";
import { readFile } from "fs/promises";
import { OdmHardwareDefinitionFile } from "../porting";
import { existsSync } from "fs";

suite("LanguageServer", () => {
  // mock/unmock the file system before/after every test
  setup(() => mockfs());
  teardown(mockfs.restore);

  test("Initializes with proper capabilities", async () => {
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console);
    const initResult = server.onInitialize({
      rootUri: "",
      processId: 1,
      capabilities: {
        workspace: {
          configuration: true,
          workspaceFolders: true
        },
        textDocument: {
          moniker: {},
          codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: [] } } }
        }
      },
      workspaceFolders: [{ name: "Test Workspace Folder", uri: asURI(path.join(__dirname, "sometestfolder")) }]
    });

    assert.ok(initResult.capabilities.workspace?.workspaceFolders?.supported);
    assert.ok(initResult.capabilities.codeActionProvider);
    const expectedDeclaredCommands = [
      "getAvailablePinTypes",
      "getAvailablePins",
      "postPinAmountToGenerate",
      "validateHwDefinition",
      "getAvailableOdmHardwareDefinitions",
      "portHardwareDefinition"
    ];
    assert.deepStrictEqual(initResult.capabilities.executeCommandProvider?.commands, expectedDeclaredCommands);
  });

  test("Registers onExecuteCommand callback when initialization complete", async () => {
    const mockedConnection = mockConnection();
    const server = new LanguageServer(mockedConnection, mockDocumentManager(), console);
    server.onInitialize(workspaceConfigSupportedParams());
    
    // complete initialization
    server.onInitialized();

    mockito.verify(mockedConnection.mockType.onExecuteCommand(anything())).once();
  });

  test("Clears cached document settings on configuration change", async () => {
    const documentSettings = new Map();
    documentSettings.set("someuri", Promise.resolve({ SdkPath: "", partnerApplicationPaths: new Map() }));
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, documentSettings);
    server.onInitialize(workspaceConfigSupportedParams());
    server.onDidChangeConfiguration({ settings: { AzureSphere: {} } });

    assert.strictEqual(documentSettings.size, 0);
  });

  test("Clears cached document settings of closed document", async () => {
    const documentSettings = new Map();
    const documentUri = "someuri";
    documentSettings.set(documentUri, Promise.resolve({ SdkPath: "", partnerApplicationPaths: new Map() }));
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, documentSettings);
    server.onInitialize(workspaceConfigSupportedParams());
    server.onDidClose({ document: mockDocument(documentUri, "") });

    assert.strictEqual(documentSettings.has(documentUri), false);
  });

  test("Caches document settings when requesting settings for a file", async () => {
    const documentSettingsCache = new Map();
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, documentSettingsCache);
    server.onInitialize(workspaceConfigSupportedParams());

    const fileUri = "file://a/file.json";

    const retrievedSettings = await server.getDocumentSettings(fileUri);
    const cachedSettings = await documentSettingsCache.get(fileUri);

    assert.strictEqual(documentSettingsCache.size, 1);
    assert.strictEqual(cachedSettings, retrievedSettings);
  });

  test("Uses global settings when workspace config not available", async () => {
    const workspaceSettingsCache = new Map<string, Thenable<ExtensionSettings>>();
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, workspaceSettingsCache);
    const initParamsWithoutWorkspaceConfig = {
      rootUri: asURI(__dirname),
      processId: 1,
      capabilities: { workspace: { configuration: false } },
      workspaceFolders: null
    };
    server.onInitialize(initParamsWithoutWorkspaceConfig);

    const fileUri = "file://a/file.json";
    const customizedWorkspaceSettings = { SdkPath: "someCustomValue", partnerApplicationPaths: new Map() };
    workspaceSettingsCache.set(fileUri, Promise.resolve(customizedWorkspaceSettings));

    const retrievedSettings = await server.getDocumentSettings(fileUri);

    // the global settings' default value should be different from customizedWorkspaceSettings
    assert.notDeepStrictEqual(retrievedSettings, customizedWorkspaceSettings);
  });

  test("Updates global settings on configuration change when workspace config not available", async () => {
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, new Map());
    const initParamsWithoutWorkspaceConfig = {
      rootUri: asURI(__dirname),
      processId: 1,
      capabilities: { workspace: { configuration: false } },
      workspaceFolders: null
    };
    server.onInitialize(initParamsWithoutWorkspaceConfig);
    
    const newSettings = {
      SdkPath: "newSdkPath",
      partnerApplications: {partnerApp1: "path/1/appmanifest.json", partnerApp2: "path/2/appmanifest.json"}
    };
    server.onDidChangeConfiguration({ settings: { AzureSphere: newSettings } });

    const actualSettings: ExtensionSettings = await server.getDocumentSettings("resourceDoesntMatterWithGlobalSettings");
    const expectedSettings: ExtensionSettings = {
      SdkPath: newSettings.SdkPath,
      partnerApplicationPaths: new Map(Object.entries(newSettings.partnerApplications))
    }; 
    assert.deepStrictEqual(actualSettings, expectedSettings);
  });


  test("startLanguageServer runs without crashing", async () => {
    startLanguageServer(mockConnection());
  });

  test("Suggests adding schema when opening hardware definition without schema", async () => {
    const hwDefPath = fullPath("hwdef.json");

    // mock fs
    const files: Record<string, any> = {};
    files[hwDefPath] = `
    {
      "Metadata": {"Type": "Azure Sphere Hardware Definition", "Version": 1},
      "Description": {"Name": "HW Def without schema"},
      "Peripherals": []
    }`;
    mockfs(files);

    const mockedConn = mockConnection();
    // handles server's addJsonSchema message request
    mockito.when(mockedConn.mockType.sendRequest(ShowMessageRequest.type, anything())).thenResolve({ title: "Yes" });

    const server = new LanguageServer(mockedConn, mockDocumentManager(), console, new Map());
    server.onInitialize(workspaceConfigSupportedParams());

    
    const hwDefUri = asURI(hwDefPath);
    await server.onDidOpen({document: mockDocument(hwDefUri, files[hwDefPath])});
    
    
    const mockWorkspaceType = (mockedConn.workspace as unknown as MockType<WorkspaceAll>).mockType;
    const [suggestedEdit] = mockito.capture(mockWorkspaceType.applyEdit).last();
    const editContent = (suggestedEdit as WorkspaceEdit).documentChanges as TextDocumentEdit[];
    assert.strictEqual(editContent.length, 1);
    assert.strictEqual(editContent[0].textDocument.uri, hwDefUri);
    assert.strictEqual(editContent[0].edits.length, 1);
    assert.strictEqual(editContent[0].edits[0].newText, `"$schema": "${HW_DEFINITION_SCHEMA_URL}",\n`);
  });

  test("Sends a diagnostic when modifying appmanifest with 1 partner app conflict", async () => {
    const appId = "app1";
    const appManifestPath = fullPath("app_manifest.json");
    const partnerId = "app2";
    const partnerPath = fullPath("partner_manifest.json");
    const cmakePath = fullPath("CMakeLists.txt");
    const hwDefPath = fullPath("hwdef.json");

    // mock fs
    const files: Record<string, any> = {};
    files[appManifestPath] = "app1Content";
    files[partnerPath] = "app2Content";
    files[cmakePath] = `TARGET_DIRECTORY "./" TARGET_DEFINITION "hwdef.json"`;
    files[hwDefPath] = "content defined in mock parser";
    mockfs(files);

    // mock settings.json with partner app
    const documentSettingsCache = new Map();
    documentSettingsCache.set(asURI(appManifestPath), {
      SdkPath: "",
      partnerApplicationPaths: new Map([[partnerId, partnerPath]])
    });
    // mock parser to return app manifests with 1 conflict on shared GPIO
    const appManifest = dummyAppManifest(appId, [partnerId], ["$APP_GPIO"]);
    const partnerManifest = dummyAppManifest(partnerId, [appId], ["$PARTNER_GPIO"]);
    const hwDefinition = new HardwareDefinition("", "", [
      getDummyPinMapping({ name: "APP_GPIO", appManifestValue: 1 }),
      getDummyPinMapping({ name: "PARTNER_GPIO", appManifestValue: 1 })
    ]);
    const mockedParser = mockParser(
      { content: files[appManifestPath], appManifest: appManifest },
      { content: files[partnerPath], appManifest: partnerManifest },
      { content: anyString(), hwDef: hwDefinition }
    );
    const mockedConnection = mockConnection();
    const server = new LanguageServer(mockedConnection, mockDocumentManager(), console, documentSettingsCache, mockedParser);
    server.onInitialize(workspaceConfigSupportedParams()); // add workspace config support to benefit from documentSettingsCache


    await server.onDidChangeContent({ document: mockDocument(asURI(appManifestPath), files[appManifestPath]) });

    const [sentDiagnostics] = mockito.capture(mockedConnection.mockType.sendDiagnostics).last();
    assert.strictEqual(sentDiagnostics.uri, asURI(appManifestPath));
    assert.strictEqual(sentDiagnostics.diagnostics.length, 1);
    assert.strictEqual(sentDiagnostics.diagnostics[0].code, APP_DUPLICATE_VALUE_WARNING_CODE);
  });

  test("Sends a diagnostic when modifying a hardware definition with 1 conflict", async () => {
    const hwDefPath = fullPath("hwdef.json");

    // mock fs
    const files: Record<string, any> = {};
    files[hwDefPath] = "hwdefcontent";
    mockfs(files);

    // mock parser to return a hw def which imports another
    const pinWithUnknownMapping = getDummyPinMapping({ name: "APP_GPIO", mapping: "UNKNOWN" });
    const faultyHwDefinition = new HardwareDefinition("", "", [pinWithUnknownMapping]);

    const mockedParser = mockParser({content: anyString(), hwDef: faultyHwDefinition});
    const mockedConnection = mockConnection();
    const server = new LanguageServer(mockedConnection, mockDocumentManager(), console, new Map(), mockedParser);
    server.onInitialize(workspaceConfigSupportedParams());


    await server.onDidChangeContent({ document: mockDocument(asURI(hwDefPath), files[hwDefPath]) });

    const [sentDiagnostics] = mockito.capture(mockedConnection.mockType.sendDiagnostics).last();
    assert.strictEqual(sentDiagnostics.uri, asURI(hwDefPath));
    assert.strictEqual(sentDiagnostics.diagnostics.length, 1);
    assert.strictEqual(sentDiagnostics.diagnostics[0].code, NONEXISTENT_MAPPING_ERROR_CODE);
  });

  test("Sends completion items for hardware definitions", async () => {
    const hwDefPath = fullPath("hwdef.json");

    // mock fs
    const files: Record<string, any> = {};
    files[hwDefPath] = "hwdefcontent";
    mockfs(files);


    // mock parser to return a hw def which imports another
    const importedHwDef = new HardwareDefinition("", "", [getDummyPinMapping({ name: "GPIO1", appManifestValue: 1 })]);
    const pinToAskCompletionsFor = getDummyPinMapping({ name: "APP_GPIO", mapping: "" });
    const hwDefinition = new HardwareDefinition("", "", [pinToAskCompletionsFor], [importedHwDef]);

    const mockedParser = mockParser({ content: anyString(), hwDef: hwDefinition});
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, new Map(), mockedParser);
    server.onInitialize(workspaceConfigSupportedParams());


    const positionWhereCompletionAsked = pinToAskCompletionsFor.mapping?.value.range.start as Position;
    const completions = await server.onCompletion({ textDocument: { uri: asURI(hwDefPath) }, position: positionWhereCompletionAsked });

    assert.strictEqual(completions.length, 1);
    assert.strictEqual(completions[0].label, '"GPIO1"');
  });

  test("Does not send completions for files that aren't hardware definitions", async () => {
    const jsonFilePath = fullPath("somefile.json");
    const textFilePath = fullPath("somefile.txt");

    // mock fs
    const files: Record<string, any> = {};
    files[jsonFilePath] = "json content that is not a hardware definition";
    files[textFilePath] = "text content that is not a hardware definition";
    mockfs(files);

    const mockedConnection = mockConnection();
    const server = new LanguageServer(mockedConnection, mockDocumentManager(), console, new Map());
    server.onInitialize(workspaceConfigSupportedParams());


    const completionsForJson = await server.onCompletion({ textDocument: { uri: asURI(jsonFilePath) }, position: { line: 0, character: 1 } });
    const completionsForText = await server.onCompletion({ textDocument: { uri: asURI(textFilePath) }, position: { line: 0, character: 1 } });

    assert.strictEqual(completionsForJson.length, 0);
    assert.strictEqual(completionsForText.length, 0);
  });

  test("onCompletionResolve always returns a completion item", async () => {
    
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, new Map());

    const completionItem = { label: "Some Completion Item" };
    const resolvedItem = server.onCompletionResolve(completionItem);

    assert.ok(resolvedItem);
    assert.deepStrictEqual(resolvedItem, completionItem);
  });

  test("Sends quickfix code action for hardware definition with error", async () => {
    const hwDefPath = fullPath("hwdef.json");

    // mock fs
    const files: Record<string, any> = {};
    files[hwDefPath] = "hwdefcontent";
    mockfs(files);

    // mock parser to return a hw def which imports another
    const pinWithUnknownMapping = getDummyPinMapping({ name: "APP_GPIO", mapping: "UNKNOWN" });
    const faultyHwDefinition = new HardwareDefinition("", "", [pinWithUnknownMapping]);

    const mockedParser = mockParser({ content: anyString(), hwDef: faultyHwDefinition });
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, new Map(), mockedParser);
    server.onInitialize(workspaceConfigSupportedParams());


    const quickfixes = await server.onCodeAction({ 
      textDocument: {uri: asURI(hwDefPath)}, 
      context: { diagnostics: [nonexistentMappingError(pinWithUnknownMapping)] }, 
      range: pinWithUnknownMapping.range, 
    });

    assert.ok(quickfixes.length > 0);
  });
  
  test("Does not run C header generation command on hardware definition with errors", async () => {
    const hwDefPath = fullPath("hwdef.json");

    // mock fs
    const files: Record<string, any> = {};
    files[hwDefPath] = "hwdefcontent";
    mockfs(files);

    // mock parser to return a hw def with an error
    const hwDefWithError = new HardwareDefinition("", "", [getDummyPinMapping({ name: "PIN", mapping: "UNKNOWN" })]);
    const mockedParser = mockParser({ content: anyString(), hwDef: hwDefWithError });
    const mockedConnection = mockConnection();
    const server = new LanguageServer(mockedConnection, mockDocumentManager(), console, new Map(), mockedParser);
    server.onInitialize(workspaceConfigSupportedParams());

    
    await server.onDidSave({document: mockDocument(asURI(hwDefPath), files[hwDefPath])});

    // notifications are only sent when c header generation command is run
    mockito.verify(mockedConnection.mockType.sendNotification(ShowMessageNotification.type, anything())).never();
  });

  test("Command 'getAvailablePinTypes' returns available pin types to select from", async () => {
    const hwDefPath = fullPath("hwdef.json");

    // mock fs
    const files: Record<string, any> = {};
    files[hwDefPath] = "hwdefcontent";
    mockfs(files);

    // mock parser to return a hw def for which we can generate a pin
    const availableType = "Gpio";
    const importedHwDef = new HardwareDefinition("", "", [getDummyPinMapping({ type: availableType, appManifestValue: 1 })]);
    const hwDef = new HardwareDefinition("", "", [], [importedHwDef]);
    const mockedParser = mockParser({ content: anyString(), hwDef: hwDef });
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, new Map(), mockedParser);
    server.onInitialize(workspaceConfigSupportedParams());

    
    const response = await server.executeCommand({command: GET_AVAILABLE_PIN_TYPES_CMD, arguments: [asURI(hwDefPath)]});

    assert.ok(Array.isArray(response));
    assert.deepStrictEqual(response, [availableType]);
  });
  
  test("Command 'getAvailablePinTypes' sends notification when no pins available", async () => {
    const hwDefPath = fullPath("hwdef.json");

    // mock fs
    const files: Record<string, any> = {};
    files[hwDefPath] = "hwdefcontent";
    mockfs(files);

    // mock parser to return a hw def for which we can't generate any pins
    const hwDefWithNoPins = new HardwareDefinition("", "", []);
    const mockedParser = mockParser({ content: anyString(), hwDef: hwDefWithNoPins });
    const mockedConnection = mockConnection();
    const server = new LanguageServer(mockedConnection, mockDocumentManager(), console, new Map(), mockedParser);
    server.onInitialize(workspaceConfigSupportedParams());

    
    await server.executeCommand({command: GET_AVAILABLE_PIN_TYPES_CMD, arguments: [asURI(hwDefPath)]});

    mockito.verify(mockedConnection.mockType.sendNotification(ShowMessageNotification.type, anything())).once();
  });

  test("Command 'getAvailablePins' returns number of available pins for given type", async () => {
    const hwDefPath = fullPath("hwdef.json");

    // mock fs
    const files: Record<string, any> = {};
    files[hwDefPath] = "hwdefcontent";
    mockfs(files);

    // mock parser to return a hw def for which we can generate a pin
    const pinType = "Gpio";
    const importedHwDef = new HardwareDefinition("", "", [getDummyPinMapping({ type: pinType, appManifestValue: 1 })]);
    const hwDef = new HardwareDefinition("", "", [], [importedHwDef]);
    const mockedParser = mockParser({ content: anyString(), hwDef: hwDef });
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, new Map(), mockedParser);
    server.onInitialize(workspaceConfigSupportedParams());
    
    const response = await server.executeCommand({command: GET_AVAILABLE_PINS_CMD, arguments: [asURI(hwDefPath), pinType]});

    assert.ok(Array.isArray(response));
    assert.deepStrictEqual(response.length, 1);
  });

  test("Command 'postPinAmountToGenerate' updates hardware definition file", async () => {
    const hwDefPath = fullPath("hwdef.json");

    // mock fs
    const files: Record<string, any> = {};
    files[hwDefPath] = `
    {
      "Metadata": {"Type": "Azure Sphere Hardware Definition", "Version": 1},
      "Description": {"Name": "HW Def without schema"},
      "Peripherals": []
    }`;
    mockfs(files);
    const pinToAdd = "IMPORTED_PIN";
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, new Map());
    server.onInitialize(workspaceConfigSupportedParams());

    
    await server.executeCommand({command: POST_PIN_AMOUNT_TO_GENERATE_CMD, arguments: [asURI(hwDefPath), [pinToAdd], "Gpio"]});

    const updatedHwDef = await readFile(hwDefPath, {encoding: "utf8"});
    assert.ok(updatedHwDef.includes(pinToAdd));
  });

  test("Command 'validateHwDefinition' returns true on valid/invalid hardware definition", async () => {
    const goodHwDefPath = fullPath("valid.json");
    const badHwDefPath = fullPath("invalid.json");

    // mock fs
    const files: Record<string, any> = {};
    files[goodHwDefPath] = "content of good hardware definition";
    files[badHwDefPath] = "content of bad hardware definition";
    mockfs(files);
    
    const mockedParser = mockParser(
      { content: files[goodHwDefPath], hwDef:  new HardwareDefinition(asURI(goodHwDefPath), "", []) },
      { content: files[badHwDefPath], hwDef:  undefined }
    );
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, new Map(), mockedParser);
    server.onInitialize(workspaceConfigSupportedParams());

    
    const respForGood = await server.executeCommand({command: VALIDATE_HW_DEFINITION_CMD, arguments: [asURI(goodHwDefPath)]});
    const respForBad = await server.executeCommand({command: VALIDATE_HW_DEFINITION_CMD, arguments: [asURI(badHwDefPath)]});

    assert.strictEqual(respForGood, true);
    assert.strictEqual(respForBad, false);
  });
  
  test("Command 'getAvailableOdmHardwareDefinitions' returns hw defs under sdk path", async () => {
    const sdkPath = fullPath("sdk");
    const odmHwDefPath = path.join(sdkPath, "HardwareDefinitions/odm.json");

    // mock fs
    const files: Record<string, any> = {};
    files[odmHwDefPath] = `
    {
      "Metadata": {"Type": "Azure Sphere Hardware Definition", "Version": 1},
      "Description": {"Name": "ODM Hardware Definition"},
      "Peripherals": []
    }`;
    mockfs(files);

    // mock parser to return valid odm hw def
    const odmHwDef = new HardwareDefinition("", "", [getDummyPinMapping({ name: "ODM_PIN", appManifestValue: 1 })]);
    const mockedParser = mockParser({ content: files[odmHwDefPath], hwDef: odmHwDef });
    
    // configure sdk path in settings for file against which we will run the command
    const currentFileUri = asURI(fullPath("someHwDefToPort.json"));
    const documentSettings = new Map();
    documentSettings.set(currentFileUri, Promise.resolve({ SdkPath: sdkPath, partnerApplicationPaths: new Map() }));
    
    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, documentSettings, mockedParser);
    server.onInitialize(workspaceConfigSupportedParams());
    
    
    const response = await server.executeCommand({
      command: GET_AVAILABLE_ODM_HARDWARE_DEFINITIONS_CMD,
      arguments: [currentFileUri]
    });

    assert.ok(Array.isArray(response));
    assert.strictEqual(response.length, 1);
    const expectedOdmHwDef: OdmHardwareDefinitionFile = {name: "ODM Hardware Definition", path: odmHwDefPath};
    assert.deepStrictEqual(response[0], expectedOdmHwDef);
  });
  
  test("Command 'portHardwareDefinition' ports hw def to file with suffix '-ported.json'", async () => {
    const baseHwDefPath = fullPath("base.json");
    const odmHwDefPath = fullPath("odm.json");
    const hwDefToPortPath = fullPath("hwdef.json");

    // mock fs
    const files: Record<string, any> = {};
    files[baseHwDefPath] = `
    {
      "Metadata": {"Type": "Azure Sphere Hardware Definition", "Version": 1},
      "Description": {"Name": "BASE"},
      "Peripherals": [ {"Name": "BASE_PIN", "Type": "Gpio", "AppManifestValue": 1 } ]
    }`;
    files[odmHwDefPath] = `
    {
      "Metadata": {"Type": "Azure Sphere Hardware Definition", "Version": 1},
      "Description": {"Name": "ODM"},
      "Imports": [ { "Path": "${path.basename(baseHwDefPath)}" } ],
      "Peripherals": [ {"Name": "ODM_PIN", "Type": "Gpio", "Mapping": "BASE_PIN" } ]
    }`;
    files[hwDefToPortPath] = `
    {
      "Metadata": {"Type": "Azure Sphere Hardware Definition", "Version": 1},
      "Description": {"Name": "TO PORT"},
      "Imports": [ { "Path": "${path.basename(baseHwDefPath)}" } ],
      "Peripherals": [ {"Name": "MY_PIN", "Type": "Gpio", "Mapping": "BASE_PIN" } ]
    }`;
    mockfs(files);

    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, new Map());
    server.onInitialize(workspaceConfigSupportedParams());
    
    
    const portedPath = await server.executeCommand({
      command: PORT_HARDWARE_DEFINITION_CMD,
      arguments: [hwDefToPortPath, odmHwDefPath]
    });

    assert.strictEqual(portedPath, fullPath("hwdef-ported.json"));
    assert.ok(existsSync(portedPath));
    const portedHwDefText = await readFile(portedPath, {encoding: "utf8"});
    const parsedPortedHwDef = new Parser().tryParseHardwareDefinitionFile(portedHwDefText, asURI(portedPath), "");
    assert.ok(parsedPortedHwDef);
  });
  
  test("Commands return undefined if no arguments passed", async () => {

    const allCommands = [
      GET_AVAILABLE_PIN_TYPES_CMD,
      GET_AVAILABLE_PINS_CMD,
      POST_PIN_AMOUNT_TO_GENERATE_CMD,
      VALIDATE_HW_DEFINITION_CMD,
      GET_AVAILABLE_ODM_HARDWARE_DEFINITIONS_CMD,
      PORT_HARDWARE_DEFINITION_CMD
    ];

    const server = new LanguageServer(mockConnection(), mockDocumentManager(), console, new Map());
    
    for (const cmd of allCommands) {
      const response = await server.executeCommand({command: cmd, arguments: undefined});
      assert.strictEqual(response, undefined);
    }
  });
});

/**
 * @returns Language Server initialization params with workspace configuration capabilities
 */
function workspaceConfigSupportedParams(): InitializeParams {
  return {
    rootUri: asURI(__dirname),
    processId: 1,
    capabilities: { workspace: { configuration: true } },
    workspaceFolders: null
  };
}

type WorkspaceAll = Configuration & WorkspaceFolders & FileOperationsFeatureShape & _RemoteWorkspace

/**
 * @returns A mocked connection.
 * Exposes its mock type through the 'mockType' property in case extra mocking customization is needed
 */
function mockConnection(): Connection & MockType<Connection> {
  const mockRemoteClientType = mockito.mock<RemoteClient>();

  const mockWorkspaceType = mockito.mock<WorkspaceAll>();
  mockito.when(mockWorkspaceType.getConfiguration()).thenResolve({});
  mockito.when(mockWorkspaceType.getConfiguration(anything())).thenResolve({});
  const mockedWorkspaceInstance = mockito.instance(mockWorkspaceType) as WorkspaceAll & MockType<WorkspaceAll>;
  mockedWorkspaceInstance.mockType = mockWorkspaceType;

  const mockedConnectionType = mockito.mock<Connection>();
  mockito.when(mockedConnectionType.console).thenReturn(console as unknown as RemoteConsole);
  mockito.when(mockedConnectionType.client).thenReturn(mockito.instance(mockRemoteClientType));
  mockito.when(mockedConnectionType.workspace).thenReturn(mockedWorkspaceInstance);
  mockito.when(mockedConnectionType.sendDiagnostics(anything())).thenReturn();
  mockito.when(mockedConnectionType.sendNotification(anything())).thenReturn();

  const mockedInstance = mockito.instance(mockedConnectionType) as Connection & MockType<Connection>;
  mockedInstance.mockType = mockedConnectionType;
  return mockedInstance;
}

/**
 * Mocks a parser to return custom hw defs/app manifests when certain content is passed
 * @param filesToMock list of mocks that should be returned when the mock parser is given some content.
 * e.g. {content: "x", appManifest: someAppManifest} => parser.tryParseAppManifestFile("x") will return someAppManifest
 */
function mockParser(...filesToMock: {content: string, hwDef?: HardwareDefinition, appManifest?: AppManifest}[]): Parser {
  const mockParserType = mockito.mock(Parser);
  for (const file of filesToMock) {
    if ("hwDef" in file) { // check for the hwDef property
      mockito.when(mockParserType.tryParseHardwareDefinitionFile(file.content, anyString(), anyString()))
        .thenReturn(file.hwDef);
    } else if ("appManifest" in file) { // check for the appManifest property
      mockito.when(mockParserType.tryParseAppManifestFile(file.content)).thenReturn(file.appManifest);
    }
  }
  return mockito.instance(mockParserType);
}

function mockDocumentManager(): TextDocuments<TextDocument> {
  const mockTextDocumentsConfigurationType = mockito.mock<TextDocumentsConfiguration<TextDocument>>();
  return new TextDocuments<TextDocument>(mockito.instance(mockTextDocumentsConfigurationType));
}

function mockDocument(uri: string, content: string): TextDocument {
  const mockTextDocumentType = mockito.mock<TextDocument>();
  mockito.when(mockTextDocumentType.uri).thenReturn(uri);
  mockito.when(mockTextDocumentType.getText()).thenReturn(content);

  const mockedDocument = mockito.instance(mockTextDocumentType);
  // give positionAt method a proper implementation
  mockedDocument.positionAt = (offset) => toPosition(mockedDocument.getText(), offset);
  return mockedDocument;
}

/**
 * Interface which includes a reference to Mockito's "mock type", used to modify/verify behavior of mock instances
 * 
 * e.g. mockito.mock(SomeClass) => returns the "mock type" on which we can call when/verify/etc...
 * 
 * mockito.instance(mockType)  returns an instance of the mocked type from which we can call SomeClass' methods.
 * Notice that Mockito assigns the type "SomeClass" to the generated "mock type", but this is misleading.
 */
interface MockType<T> {
  mockType: T
}

function fullPath(file: string): string {
  return path.join(__dirname, file);
}