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
  DiagnosticSeverity,
} from "vscode-languageserver/node";

import { parseCommandsParams } from "./cMakeLists";

import { pinMappingCompletionItemsAtPosition, getPinMappingSuggestions } from "./suggestions";
import { quickfix } from "./codeActionProvider";
import { URI } from "vscode-uri";
import * as fs from "fs";
import * as path from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { findUnknownImports, validateAppPinConflict, scanHardwareDefinition as scanHardwareDefinition } from "./validator";
import { HardwareDefinition, PinMapping, UnknownImport, toRange } from "./hardwareDefinition";
import { addAppManifestPathsToSettings, AppManifest, AppPin } from "./applicationManifest";
import { getPinTypes, addPinMappings } from "./pinMappingGeneration";
import * as jsonc from "jsonc-parser";
import { readFile } from "fs/promises";
import { hwDefinitionHeaderGen } from "./hwDefHeaderGeneration";
import { JsonHardwareDefinition, listOdmHardwareDefinitions, portHardwareDefinition, saveHardwareDefinition } from "./porting";

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

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Set settings.json path
  const projectRootUri: URI = URI.parse(params.workspaceFolders ? params.workspaceFolders[0].uri : params.rootUri ?? "");
  setSettingPath(projectRootUri, params.clientInfo?.name);

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
        commands: [
          "getAvailablePins", 
          "getAvailablePinTypes", 
          "postPinAmountToGenerate", 
          "validateHwDefinition", 
          "getAvailableOdmHardwareDefinitions", 
          "portHardwareDefinition"
        ]
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
          const hwDefUri = event.arguments[0];
          const hwDef = await getHardwareDefinition(hwDefUri);
          if (hwDef) {
            const pinTypes = await getPinTypes(hwDef);
            if (pinTypes) return pinTypes;
          }
        }
        break;
      case "getAvailablePins":
        if (event.arguments) {
          const [hwDefUri, pinTypeSelected] = event.arguments;

          const hwDefinition = await getHardwareDefinition(hwDefUri);

          if (hwDefinition && pinTypeSelected) {
            return getPinMappingSuggestions(hwDefinition, pinTypeSelected);
          }
        }
        break;
      case "postPinAmountToGenerate":
        if (event.arguments) {
          const [hwDefUri, pinsToAdd, pinType] = event.arguments;
          addPinMappings(pinsToAdd, pinType, hwDefUri, await getFileText(hwDefUri));
        }
        break;
      case "validateHwDefinition":
        if (event.arguments) {
          const hwDefinitionUri = event.arguments[0];
          const sdkPath = (await getDocumentSettings(hwDefinitionUri)).SdkPath;
          const hwDefinition = tryParseHardwareDefinitionFile(
            await readFile(URI.parse(hwDefinitionUri).fsPath, { encoding: "utf8" }), 
            hwDefinitionUri, 
            sdkPath
          );

          return (hwDefinition !== undefined);
        }
        break;
      case "getAvailableOdmHardwareDefinitions":
        if (event.arguments) {
          const currentDocumentUri = event.arguments[0];
          const sdkPath = (await getDocumentSettings(currentDocumentUri)).SdkPath;
          return listOdmHardwareDefinitions(sdkPath);
        }
        break;
      case "portHardwareDefinition":
        if (event.arguments) {
          const openHwDefPath = event.arguments[0];
          const targetHwDefPath = event.arguments[1];

          const openHwDefinitionUri = asURI(openHwDefPath);
          const targetHwDefinitionUri = asURI(targetHwDefPath);

          const sdkPath = (await getDocumentSettings(openHwDefinitionUri)).SdkPath;

          const hwDefinition = tryParseHardwareDefinitionFile(await readFile(openHwDefPath, { encoding: "utf8" }), openHwDefinitionUri, sdkPath);
          const targetHwDefinition = tryParseHardwareDefinitionFile(await readFile(targetHwDefPath, { encoding: "utf8" }), targetHwDefinitionUri, sdkPath);
    
          if (hwDefinition && targetHwDefinition) {
            const jsonHwDefinition = <JsonHardwareDefinition>JSON.parse(await readFile(openHwDefPath, { encoding: "utf8" }));
      
            const hwDefScan = scanHardwareDefinition(hwDefinition, true);
            const targetHwDefScan = scanHardwareDefinition(targetHwDefinition, true);

            const portedFileName = path.basename(openHwDefPath, ".json") + "-ported.json";
            const portedPath = path.join(path.dirname(openHwDefPath), portedFileName);
            // if target hw def is in sdk folder, only return its file name, otherwise return its path relative to where the generated file will be
            const importPath = targetHwDefPath.includes(sdkPath) 
              ? path.basename(targetHwDefPath) 
              : path.relative(path.dirname(portedPath), targetHwDefPath);

            const generated = portHardwareDefinition(jsonHwDefinition, hwDefScan, targetHwDefScan, importPath);
            await saveHardwareDefinition(generated, portedPath);
            return portedPath;
          }
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
  partnerApplicationPaths: Map<string, string>;
}
const defaultSettings: ExtensionSettings = {
  SdkPath: process.platform == "linux" 
    ? "/opt/azurespheresdk" 
    : "C:\\Program Files (x86)\\Microsoft Azure Sphere SDK",
  partnerApplicationPaths: new Map(),
};

