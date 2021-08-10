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
  Connection,
  DidChangeConfigurationParams,
  TextDocumentChangeEvent,
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

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
let hasCodeActionLiteralsCapability = false;
let settingsPath: string;


export class LanguageServer {
  private connection: Connection;

  /**
   * A simple text document manager
   */
  private documents: TextDocuments<TextDocument>;

  /**
   * The global settings, used when the `workspace/configuration` request is not supported by the client.
   * Please note that this is not the case when using this server with the vscode client but could happen with other clients.
   */
  private globalSettings: ExtensionSettings;

  /**
   * Caches the settings of all open documents
   */
  private documentSettings: Map<string, Thenable<ExtensionSettings>>;

  constructor (connection: Connection, documents: TextDocuments<TextDocument>) {
    this.connection = connection;
    this.documents = documents;
    this.globalSettings = defaultSettings();
    this.documentSettings = new Map();
  }
  
  onInitialize(params: InitializeParams): InitializeResult<any> {
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
  }

  onInitialized(): void {
    if (hasConfigurationCapability) {
      // Register for all configuration changes.
      this.connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
      this.connection.workspace.onDidChangeWorkspaceFolders((_event) => {
        this.connection.console.log("Workspace folder change event received.");
      });
    }
    // Server receives a request from the client
    this.connection.onExecuteCommand(async (event) => {
      switch (event.command) {
        case "getAvailablePinTypes":
          if (event.arguments) {
            const hwDefUri = event.arguments[0];
            const hwDef = await this.getHardwareDefinition(hwDefUri);
            if (hwDef) {
              const pinTypes = await getPinTypes(hwDef);
              if (pinTypes) {
                return pinTypes;
              } else {
                this.displayNotification({ 
                  message: "Hardware Definition file does not have any imports to generate pins from.",
                  type: MessageType.Error
                });
              }

            }
          }
          break;
        case "getAvailablePins":
          if (event.arguments) {
            const [hwDefUri, pinTypeSelected] = event.arguments;
  
            const hwDefinition = await this.getHardwareDefinition(hwDefUri);
  
            if (hwDefinition && pinTypeSelected) {
              return getPinMappingSuggestions(hwDefinition, pinTypeSelected);
            }
          }
          break;
        case "postPinAmountToGenerate":
          if (event.arguments) {
            const [hwDefUri, pinsToAdd, pinType] = event.arguments;
            const error = await addPinMappings(pinsToAdd, pinType, hwDefUri, await this.getFileText(hwDefUri));
            if (error) {
              this.displayNotification({
                message: `Failed to add new pin mappings to ${hwDefUri} - ${error}.`,
                type: MessageType.Error
              });
            }
          }
          break;
        case "validateHwDefinition":
          if (event.arguments) {
            const hwDefinitionUri = event.arguments[0];
            const sdkPath = (await this.getDocumentSettings(hwDefinitionUri)).SdkPath;
            const hwDefinition = tryParseHardwareDefinitionFile(
              await readFile(hwDefinitionUri, { encoding: "utf8" }), 
              hwDefinitionUri, 
              sdkPath
            );
  
            return (hwDefinition !== undefined);
          }
          break;
        case "getAvailableOdmHardwareDefinitions":
          if (event.arguments) {
            const currentDocumentUri = event.arguments[0];
            const sdkPath = (await this.getDocumentSettings(currentDocumentUri)).SdkPath;
            return listOdmHardwareDefinitions(sdkPath);
          }
          break;
        case "portHardwareDefinition":
          if (event.arguments) {
            const openHwDefPath = event.arguments[0];
            const targetHwDefPath = event.arguments[1];
  
            const openHwDefinitionUri = asURI(openHwDefPath);
            const targetHwDefinitionUri = asURI(targetHwDefPath);
  
            const sdkPath = (await this.getDocumentSettings(openHwDefinitionUri)).SdkPath;
  
            const hwDefinition = tryParseHardwareDefinitionFile(await readFile(openHwDefPath, { encoding: "utf8" }), openHwDefinitionUri, sdkPath);
            const targetHwDefinition = tryParseHardwareDefinitionFile(await readFile(targetHwDefPath, { encoding: "utf8" }), targetHwDefinitionUri, sdkPath);
      
            if (hwDefinition && targetHwDefinition) {
              const jsonHwDefinition = <JsonHardwareDefinition>JSON.parse(await readFile(openHwDefPath, { encoding: "utf8" }));
        
              const hwDefScan = scanHardwareDefinition(hwDefinition, true);
              const targetHwDefScan = scanHardwareDefinition(targetHwDefinition, true);
              const generated = portHardwareDefinition(jsonHwDefinition, hwDefScan, targetHwDefScan, path.basename(targetHwDefPath));
  
              const portedFileName = path.basename(openHwDefPath, ".json") + "-ported.json";
              const portedPath = path.join(path.dirname(openHwDefPath), portedFileName);
              await saveHardwareDefinition(generated, portedPath);
              return portedPath;
            }
          }
          break;
        default:
          this.connection.console.log(`Access Denied - ${event.command} not recognised`);
      }
    });
  }

