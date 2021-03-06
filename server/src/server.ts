import {
  TextDocuments,
  Diagnostic,
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
  ShowMessageNotification,
  ShowMessageParams,
  CodeActionKind,
  CodeActionParams,
  CodeAction,
  Connection,
  DidChangeConfigurationParams,
  TextDocumentChangeEvent,
  DiagnosticSeverity,
  ExecuteCommandParams,
} from "vscode-languageserver/node";

import { parseCommandsParams } from "./cMakeLists";

import { pinMappingCompletionItemsAtPosition, getPinMappingSuggestions } from "./suggestions";
import { quickfix } from "./codeActionProvider";
import { URI } from "vscode-uri";
import * as fs from "fs";
import * as path from "path";
import { Range, TextDocument } from "vscode-languageserver-textdocument";
import { findUnknownImports, validateAppPinConflict, scanHardwareDefinition as scanHardwareDefinition, HardwareDefinitionScan } from "./validator";
import { HardwareDefinition } from "./hardwareDefinition";
import { partnerAppsToAddInSettings, AppManifest } from "./applicationManifest";
import { getPinTypes, addPinMappings } from "./pinMappingGeneration";
import { readFile } from "fs/promises";
import { hwDefinitionHeaderGen } from "./hwDefHeaderGeneration";
import { JsonHardwareDefinition, listOdmHardwareDefinitions, portHardwareDefinition, saveHardwareDefinition } from "./porting";
import { HW_DEFINITION_SCHEMA_URL, Logger } from "./utils";
import { Parser } from "./parser";
import { appManifestNotFound } from "./diagnostics";


export const GET_AVAILABLE_PIN_TYPES_CMD = "getAvailablePinTypes";
export const GET_AVAILABLE_PINS_CMD = "getAvailablePins";
export const POST_PIN_AMOUNT_TO_GENERATE_CMD = "postPinAmountToGenerate";
export const VALIDATE_HW_DEFINITION_CMD = "validateHwDefinition";
export const GET_AVAILABLE_ODM_HARDWARE_DEFINITIONS_CMD = "getAvailableOdmHardwareDefinitions";
export const PORT_HARDWARE_DEFINITION_CMD = "portHardwareDefinition";