function toExtensionSettings(settingsToValidate: any): ExtensionSettings {
  let sdkPath = settingsToValidate?.SdkPath; 
  if (!sdkPath || sdkPath == "") {
    sdkPath = defaultSettings.SdkPath;
  }
  
  const partnerAppPaths = new Map<string, string>();
  const partnerAppsFromSettings = settingsToValidate.partnerApplications;
  if (partnerAppsFromSettings && typeof partnerAppsFromSettings === "object") {
    for (const appId in partnerAppsFromSettings) {
      const partnerAppManifest = partnerAppsFromSettings[appId];
      partnerAppPaths.set(appId, partnerAppManifest);
    }
  }

  return { SdkPath: sdkPath, partnerApplicationPaths: partnerAppPaths};
}

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
  documents.all().forEach(validateDocument);
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

async function getHardwareDefinition(hwDefUri: any): Promise<HardwareDefinition | undefined> {
  const settings = await getDocumentSettings(hwDefUri);

  try {
    const hwDefText = await getFileText(hwDefUri);
    const hwDef = tryParseHardwareDefinitionFile(hwDefText, hwDefUri, settings.SdkPath);
    return hwDef;
  } catch (e) {
    connection.console.error(`Failed to get hw definition file ${hwDefUri} - ${e}`);
    return;
  }
}

