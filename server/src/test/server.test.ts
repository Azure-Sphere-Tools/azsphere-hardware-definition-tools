import * as assert from "assert";
import * as mockito from "ts-mockito";
import path = require("path");
import { TextDocument } from "vscode-languageserver-textdocument";
import { FileOperationsFeatureShape } from "vscode-languageserver/lib/common/fileOperations";
import { WorkspaceFolders } from "vscode-languageserver/lib/common/workspaceFolders";
import { LanguageServer, startLanguageServer } from "../server";
import { asURI } from "./testUtils";
import { Connection, InitializeParams, RemoteClient, RemoteConsole, TextDocuments, TextDocumentsConfiguration, _RemoteWorkspace } from "vscode-languageserver";
import { Configuration } from "vscode-languageserver/lib/common/configuration";

suite("LanguageServer", () => {

  test("Initializes with proper capabilities", async () => {
    const server = new LanguageServer(mockConnection(), mockTextDocuments(), console);
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
      "getAvailablePins",
      "getAvailablePinTypes",
      "postPinAmountToGenerate",
      "validateHwDefinition",
      "getAvailableOdmHardwareDefinitions",
      "portHardwareDefinition"
    ];
    assert.deepStrictEqual(initResult.capabilities.executeCommandProvider?.commands, expectedDeclaredCommands);
  });

  test("Clears cached document settings on configuration change", async () => {
    const documentSettings = new Map();
    documentSettings.set("someuri", Promise.resolve({ SdkPath: "", partnerApplicationPaths: new Map() }));
    const server = new LanguageServer(mockConnection(), mockTextDocuments(), console, documentSettings);
    server.onInitialize(workspaceConfigSupportedParams());
    server.onDidChangeConfiguration({ settings: { AzureSphere: {} } });

    assert.strictEqual(documentSettings.size, 0);
  });
  
  test("Caches document settings when requesting settings for a file", async () => {
    const documentSettingsCache = new Map();
    const server = new LanguageServer(mockConnection(), mockTextDocuments(), console, documentSettingsCache);
    server.onInitialize(workspaceConfigSupportedParams());

    const fileUri = "file://a/file.json";

    const retrievedSettings = await server.getDocumentSettings(fileUri);
    const cachedSettings = await documentSettingsCache.get(fileUri);

    assert.strictEqual(documentSettingsCache.size, 1);
    assert.strictEqual(cachedSettings, retrievedSettings);
  });

  test("startLanguageServer runs without crashing", async () => {
    startLanguageServer(mockConnection());
  });  
});

/**
 * @returns Language Server initialization params with workspace configuration capabilities
 */
function workspaceConfigSupportedParams(): InitializeParams {
  return {
    rootUri: "",
    processId: 1,
    capabilities: { workspace: { configuration: true } },
    workspaceFolders: null
  };
}

function mockConnection(): Connection {
  const mockRemoteClientType = mockito.mock<RemoteClient>();

  const mockWorkspaceType = mockito.mock<Configuration & WorkspaceFolders & FileOperationsFeatureShape & _RemoteWorkspace>();
  mockito.when(mockWorkspaceType.getConfiguration()).thenResolve({});
  mockito.when(mockWorkspaceType.getConfiguration(mockito.anything())).thenResolve({});

  const mockedConnectionType = mockito.mock<Connection>();
  mockito.when(mockedConnectionType.console).thenReturn(console as unknown as RemoteConsole);
  mockito.when(mockedConnectionType.client).thenReturn(mockito.instance(mockRemoteClientType));
  mockito.when(mockedConnectionType.workspace).thenReturn(mockito.instance(mockWorkspaceType));

  return mockito.instance(mockedConnectionType);
}

function mockTextDocuments(): TextDocuments<TextDocument> {
  const mockTextDocumentsConfigurationType = mockito.mock<TextDocumentsConfiguration<TextDocument>>();
  return new TextDocuments<TextDocument>(mockito.instance(mockTextDocumentsConfigurationType));
}