  onDidChangeConfiguration(change: DidChangeConfigurationParams): void {
    if (hasConfigurationCapability) {
      // Reset all cached document settings
      this.documentSettings.clear();
    } else {
      this.globalSettings = toExtensionSettings(change.settings.AzureSphere);
    }
  
    // Revalidate all open text documents
    this.documents.all().forEach(this.validateDocument);
  }

  getDocumentSettings(resource: string): Thenable<ExtensionSettings> {
    if (!hasConfigurationCapability) {
      return Promise.resolve(this.globalSettings);
    }
    let result = this.documentSettings.get(resource);
    if (!result) {
      result = this.connection.workspace
        .getConfiguration({
          scopeUri: resource,
          section: "AzureSphere",
        })
        .then((azSphereSettings) => toExtensionSettings(azSphereSettings));
  
      this.documentSettings.set(resource, result);
    }
    return result;
  }

  async getHardwareDefinition(hwDefUri: any): Promise<HardwareDefinition | undefined> {
    const settings = await this.getDocumentSettings(hwDefUri);
  
    try {
      const hwDefText = await this.getFileText(hwDefUri);
      const hwDef = tryParseHardwareDefinitionFile(hwDefText, hwDefUri, settings.SdkPath);
      return hwDef;
    } catch (e) {
      this.connection.console.error(`Failed to get hw definition file ${hwDefUri} - ${e}`);
      return;
    }
  }
  