const UPDATE_PARTNER_APPS_NOTIF = "hardwareDefinitions/updatePartnerApps";

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
let hasCodeActionLiteralsCapability = false;
let settingsDisplayName: string;


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

  private parser: Parser;

  private logger: Logger 

  constructor(
    connection: Connection,
    documents: TextDocuments<TextDocument>,
    logger: Logger,
    documentSettings = new Map<string, Thenable<ExtensionSettings>>(),
    parser = new Parser(documents, logger)) {
      
    this.connection = connection;
    this.documents = documents;
    this.globalSettings = defaultSettings();
    this.documentSettings = documentSettings;
    this.parser = parser;
    this.logger = logger;
  }
  
  onInitialize(params: InitializeParams): InitializeResult<any> {
    const capabilities = params.capabilities;

    setSettingsName(params.clientInfo?.name);

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
            GET_AVAILABLE_PIN_TYPES_CMD,
            GET_AVAILABLE_PINS_CMD,
            POST_PIN_AMOUNT_TO_GENERATE_CMD,
            VALIDATE_HW_DEFINITION_CMD,
            GET_AVAILABLE_ODM_HARDWARE_DEFINITIONS_CMD,
            PORT_HARDWARE_DEFINITION_CMD
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
    // Server receives a request from the client
    this.connection.onExecuteCommand(async (event) => {
      const commandResponse = await this.executeCommand(event);
      return commandResponse;
    });
  }

  async executeCommand(event: ExecuteCommandParams): Promise<any> {
    switch (event.command) {
      case GET_AVAILABLE_PIN_TYPES_CMD:
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
      case GET_AVAILABLE_PINS_CMD:
        if (event.arguments) {
          const [hwDefUri, pinTypeSelected] = event.arguments;

          const hwDefinition = await this.getHardwareDefinition(hwDefUri);

          if (hwDefinition && pinTypeSelected) {
            return getPinMappingSuggestions(hwDefinition, pinTypeSelected);
          }
        }
        break;
      case POST_PIN_AMOUNT_TO_GENERATE_CMD:
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
      case VALIDATE_HW_DEFINITION_CMD:
        if (event.arguments) {
          const hwDefinitionUri = event.arguments[0];
          const hwDefinition: HardwareDefinition | undefined = await this.getHardwareDefinition(hwDefinitionUri);
          return (hwDefinition !== undefined);
        }
        break;
      case GET_AVAILABLE_ODM_HARDWARE_DEFINITIONS_CMD:
        if (event.arguments) {
          const currentDocumentUri = event.arguments[0];
          const sdkPath = (await this.getDocumentSettings(currentDocumentUri)).SdkPath;
          return listOdmHardwareDefinitions(sdkPath);
        }
        break;
      case PORT_HARDWARE_DEFINITION_CMD:
        if (event.arguments) {
          const openHwDefPath = event.arguments[0];
          const targetHwDefPath = event.arguments[1];

          const openHwDefinitionUri = asURI(openHwDefPath);
          const targetHwDefinitionUri = asURI(targetHwDefPath);

          const sdkPath = (await this.getDocumentSettings(openHwDefinitionUri)).SdkPath;

          const hwDefinition = this.parser.tryParseHardwareDefinitionFile(await readFile(openHwDefPath, { encoding: "utf8" }), openHwDefinitionUri, sdkPath);
          const targetHwDefinition = this.parser.tryParseHardwareDefinitionFile(await readFile(targetHwDefPath, { encoding: "utf8" }), targetHwDefinitionUri, sdkPath);
    
          if (hwDefinition && targetHwDefinition) {
            const jsonHwDefinition = <JsonHardwareDefinition>JSON.parse(await readFile(openHwDefPath, { encoding: "utf8" }));
      
            
            const portedFileName = path.basename(openHwDefPath, ".json") + "-ported.json";
            const portedPath = path.join(path.dirname(openHwDefPath), portedFileName);
            // if target hw def is in sdk folder, only return its file name, otherwise return its path relative to where the generated file will be
            const importPath = targetHwDefPath.includes(sdkPath)
              ? path.basename(targetHwDefPath)
              : path.relative(path.dirname(portedPath), targetHwDefPath);

            const generated = portHardwareDefinition(jsonHwDefinition, hwDefinition, targetHwDefinition, importPath);
            await saveHardwareDefinition(generated, portedPath);
            return portedPath;
          }
        }
        break;
      default:
        this.logger.log(`Access Denied - ${event.command} not recognised`);
    }
  }

  onDidChangeConfiguration(change: DidChangeConfigurationParams): void {
    if (hasConfigurationCapability) {
      // Reset all cached document settings
      this.documentSettings.clear();
    } else {
      this.globalSettings = toExtensionSettings(change.settings.AzureSphere);
    }
  
    // Revalidate all open text documents
    this.documents.all().forEach((doc) => this.validateDocument(doc));
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

  private async getHardwareDefinition(hwDefUri: string): Promise<HardwareDefinition | undefined> {
    const settings = await this.getDocumentSettings(hwDefUri);
  
    try {
      const hwDefText = await this.getFileText(hwDefUri);
      const hwDef = this.parser.tryParseHardwareDefinitionFile(hwDefText, hwDefUri, settings.SdkPath);
      return hwDef;
    } catch (e) {
      this.logger.error(`Failed to get hw definition file ${hwDefUri} - ${e}`);
      return;
    }
  }
  
  async onDidOpen(change: TextDocumentChangeEvent<TextDocument>): Promise<void> {

    const textDocument = change.document;
    const settings = await this.getDocumentSettings(textDocument.uri);
    const text = textDocument.getText();
  
    if (isHardwareDefinitionFile(textDocument.uri)) {
      const hwDefinition = this.parser.tryParseHardwareDefinitionFile(text, textDocument.uri, settings.SdkPath);
  
      if (!hwDefinition) {
        return;
      }
  
      if (hwDefinition.schema == undefined) {
        const fileName = textDocument.uri.substring(textDocument.uri.lastIndexOf("/") + 1);
        const msg: ShowMessageRequestParams = {
          message: `${fileName} detected as Hardware Definition file. Add a json schema for type hints?`,
          type: MessageType.Info,
          actions: [{ title: "Yes" }, { title: "No" }],
        };
        const addJsonSchemaRequest = this.connection.sendRequest(ShowMessageRequest.type, msg);
        await addJsonSchemaRequest.then((resp) => {
          if (resp?.title == "Yes") {
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
      const hwDefScan = await this.validateHardwareDefinitionDoc(save.document);
      const hasNoErrors = hwDefScan?.diagnostics.every(d => d.severity != DiagnosticSeverity.Error);
      if (hwDefScan && hasNoErrors) {
        const result = await hwDefinitionHeaderGen(save.document.uri);
        this.displayNotification(result, "header-gen");
      }
    }
  }

  /**
   * This event is emitted when the text document is first opened or when its content has changed.
   * @param change The opened/changed document
   */
  async onDidChangeContent(change: TextDocumentChangeEvent<TextDocument>) {
    await this.validateDocument(change.document);
  }

  private async validateDocument(textDocument: TextDocument): Promise<void> {
    if (isAppManifestFile(textDocument.uri) && settingsDisplayName) {
      const appManifest = this.parser.tryParseAppManifestFile(textDocument.getText());
      
      if (!appManifest) {
        return;
      }
      const appManifestPath = URI.parse(textDocument.uri).fsPath;
      const existingPartnerAppPaths = (await this.getDocumentSettings(textDocument.uri)).partnerApplicationPaths;
      const partnerAppsToUpdate = await partnerAppsToAddInSettings(appManifestPath, appManifest, existingPartnerAppPaths);
      if (Object.keys(partnerAppsToUpdate).length > 0) {
        this.connection.sendNotification(UPDATE_PARTNER_APPS_NOTIF, partnerAppsToUpdate);
        const partnerAppIds = Object.keys(partnerAppsToUpdate).filter(id => id != appManifest.ComponentId);
        const msg: ShowMessageParams = {
          message: `Partner applications ${partnerAppIds.join(", ")} detected, open their app_manifest.json ` 
            + `or add them to your ${settingsDisplayName} to enable cross-application conflict detection`,
          type: MessageType.Warning,
        };
        this.displayNotification(msg, "app-manifest");
      }
  
      await this.validateAppManifestDoc(textDocument, appManifest);
    }
  
    if (isHardwareDefinitionFile(textDocument.uri)) {
      await this.validateHardwareDefinitionDoc(textDocument);
    }
  }

  private async validateAppManifestDoc(textDocument: TextDocument, appManifest: AppManifest): Promise<void> {
    // NOTE: (DOBO) gets filled with obsolete app id's
    const settings = await this.getDocumentSettings(textDocument.uri);

    const CMakeListsPath = path.resolve(path.join(path.dirname(URI.parse(textDocument.uri).fsPath), "CMakeLists.txt"));
    const hwDefinitionPath = parseCommandsParams(CMakeListsPath, this.logger);
    if (!hwDefinitionPath) {
      return;
    }
    const hwDefinitionText: string = await this.getFileText(asURI(hwDefinitionPath));
    const hwDefinition = this.parser.tryParseHardwareDefinitionFile(hwDefinitionText, hwDefinitionPath, settings.SdkPath);
  
    if (!hwDefinition) {
      return;
    }
    const hwDefScan = scanHardwareDefinition(hwDefinition, true);
  
    const diagnostics: Diagnostic[] = [];
    for (const partner of appManifest.Capabilities.AllowedApplicationConnections ?? []) {
      if (settings.partnerApplicationPaths.has(partner)) {
        const partnerAppManifestPath = <string>settings.partnerApplicationPaths.get(partner);
        if (fs.existsSync(partnerAppManifestPath)) {
          const partnerCMakeListsPath = path.resolve(path.join(path.dirname(URI.parse(asURI(partnerAppManifestPath)).fsPath), "CMakeLists.txt"));
          const partnerHWDefinitionPath = parseCommandsParams(partnerCMakeListsPath, this.logger);
          if (!partnerHWDefinitionPath) {
            continue;
          }
          const partnerHWDefinitionText: string = await this.getFileText(asURI(partnerHWDefinitionPath));
          const partnerHWDefinition = this.parser.tryParseHardwareDefinitionFile(partnerHWDefinitionText, partnerHWDefinitionPath, settings.SdkPath);
        
          if (!partnerHWDefinition) {
            continue;
          }
          const partnerHWDefScan = scanHardwareDefinition(partnerHWDefinition, true);
          const partnerAppManifestText = await this.getFileText(asURI(partnerAppManifestPath));
          const partnerAppManifest = this.parser.tryParseAppManifestFile(partnerAppManifestText);
          
          if(partnerAppManifest){
            diagnostics.push(...validateAppPinConflict(hwDefScan, partnerHWDefScan, appManifest, partnerAppManifest));
          }
        } else {
          const partnerAppIdsRange = <Range>appManifest.Capabilities.allowedAppConnectionsRange();
          diagnostics.push(appManifestNotFound(partner, partnerAppManifestPath, settingsDisplayName, partnerAppIdsRange));
        }
      }
    }
    // Send the computed diagnostics to VSCode.
    this.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  }

  async validateHardwareDefinitionDoc(textDocument: TextDocument): Promise<HardwareDefinitionScan | undefined> {
    const settings = await this.getDocumentSettings(textDocument.uri);
  
    const hwDefinition = this.parser.tryParseHardwareDefinitionFile(textDocument.getText(), textDocument.uri, settings.SdkPath);
    if (!hwDefinition) {
      return;
    }
  
    const hwDefinitionScan = scanHardwareDefinition(hwDefinition, hasDiagnosticRelatedInformationCapability);
    
    const diagnostics: Diagnostic[] = [];
    diagnostics.push(...hwDefinitionScan.diagnostics);
    diagnostics.push(...findUnknownImports(hwDefinition, textDocument));
  
    // Send the computed diagnostics to VSCode.
    this.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  
    return hwDefinitionScan;
  }

  private async getFileText(uri: string): Promise<string> {
    let fileText = this.documents.get(uri)?.getText();
    if (!fileText) {
      fileText = await readFile(URI.parse(uri).fsPath, { encoding: "utf8" });
    }
    return fileText;
  }

  private static readonly NOTIF_TIMEOUT_MS = 10000;
  private timedOutNotifs = new Map<TimeoutKey, number>();
  /**
   * 
   * @param notification The notification to display
   * @param timeoutKey If set, the notification will not be displayed if another one with the same key was displayed recently
   */
  private displayNotification(notification: ShowMessageParams, timeoutKey?: TimeoutKey) {
    if (timeoutKey) {
      const currentTimeMs = Date.now();
      const lastNotified = this.timedOutNotifs.get(timeoutKey) ?? 0;
      const canNotify = (currentTimeMs - lastNotified) > LanguageServer.NOTIF_TIMEOUT_MS;
      if (canNotify) {
        this.timedOutNotifs.set(timeoutKey, currentTimeMs);      
        this.connection.sendNotification(ShowMessageNotification.type, notification);
      }
    } else {
      this.connection.sendNotification(ShowMessageNotification.type, notification);
    }
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
export interface ExtensionSettings {
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


const setSettingsName = (ide: string | undefined) => {
  if (ide && ide.includes("Visual Studio Code")) {
    settingsDisplayName = ".vscode/settings.json or .code-workspace";
  } else {
    settingsDisplayName = ".vs/VSWorkspaceSettings.json";
  }
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

/**
 * Unique key to identify notifications of the same kind that shouldn't be frequently displayed
 */
type TimeoutKey = "header-gen" | "app-manifest";

export function startLanguageServer(connection: Connection) {
  const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
  const languageServer = new LanguageServer(connection, documents, connection.console);

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
}
