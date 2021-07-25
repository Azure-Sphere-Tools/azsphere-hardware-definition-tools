import {
  createConnection,
  TextDocuments,
  Diagnostic,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  MessageType,
  ShowMessageRequest,
  ShowMessageRequestParams,
  TextDocumentEdit,
  TextEdit,
  IPCMessageReader,
  IPCMessageWriter,
  ShowMessageNotification,
  ShowMessageParams,
  CodeActionKind,
  CodeActionParams,
  CodeAction,
} from "vscode-languageserver/node";

import { addAppManifestPathsToSettings } from "./appManifestPaths";
import { parseCommandsParams } from "./cMakeLists";

import { pinMappingCompletionItemsAtPosition, getPinMappingSuggestions } from "./suggestions";
import { quickfix } from "./codeActionProvider";
import { URI } from "vscode-uri";
import * as fs from "fs";
import * as path from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { findDuplicateMappings, validateNamesAndMappings, findUnknownImports, validatePinBlock } from "./validator";
import { HardwareDefinition, PinMapping, UnknownImport, toRange } from "./hardwareDefinition";
import * as jsonc from "jsonc-parser";
import { readFile, writeFile } from "fs/promises";

const HW_DEFINITION_SCHEMA_URL = "https://raw.githubusercontent.com/Azure-Sphere-Tools/hardware-definition-schema/master/hardware-definition-schema.json";

// temporary hack to run unit tests with mocha instead of always calling 'createConnection(ProposedFeatures.all)'
// when fixed, remove IPCMessageReader/Writer from server.ts and LANGUAGE_SERVER_MODE from .vscode/settings.json
const runningTests = process.env.LANGUAGE_SERVER_MODE == "TEST";
// avoid referencing connection in other files/modules as it is expensive to create and can prevent tests from running in parallel
const connection = runningTests ? createConnection(new IPCMessageReader(process), new IPCMessageWriter(process)) : createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
let hasCodeActionLiteralsCapability = false;
let settingsPath: string;

const currentFile = {
  text: "",
  uri: "",
};

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Set setting.json path
  setSettingPath(params.clientInfo?.name);

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
  hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  hasCodeActionLiteralsCapability = !!(capabilities.textDocument && capabilities.textDocument.codeAction && capabilities.textDocument.codeAction.codeActionLiteralSupport);

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
      },
      // Commands requested from the client to the server
      executeCommandProvider: {
        commands: ["getAvailablePins", "getAvailablePinTypes", "postPinAmountToGenerate"],
      },
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  if (hasCodeActionLiteralsCapability) {
    result.capabilities.codeActionProvider = {
      codeActionKinds: [CodeActionKind.QuickFix],
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
  // Server receives a request from the client
  connection.onExecuteCommand(async (event) => {
    switch (event.command) {
      case "getAvailablePinTypes":
        if (event.arguments) {
          const pinTypes = await getPinTypes(event.arguments[0]);

          if (pinTypes) return pinTypes;
        }
        break;
      case "getAvailablePins":
        if (event.arguments) {
          const [uri, pinTypeSelected] = event.arguments;

          const hwDefinition = await checkCurrentHwDefinition(uri);

          if (hwDefinition && pinTypeSelected) {
            return getPinMappingSuggestions(hwDefinition, pinTypeSelected);
          }
        }
        break;
      case "postPinAmountToGenerate":
        if (event.arguments) {
          const [pinsToAdd, pinType] = event.arguments;
          addPinMappings(pinsToAdd, pinType);
        }
        break;
      default:
        connection.console.log(`Access Denied - ${event.command} not recognised`);
    }
  });
});

// The extension settings
interface ExtensionSettings {
  SdkPath: string;
}
const defaultSettings: ExtensionSettings = {
  SdkPath: process.platform == "linux" ? "/opt/azurespheresdk" : "C:\\Program Files (x86)\\Microsoft Azure Sphere SDK",
};

function toExtensionSettings(settingsToValidate: any): ExtensionSettings {
  if (!settingsToValidate?.SdkPath || settingsToValidate.SdkPath == "") {
    return { SdkPath: defaultSettings.SdkPath };
  }
  return settingsToValidate;
}