  async onDidOpen(change: TextDocumentChangeEvent<TextDocument>): Promise<void> {
    await new Promise(r => setTimeout(r, 10000));

    const textDocument = change.document;
    const settings = await this.getDocumentSettings(textDocument.uri);
    const text = textDocument.getText();
  
    if (isHardwareDefinitionFile(textDocument.uri)) {
      const hwDefinition = tryParseHardwareDefinitionFile(text, textDocument.uri, settings.SdkPath);
  
      if (!hwDefinition) {
        return;
      }
  
      if (!hwDefinition.schema) {
        this.connection.console.log("Can suggest adding json schema");
        const fileName = textDocument.uri.substring(textDocument.uri.lastIndexOf("/") + 1);
        const msg: ShowMessageRequestParams = {
          message: `${fileName} detected as Hardware Definition file. Add a json schema for type hints?`,
          type: MessageType.Info,
          actions: [{ title: "Yes" }, { title: "No" }],
        };
        const addJsonSchemaRequest = this.connection.sendRequest(ShowMessageRequest.type, msg);
        addJsonSchemaRequest.then((resp) => {
          if (resp?.title == "Yes") {
            this.connection.console.log(`Client accepted to add json schema for autocompletion on file ${fileName}`);
            const positionToInsertSchemaNode = textDocument.positionAt(text.indexOf(`"Metadata"`));
  
            this.connection.workspace.applyEdit({
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
  }

  // Only keep settings for open documents
  onDidClose(e: TextDocumentChangeEvent<TextDocument>): void {
    this.documentSettings.delete(e.document.uri);
  }

  async onDidSave(save: TextDocumentChangeEvent<TextDocument>): Promise<void> {
    // Hardware Definition header generation
    if(isHardwareDefinitionFile(save.document.uri)) {
      const uri = await this.validateHardwareDefinitionDoc(save.document);
      if (uri) this.displayNotification(await hwDefinitionHeaderGen(uri));
    }
  }

  /**
   * This event is emitted when the text document is first opened or when its content has changed.
   * @param change The opened/changed document
   */
  async onDidChangeContent(change: TextDocumentChangeEvent<TextDocument>) {
    await languageServer.validateDocument(change.document);
  }

  async validateDocument(textDocument: TextDocument): Promise<string | undefined> {
    if (isAppManifestFile(textDocument.uri) && settingsPath) {
      const appManifest = tryParseAppManifestFile(textDocument.getText());
      
      if (!appManifest) {
        return;
      }
      const existingPartnerAppPaths = (await this.getDocumentSettings(textDocument.uri)).partnerApplicationPaths;
      const absoluteSettingsPath = path.resolve(settingsPath);
      const detectedPartnerApplications = await addAppManifestPathsToSettings(textDocument.uri, absoluteSettingsPath, this.connection.console.error);
      const newPartnerApplications = detectedPartnerApplications.filter(appId => !existingPartnerAppPaths.has(appId));
      if (newPartnerApplications.length > 0) {
        const msg: ShowMessageParams = {
          message: `Partner applications ${newPartnerApplications.join(", ")} detected, add their app_manifest.json paths ` 
            + `to your ${path.basename(settingsPath)} to enable cross-application conflict detection`,
          type: MessageType.Warning,
        };
        this.displayNotification(msg);
      }
  
      await this.validateAppManifestDoc(textDocument, appManifest);
    }
  
    if (isHardwareDefinitionFile(textDocument.uri)) {
      await this.validateHardwareDefinitionDoc(textDocument);
    }
  }

  async validateAppManifestDoc(textDocument: TextDocument, appManifest: AppManifest): Promise<void> {
    const settings = await this.getDocumentSettings(textDocument.uri);

    const CMakeListsPath = path.resolve(path.join(path.dirname(URI.parse(textDocument.uri).fsPath), "CMakeLists.txt"));
    const hwDefinitionPath = parseCommandsParams(CMakeListsPath, this.connection.console.log);
    if (!hwDefinitionPath) {
      return;
    }
    const hwDefinitionText: string = await this.getFileText(asURI(hwDefinitionPath));
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
          const partnerAppManifestText = await this.getFileText(asURI(partnerAppManifestPath));
          const partnerAppManifest = tryParseAppManifestFile(partnerAppManifestText);
          
          if(partnerAppManifest){
            diagnostics.push(...validateAppPinConflict(hwDefScan, appManifest, partnerAppManifest));
          }
        } else {
          this.displayNotification({
            message: `Could not find partner app ${partner} under path "${partnerAppManifestPath}".\n`
              + `Please check your ${path.basename(settingsPath)} to fix the path to the partner app manifest.`, 
            type: MessageType.Error
          });
        }
      }
    }
    // Send the computed diagnostics to VSCode.
    this.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  }

  async validateHardwareDefinitionDoc(textDocument: TextDocument): Promise<string | undefined> {
    const settings = await this.getDocumentSettings(textDocument.uri);
  
    const hwDefinition = tryParseHardwareDefinitionFile(textDocument.getText(), textDocument.uri, settings.SdkPath);
    if (!hwDefinition) {
      return;
    }
  
    const hwDefinitionScan = scanHardwareDefinition(hwDefinition, hasDiagnosticRelatedInformationCapability);
    
    const diagnostics: Diagnostic[] = [];
    diagnostics.push(...hwDefinitionScan.diagnostics);
    diagnostics.push(...findUnknownImports(hwDefinition, textDocument));
  
    // Send the computed diagnostics to VSCode.
    this.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  
    return textDocument.uri;
  }

  async getFileText(uri: string): Promise<string> {
    let fileText = this.documents.get(uri)?.getText();
    if (!fileText) {
      fileText = await readFile(URI.parse(uri).fsPath, { encoding: "utf8" });
    }
    return fileText;
  }

  displayNotification(notification: ShowMessageParams | undefined) {
    if (notification) this.connection.sendNotification(ShowMessageNotification.type, notification);
  }

  async onCodeAction(parms: CodeActionParams): Promise<CodeAction[]> {
    const docUri = parms.textDocument.uri;
    if (isHardwareDefinitionFile(docUri)) {
      const hwDefinition = await this.getHardwareDefinition(docUri);
      if (!hwDefinition) {
        return [];
      }
      return quickfix(hwDefinition, parms);
    }
    return [];
  }
  
  async onCompletion(textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> {
    const docUri = textDocumentPosition.textDocument.uri;
    if (isHardwareDefinitionFile(docUri)) {
      const hwDefinition = await this.getHardwareDefinition(docUri);
      if (!hwDefinition) {
        return [];
      }
  
      const caretPosition = textDocumentPosition.position;
      return pinMappingCompletionItemsAtPosition(hwDefinition, caretPosition);
    }
    return [];
  }

  /**
   * This handler resolves additional information for the item selected in the completion list.
   * Clients always expect this event to be handled, even if no additional info is available.
   */
  onCompletionResolve(item: CompletionItem): CompletionItem {
    return item;
  }
  
}

// The extension settings
interface ExtensionSettings {
  SdkPath: string;
  partnerApplicationPaths: Map<string, string>;
}

function defaultSettings(): ExtensionSettings {
  return {
    SdkPath: process.platform == "linux" 
      ? "/opt/azurespheresdk" 
      : "C:\\Program Files (x86)\\Microsoft Azure Sphere SDK",
    partnerApplicationPaths: new Map()
  };
}

function toExtensionSettings(settingsToValidate: any): ExtensionSettings {
  let sdkPath = settingsToValidate?.SdkPath; 
  if (!sdkPath || sdkPath == "") {
    sdkPath = defaultSettings().SdkPath;
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

function isHardwareDefinitionFile(uri: string) {
  return uri.endsWith(".json") && !isAppManifestFile(uri);
}

function isAppManifestFile(uri: string) {
  return uri.endsWith("app_manifest.json");
}

function asURI(filePath: string): string {
  return URI.file(path.resolve(filePath)).toString();
}

// avoid referencing connection in other files/modules as it is expensive to create and can prevent tests from running in parallel
const connection = runningTests ? createConnection(new IPCMessageReader(process), new IPCMessageWriter(process)) : createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const languageServer = new LanguageServer(connection, documents);

connection.onInitialize((params) => languageServer.onInitialize(params));

connection.onInitialized(() => languageServer.onInitialized());

connection.onDidChangeConfiguration((change) => languageServer.onDidChangeConfiguration(change));

documents.onDidOpen(async (change) => await languageServer.onDidOpen(change));
// Only keep settings for open documents
documents.onDidClose((e) => languageServer.onDidClose(e));

documents.onDidSave(async (save) => await languageServer.onDidSave(save));

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async (change) => await languageServer.onDidChangeContent(change));

connection.onCodeAction(async (params) => await languageServer.onCodeAction(params));

connection.onCompletion(async (docPosition) => await languageServer.onCompletion(docPosition));

// This handler resolves additional information for the item selected in the completion list.
// Clients always expect this event to be handled, even if no additional info is available.
connection.onCompletionResolve((item) => languageServer.onCompletionResolve(item));

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