export const displayNotification = (notification: ShowMessageParams | undefined) => {
  if (notification) return connection.sendNotification(ShowMessageNotification.type, notification);
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

  if (isHardwareDefinitionFile(textDocument.uri)) {
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

documents.onDidSave(async (save) => {
  // Hardware Definition header generation
  if(isHardwareDefinitionFile(save.document.uri)) {
    const uri = await validateHardwareDefinitionDoc(save.document);
    if (uri) displayNotification(await hwDefinitionHeaderGen(uri));
  }
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async (change) => validateDocument(change.document));

export const validateDocument = async (textDocument: TextDocument): Promise<string | undefined> => {
  if (isAppManifestFile(textDocument.uri) && settingsPath) {
    const appManifest = tryParseAppManifestFile(textDocument.getText());
    
    if (!appManifest) {
      return;
    }
    const existingPartnerAppPaths = (await getDocumentSettings(textDocument.uri)).partnerApplicationPaths;
    const absoluteSettingsPath = path.resolve(settingsPath);
    const detectedPartnerApplications = await addAppManifestPathsToSettings(textDocument.uri, absoluteSettingsPath, connection.console.error);
    const newPartnerApplications = detectedPartnerApplications.filter(appId => !existingPartnerAppPaths.has(appId));
    if (newPartnerApplications.length > 0) {
      const msg: ShowMessageParams = {
        message: `Partner applications ${newPartnerApplications.join(", ")} detected, add their app_manifest.json paths ` 
          + `to your ${path.basename(settingsPath)} to enable cross-application conflict detection`,
        type: MessageType.Warning,
      };
      displayNotification(msg);
    }

    await validateAppManifestDoc(textDocument, appManifest);
  }

  if (isHardwareDefinitionFile(textDocument.uri)) {
    await validateHardwareDefinitionDoc(textDocument);
  }
};

const validateAppManifestDoc = async (textDocument: TextDocument, appManifest: AppManifest): Promise<void> => {
  const settings = await getDocumentSettings(textDocument.uri);

  const CMakeListsPath = path.resolve(path.join(path.dirname(URI.parse(textDocument.uri).fsPath), "CMakeLists.txt"));
  const hwDefinitionPath = parseCommandsParams(CMakeListsPath, connection.console.log);
  if (!hwDefinitionPath) {
    return;
  }
  const hwDefinitionText: string = fs.readFileSync(hwDefinitionPath).toString();
  const hwDefinition = tryParseHardwareDefinitionFile(hwDefinitionText, hwDefinitionPath, settings.SdkPath);

  if (!hwDefinition) {
    return;
  }
  const hwDefScan = scanHardwareDefinition(hwDefinition, true);

  const diagnostics: Diagnostic[] = [];
  for (const partner of appManifest.Capabilities.AllowedApplicationConnections as [string]) {
    if (settings.partnerApplicationPaths.has(partner)) {
      const partnerAppManifestPath = <string>settings.partnerApplicationPaths.get(partner);
      if (fs.existsSync(partnerAppManifestPath)) {
        const partnerAppManifestText = await getFileText(asURI(partnerAppManifestPath));
        const partnerAppManifest = tryParseAppManifestFile(partnerAppManifestText);
        
        if(partnerAppManifest){
          diagnostics.push(...validateAppPinConflict(hwDefScan, appManifest, partnerAppManifest));
        }
      } else {
        displayNotification({
          message: `Could not find partner app ${partner} under path "${partnerAppManifestPath}".\n`
            + `Please check your ${path.basename(settingsPath)} to fix the path to the partner app manifest.`, 
          type: MessageType.Error
        });
      }
    }
  }
  // Send the computed diagnostics to VSCode.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
};

export function tryParseAppManifestFile(AppManifestFileText: string): AppManifest | undefined {
  try {
    const parseErrors: jsonc.ParseError[] = [];

    const AppManifestFileRootNode = jsonc.parseTree(AppManifestFileText, parseErrors);

    if (parseErrors.length > 0) {
      connection.console.warn("Encountered errors while parsing json file: ");
      parseErrors.forEach((e) => connection.console.warn(`${e.offset} to ${e.offset + e.length}: ${jsonc.printParseErrorCode(e.error)}`));
    }
    if (!AppManifestFileRootNode) {
      return;
    }

    const { ComponentId, Capabilities } = jsonc.getNodeValue(AppManifestFileRootNode);
    const { Gpio, I2cMaster, Pwm, Uart, SpiMaster, Adc, AllowedApplicationConnections } = Capabilities;
    const temptValue = new Map([
      ["Gpio", Gpio],
      ["I2cMaster", I2cMaster],
      ["Pwm", Pwm],
      ["Uart", Uart],
      ["SpiMaster", SpiMaster],
      ["Adc", Adc],
    ]);

    const CapabilitiesAsJsonNode = <jsonc.Node>jsonc.findNodeAtLocation(AppManifestFileRootNode, ["Capabilities"]);

    const values: Map<string, any> = new Map();
    CapabilitiesAsJsonNode.children?.forEach((keyValue) => {
      if (keyValue.children) {
        values.set(keyValue.children[0].value, {
          range: toRange(AppManifestFileText, keyValue.offset, keyValue.offset + keyValue.length),
          key: {
            range: toRange(AppManifestFileText, keyValue.children[0].offset, keyValue.children[0].offset + keyValue.children[0].length),
            text: keyValue.children[0].value,
          },
          value: {
            range: toRange(AppManifestFileText, keyValue.children[1].offset, keyValue.children[1].offset + keyValue.children[1].length),
            text: temptValue.get(keyValue.children[0].value),
          },
        });
      }
    });

    const appPin = new AppPin(
      values.get("Gpio"),
      values.get("I2cMaster"),
      values.get("Pwm"),
      values.get("Uart"),
      values.get("SpiMaster"),
      values.get("Adc"),
      AllowedApplicationConnections,
      values
    );

    return new AppManifest(ComponentId, appPin);
  } catch (error) {
    connection.console.log("Cannot parse application manifest file as JSON");
    return;
  }
}

async function validateHardwareDefinitionDoc(textDocument: TextDocument): Promise<string | undefined> {
  const settings = await getDocumentSettings(textDocument.uri);

  const hwDefinition = tryParseHardwareDefinitionFile(textDocument.getText(), textDocument.uri, settings.SdkPath);
  if (!hwDefinition) {
    return;
  }

  const hwDefinitionScan = scanHardwareDefinition(hwDefinition, hasDiagnosticRelatedInformationCapability);
  
  const diagnostics: Diagnostic[] = [];
  diagnostics.push(...hwDefinitionScan.diagnostics);
  diagnostics.push(...findUnknownImports(hwDefinition, textDocument));

  // Send the computed diagnostics to VSCode.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });

  return textDocument.uri;
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

    for (let i = 0; i < Peripherals.length; i++) {
      const { Name, Type, Mapping, AppManifestValue } = Peripherals[i];
      const hasMappingOrAppManifestValue = typeof Mapping == "string" || typeof AppManifestValue == "string" || typeof AppManifestValue == "number";
      const isPinMapping = typeof Name == "string" && typeof Type == "string" && hasMappingOrAppManifestValue;

      if (isPinMapping) {
        const mappingAsJsonNode = <jsonc.Node>jsonc.findNodeAtLocation(hwDefinitionFileRootNode, ["Peripherals", i]);

        const values: Map<string, any> = new Map();
        const range = toRange(hwDefinitionFileText, mappingAsJsonNode.offset, mappingAsJsonNode.offset + mappingAsJsonNode.length);

        mappingAsJsonNode.children?.forEach((keyValue) => {
          if (keyValue.children) {
            values.set(keyValue.children[0].value.toLowerCase(), {
              range: toRange(hwDefinitionFileText, keyValue.offset, keyValue.offset + keyValue.length),
              key: {
                range: toRange(hwDefinitionFileText, keyValue.children[0].offset, keyValue.children[0].offset + keyValue.children[0].length),
                text: keyValue.children[0].value,
              },
              value: {
                range: toRange(hwDefinitionFileText, keyValue.children[1].offset, keyValue.children[1].offset + keyValue.children[1].length),
                text: keyValue.children[1].value,
              },
            });
          }
        });

        pinMappings.push(new PinMapping(range, values.get("name"), values.get("type"), values.get("mapping"), values.get("appmanifestvalue"), values.get("comment")));
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

const setSettingPath = (projectRootUri: URI, ide: string | undefined) => {
  let settingsRelativeLocation: string;
  if (ide && ide.includes("Visual Studio Code")) {
    settingsRelativeLocation = ".vscode/settings.json";
  } else {
    settingsRelativeLocation = ".vs/VSWorkspaceSettings.json";
  }
  settingsPath = path.join(projectRootUri.fsPath, settingsRelativeLocation);
};

connection.onCodeAction(provideCodeActions);
async function provideCodeActions(parms: CodeActionParams): Promise<CodeAction[]> {
  const docUri = parms.textDocument.uri;
  if (isHardwareDefinitionFile(docUri)) {
    const hwDefinition = await getHardwareDefinition(docUri);
    if (!hwDefinition) {
      return [];
    }
    return quickfix(hwDefinition, parms);
  }
  return [];
}

connection.onCompletion(async (textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
  const docUri = textDocumentPosition.textDocument.uri;
  if (isHardwareDefinitionFile(docUri)) {
    const hwDefinition = await getHardwareDefinition(docUri);
    if (!hwDefinition) {
      return [];
    }

    const caretPosition = textDocumentPosition.position;
    return pinMappingCompletionItemsAtPosition(hwDefinition, caretPosition);
  }
  return [];
});

// This handler resolves additional information for the item selected in
// the completion list.
// Clients always expect this event to be handled, even if no additional info is available.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

async function getFileText(uri: string): Promise<string> {
  let fileText = documents.get(uri)?.getText();
  if (!fileText) {
    fileText = await readFile(URI.parse(uri).fsPath, { encoding: "utf8" });
  }
  return fileText;
}

function isHardwareDefinitionFile(uri: string) {
  return uri.endsWith(".json") && !isAppManifestFile(uri);
}

function isAppManifestFile(uri: string) {
  return uri.endsWith("app_manifest.json");
}

function asURI(filePath: string): string {
  return URI.file(path.resolve(filePath)).toString();
}

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