const addPinMappings = async (pinsToAdd: string[], pinType: string) => {
  const { text, uri } = currentFile;
  if (text && uri && pinsToAdd && pinType) {
    const { Peripherals } = JSON.parse(text);

    if (Peripherals) {
      pinsToAdd.forEach((pin) =>
        Peripherals.push({
          Name: "",
          Type: pinType,
          Mapping: pin,
          Comment: "",
        })
      );
    }

    const edits = jsonc.modify(text, ["Peripherals"], Peripherals, { formattingOptions: { insertSpaces: true } });
    try {
      await writeFile(uri, jsonc.applyEdits(text, edits));
    } catch (e) {
      console.error(e);
      return [];
    }
  }
};

const getPinTypes = async (uri: string) => {
  const text = await checkOdmJson(uri);
  const pinTypes: string[] = [];

  if (text) {
    const { Peripherals } = JSON.parse(text);

    for (const peripheral of Peripherals) {
      const { Type } = peripheral;
      if (!pinTypes.includes(Type)) pinTypes.push(Type);
    }

    return pinTypes;
  } else {
    displayErrorNotification("Error parsing current odm.json file.");
  }
};

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the vscode client but could happen with other clients.
let globalSettings: ExtensionSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExtensionSettings>> = new Map();

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = toExtensionSettings(change.settings.AzureSphere);
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExtensionSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace
      .getConfiguration({
        scopeUri: resource,
        section: "AzureSphere",
      })
      .then((azSphereSettings) => toExtensionSettings(azSphereSettings));

    documentSettings.set(resource, result);
  }
  return result;
}

const checkOdmJson = async (uri: string): Promise<string | undefined> => {
  if (!uri.endsWith(".json")) {
    displayErrorNotification("The current file is not a valid Hardware Definition (Must be a JSON file).");
    return;
  }
  const currentFilePath = URI.parse(uri).fsPath;
  const text = await readFile(currentFilePath, "utf8");

  currentFile;

  if (!text) {
    displayErrorNotification("Error reading current file");
    return;
  }
  currentFile.text = text;
  currentFile.uri = currentFilePath;

  return text;
};

const checkCurrentHwDefinition = async (uri: string): Promise<HardwareDefinition | undefined> => {
  const settings = await getDocumentSettings(uri);
  return tryParseHardwareDefinitionFile(currentFile.text, uri, settings.SdkPath);
};

const displayErrorNotification = (message: string) => {
  const msg: ShowMessageParams = {
    message,
    type: MessageType.Error,
  };
  connection.sendNotification(ShowMessageNotification.type, msg);
  return;
};

documents.onDidOpen(async (change) => {
  const textDocument = change.document;
  const settings = await getDocumentSettings(textDocument.uri);
  const text = textDocument.getText();

  if (textDocument.uri.endsWith("CMakeLists.txt")) {
    const hwDefinitionPath = parseCommandsParams(URI.parse(textDocument.uri).fsPath, connection.console.log);

    if (hwDefinitionPath) {
      const msg: ShowMessageParams = {
        message: `Hardware Definition found in the target specified in CMakeLists - ${hwDefinitionPath}`,
        type: MessageType.Info,
      };
      connection.sendNotification(ShowMessageNotification.type, msg);
    }
    return;
  }

  if (textDocument.uri.endsWith(".json")) {
    const hwDefinition = tryParseHardwareDefinitionFile(text, textDocument.uri, settings.SdkPath);

    if (!hwDefinition) {
      return;
    }

    if (!hwDefinition.schema) {
      connection.console.log("Can suggest adding json schema");
      const fileName = textDocument.uri.substring(textDocument.uri.lastIndexOf("/") + 1);
      const msg: ShowMessageRequestParams = {
        message: `${fileName} detected as Hardware Definition file. Add a json schema for type hints?`,
        type: MessageType.Info,
        actions: [{ title: "Yes" }, { title: "No" }],
      };
      const addJsonSchemaRequest = connection.sendRequest(ShowMessageRequest.type, msg);
      addJsonSchemaRequest.then((resp) => {
        if (resp?.title == "Yes") {
          connection.console.log(`Client accepted to add json schema for autocompletion on file ${fileName}`);
          const positionToInsertSchemaNode = textDocument.positionAt(text.indexOf(`"Metadata"`));

          connection.workspace.applyEdit({
            documentChanges: [
              TextDocumentEdit.create({ uri: textDocument.uri, version: textDocument.version }, [
                TextEdit.insert(positionToInsertSchemaNode, `"$schema": "${HW_DEFINITION_SCHEMA_URL}",\n`),
              ]),
            ],
          });
        }
      });
    }
  }
});
// Only keep settings for open documents
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async (change) => {
  const textDocument = change.document;

  if (textDocument.uri.endsWith("app_manifest.json") && settingsPath) {
    const absoluteSettingsPath = path.resolve(path.join(path.dirname(URI.parse(textDocument.uri).fsPath), settingsPath));
    const detectedPartnerApplications = await addAppManifestPathsToSettings(textDocument.uri, absoluteSettingsPath, connection.console.error);
    if (detectedPartnerApplications.length > 0) {
      const msg: ShowMessageParams = {
        message: `Partner applications ${detectedPartnerApplications.join(", ")} detected, please open their app_manifest.json`,
        type: MessageType.Warning,
      };
      connection.sendNotification(ShowMessageNotification.type, msg);
      return;
    }
  }

  if (textDocument.uri.endsWith(".json")) {
    await validateTextDocument(textDocument);
  }
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(textDocument.uri);
  const text = textDocument.getText();

  const hwDefinition = tryParseHardwareDefinitionFile(textDocument.getText(), textDocument.uri, settings.SdkPath);
  if (!hwDefinition) {
    return;
  }

  const diagnostics: Diagnostic[] = findDuplicateMappings(hwDefinition, text, textDocument, hasDiagnosticRelatedInformationCapability);
  const duplicateNamesDiagnostics: Diagnostic[] = validateNamesAndMappings(hwDefinition, hasDiagnosticRelatedInformationCapability);
  const pinBlockDiagnostics: Diagnostic[] = validatePinBlock(hwDefinition, hasDiagnosticRelatedInformationCapability);
  for (const duplicateNameDiagnostic of duplicateNamesDiagnostics) {
    diagnostics.push(duplicateNameDiagnostic);
  }
  for (const importDiagnostic of findUnknownImports(hwDefinition, textDocument)) {
    diagnostics.push(importDiagnostic);
  }
  for (const pinBlockDiagnostic of pinBlockDiagnostics) {
    diagnostics.push(pinBlockDiagnostic);
  }

  // Send the computed diagnostics to VSCode.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

export function tryParseHardwareDefinitionFile(hwDefinitionFileText: string, hwDefinitionFileUri: string, sdkPath: string): HardwareDefinition | undefined {
  try {
    const parseErrors: jsonc.ParseError[] = [];

    const hwDefinitionFileRootNode = jsonc.parseTree(hwDefinitionFileText, parseErrors);

    if (parseErrors.length > 0) {
      connection.console.warn("Encountered errors while parsing json file: ");
      parseErrors.forEach((e) => connection.console.warn(`${e.offset} to ${e.offset + e.length}: ${jsonc.printParseErrorCode(e.error)}`));
    }
    if (!hwDefinitionFileRootNode) {
      return;
    }

    const { Metadata, Imports, Peripherals, $schema } = jsonc.getNodeValue(hwDefinitionFileRootNode);
    const fileTypeFromMetadata = Metadata?.Type;
    if (fileTypeFromMetadata != "Azure Sphere Hardware Definition") {
      connection.console.log("File is not a Hardware Definition");
      return;
    }

    const unknownImports: UnknownImport[] = [];
    const validImports: HardwareDefinition[] = [];
    if (Array.isArray(Imports)) {
      const importsNode = jsonc.findNodeAtLocation(hwDefinitionFileRootNode, ["Imports"]) as jsonc.Node;
      const importsNodeStart = importsNode.offset;
      const importsNodeEnd = importsNodeStart + importsNode.length;

      for (const { Path } of Imports) {
        if (typeof Path == "string") {
          const hwDefinitionFilePath = URI.parse(path.dirname(hwDefinitionFileUri)).fsPath;
          const fullPathToImportedFile = findFullPath(Path, hwDefinitionFilePath, sdkPath);
          if (fullPathToImportedFile) {
            const importedHwDefFileUri = URI.file(fullPathToImportedFile).toString();
            let importedHwDefFileText = documents.get(importedHwDefFileUri)?.getText();
            if (!importedHwDefFileText) {
              importedHwDefFileText = fs.readFileSync(fullPathToImportedFile, { encoding: "utf8" });
            }
            if (importedHwDefFileText) {
              const importedHwDefinition = tryParseHardwareDefinitionFile(importedHwDefFileText, importedHwDefFileUri, sdkPath);
              if (importedHwDefinition) {
                validImports.push(importedHwDefinition);
              }
            }
          } else {
            unknownImports.push({
              fileName: Path,
              hwDefinitionFilePath: hwDefinitionFilePath,
              sdkPath: sdkPath,
              start: importsNodeStart,
              end: importsNodeEnd,
            });
          }
        }
      }
    }

    const pinMappings: PinMapping[] = [];

    if (Array.isArray(Peripherals)) {
      for (let i = 0; i < Peripherals.length; i++) {
        const { Name, Type, Mapping, AppManifestValue, Comment } = Peripherals[i];
        const hasMappingOrAppManifestValue = typeof Mapping == "string" || typeof AppManifestValue == "string" || typeof AppManifestValue == "number";
        const isPinMapping = typeof Name == "string" && typeof Type == "string" && hasMappingOrAppManifestValue;
        if (isPinMapping) {
          const mappingAsJsonNode = <jsonc.Node>jsonc.findNodeAtLocation(hwDefinitionFileRootNode, ["Peripherals", i]);
          const start = mappingAsJsonNode?.offset;
          const end = start + mappingAsJsonNode?.length;
          const pinMapping = new PinMapping(Name, Type, Mapping, AppManifestValue, toRange(hwDefinitionFileText, start, end), Comment);

          const mappingPropertyNode = jsonc.findNodeAtLocation(mappingAsJsonNode, ["Mapping"]);
          if (mappingPropertyNode) {
            const mappingPropertyStart = mappingPropertyNode.offset;
            const mappingPropertyEnd = mappingPropertyStart + mappingPropertyNode.length;
            pinMapping.mappingPropertyRange = toRange(hwDefinitionFileText, mappingPropertyStart, mappingPropertyEnd);
          }
          pinMappings.push(pinMapping);
        }
      }
    }
    return new HardwareDefinition(hwDefinitionFileUri, $schema, pinMappings, validImports, unknownImports);
  } catch (error) {
    connection.console.log("Cannot parse Hardware Definition file as JSON");
    return;
  }
}

/**
 *
 * @param relativeImportPath The relative path to the imported hw definition file (e.g. 'mt3620.json')
 * @param hwDefinitionFilePath The full path to the hw definition file which declared the import
 * @param sdkPath The path to the azure sphere sdk
 * @returns Full path to the imported hw definition file if it exists, otherwise undefined
 */
export function findFullPath(relativeImportPath: string, hwDefinitionFilePath: string, sdkPath: string): string | undefined {
  const pathFromHwDefinitionFile = path.join(hwDefinitionFilePath, relativeImportPath);
  const pathFromSdk = path.join(sdkPath, "HardwareDefinitions", relativeImportPath);
  if (fs.existsSync(pathFromHwDefinitionFile)) {
    return pathFromHwDefinitionFile;
  } else if (fs.existsSync(pathFromSdk)) {
    return pathFromSdk;
  } else {
    return;
  }
}

const setSettingPath = (ide: string | undefined) => {
  if (ide && ide.includes("Visual Studio Code")) {
    settingsPath = ".vscode/settings.json";
  } else {
    settingsPath = ".vs/VSWorkspaceSettings.json";
  }
};

connection.onCodeAction(provideCodeActions);
async function provideCodeActions(parms: CodeActionParams): Promise<CodeAction[]> {
  const hwDefinitionFileUri = parms.textDocument.uri;
  let hwDefFileText = documents.get(hwDefinitionFileUri)?.getText();
  if (!hwDefFileText) {
    hwDefFileText = fs.readFileSync(URI.file(hwDefinitionFileUri).fsPath, { encoding: "utf8" });
  }
  const sdkPath = (await getDocumentSettings(hwDefinitionFileUri)).SdkPath;
  const hwDefinition = tryParseHardwareDefinitionFile(hwDefFileText, hwDefinitionFileUri, sdkPath);
  if (!hwDefinition) {
    return [];
  }
  return quickfix(hwDefinition, parms);
}

connection.onCompletion(async (textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
  const hwDefinitionFileUri = textDocumentPosition.textDocument.uri;
  let hwDefFileText = documents.get(hwDefinitionFileUri)?.getText();
  if (!hwDefFileText) {
    hwDefFileText = fs.readFileSync(URI.file(hwDefinitionFileUri).fsPath, { encoding: "utf8" });
  }

  const sdkPath = (await getDocumentSettings(hwDefinitionFileUri)).SdkPath;

  const hwDefinition = tryParseHardwareDefinitionFile(hwDefFileText, hwDefinitionFileUri, sdkPath);
  if (!hwDefinition) {
    return [];
  }

  const caretPosition = textDocumentPosition.position;
  return pinMappingCompletionItemsAtPosition(hwDefinition, caretPosition);
});

// This handler resolves additional information for the item selected in
// the completion list.
// Clients always expect this event to be handled, even if no additional info is available.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
