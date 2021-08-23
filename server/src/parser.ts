import { AppManifest, AppPin, AppPinKey } from "./applicationManifest";
import * as jsonc from "jsonc-parser";
import { Logger } from "./utils";
import { computeLineOffsets, HardwareDefinition, Import, PinMapping, toRange, UnknownImport } from "./hardwareDefinition";
import { URI } from "vscode-uri";
import * as fs from "fs";
import * as path from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver";

export class Parser {
  constructor(
    /**
   * An optional document manager which caches opened files. The document manager is not managed by the Parser
   */
    private documents?: TextDocuments<TextDocument>,
    private logger: Logger = console
  ) { }

  tryParseHardwareDefinitionFile(hwDefinitionFileText: string, hwDefinitionFileUri: string, sdkPath: string): HardwareDefinition | undefined {
    try {
      const parseErrors: jsonc.ParseError[] = [];
  
      const hwDefinitionFileRootNode = jsonc.parseTree(hwDefinitionFileText, parseErrors);
  
      if (parseErrors.length > 0) {
        this.logger.warn("Encountered errors while parsing json file: ");
        parseErrors.forEach((e) => this.logger.warn(`${e.offset} to ${e.offset + e.length}: ${jsonc.printParseErrorCode(e.error)}`));
      }
      if (!hwDefinitionFileRootNode) {
        return;
      }
  
      const { Metadata, Imports, Peripherals, $schema } = jsonc.getNodeValue(hwDefinitionFileRootNode);
      const fileTypeFromMetadata = Metadata?.Type;
      if (fileTypeFromMetadata != "Azure Sphere Hardware Definition") {
        this.logger.log("File is not a Hardware Definition");
        return;
      }
  
      const unknownImports: UnknownImport[] = [];
      const validImports: Import[] = [];
      if (Array.isArray(Imports)) {
        const importsNode = jsonc.findNodeAtLocation(hwDefinitionFileRootNode, ["Imports"]) as jsonc.Node;
  
        for (let i = 0; i < Imports.length; i++) {
          const pathNode = importsNode["children"] ? importsNode.children[i] : undefined;
          if (pathNode == undefined) continue;

          const pathKeyVal = pathNode["children"] ? pathNode.children[0] : undefined;
          if (pathKeyVal == undefined) continue;

          const pathKey = pathKeyVal["children"] ? pathKeyVal.children[0] : undefined;
          if (pathKey == undefined) continue;

          const pathVal = pathKeyVal["children"] ? pathKeyVal.children[1] : undefined;
          if (pathVal == undefined) continue;

          if (typeof Imports[i].Path == "string") {
            const hwDefinitionFilePath = URI.parse(path.dirname(hwDefinitionFileUri)).fsPath;
            const fullPathToImportedFile = findFullPath(Imports[i].Path, hwDefinitionFilePath, sdkPath);
            if (fullPathToImportedFile) {
              const importedHwDefFileUri = URI.file(fullPathToImportedFile).toString();
              let importedHwDefFileText = this.documents?.get(importedHwDefFileUri)?.getText();
              if (!importedHwDefFileText) {
                importedHwDefFileText = fs.readFileSync(fullPathToImportedFile, { encoding: "utf8" });
              }
              if (importedHwDefFileText) {
                const importedHwDefinition = this.tryParseHardwareDefinitionFile(importedHwDefFileText, importedHwDefFileUri, sdkPath);
                if (importedHwDefinition) {
                  validImports.push({
                    hardwareDefinition: importedHwDefinition,
                    range: toRange(hwDefinitionFileText, pathNode.offset, pathNode.offset + pathNode.length),
                    key: {
                      text: pathKey.value,
                      range: toRange(hwDefinitionFileText, pathKey.offset, pathKey.offset + pathKey.length)
                    },
                    value: {
                      text: pathVal.value,
                      range: toRange(hwDefinitionFileText, pathVal.offset, pathVal.offset + pathVal.length)
                    }
                  });
                }
              }
            } else {
              const importsNodeStart = pathNode.offset;
              const importsNodeEnd = importsNodeStart + pathNode.length;

              unknownImports.push({
                fileName: Imports[i].Path,
                hwDefinitionFilePath: hwDefinitionFilePath,
                sdkPath: sdkPath,
                range: toRange(hwDefinitionFileText, importsNodeStart, importsNodeEnd)
              });
            }
          }
        }
      }
      const pinMappings: PinMapping[] = [];
      const lineOffsets = computeLineOffsets(hwDefinitionFileText, true);
      for (let i = 0; i < Peripherals.length; i++) {
        const { Name, Type, Mapping, AppManifestValue } = Peripherals[i];
        const hasMappingOrAppManifestValue = typeof Mapping == "string" || typeof AppManifestValue == "string" || typeof AppManifestValue == "number";
        const isPinMapping = typeof Name == "string" && typeof Type == "string" && hasMappingOrAppManifestValue;
  
        if (isPinMapping) {
          const mappingAsJsonNode = <jsonc.Node>jsonc.findNodeAtLocation(hwDefinitionFileRootNode, ["Peripherals", i]);
  
          const values: Map<string, any> = new Map();
          const range = toRange(hwDefinitionFileText, mappingAsJsonNode.offset, mappingAsJsonNode.offset + mappingAsJsonNode.length, lineOffsets);
  
          for (const keyValue of mappingAsJsonNode.children ?? []) {
            if (keyValue.children) {
              values.set(keyValue.children[0].value.toLowerCase(), {
                range: toRange(hwDefinitionFileText, keyValue.offset, keyValue.offset + keyValue.length, lineOffsets),
                key: {
                  range: toRange(hwDefinitionFileText, keyValue.children[0].offset, keyValue.children[0].offset + keyValue.children[0].length, lineOffsets),
                  text: keyValue.children[0].value,
                },
                value: {
                  range: toRange(hwDefinitionFileText, keyValue.children[1].offset, keyValue.children[1].offset + keyValue.children[1].length, lineOffsets),
                  text: keyValue.children[1].value,
                },
              });
            }
          }
  
          pinMappings.push(new PinMapping(range, values.get("name"), values.get("type"), values.get("mapping"), values.get("appmanifestvalue"), values.get("comment")));
        }
      }

      const sdkDefined = URI.parse(hwDefinitionFileUri).path.startsWith(sdkPath);
  
      return new HardwareDefinition(hwDefinitionFileUri, sdkDefined, $schema, pinMappings, validImports, unknownImports);
    } catch (error) {
      this.logger.log("Cannot parse Hardware Definition file as JSON");
      return;
    }
  }

  tryParseAppManifestFile(AppManifestFileText: string): AppManifest | undefined {
    try {
      const parseErrors: jsonc.ParseError[] = [];
  
      const AppManifestFileRootNode = jsonc.parseTree(AppManifestFileText, parseErrors);
  
      if (parseErrors.length > 0) {
        this.logger.warn("Encountered errors while parsing json file: ");
        parseErrors.forEach((e) => this.logger.warn(`${e.offset} to ${e.offset + e.length}: ${jsonc.printParseErrorCode(e.error)}`));
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
  
      const values = new Map<string, AppPinKey<any>>();
      const lineOffsets = computeLineOffsets(AppManifestFileText, true);
      CapabilitiesAsJsonNode.children?.forEach((keyValue) => {
        if (keyValue.children && keyValue.children.length >= 2) {
          values.set(keyValue.children[0].value, {
            range: toRange(AppManifestFileText, keyValue.offset, keyValue.offset + keyValue.length, lineOffsets),
            key: {
              range: toRange(AppManifestFileText, keyValue.children[0].offset, keyValue.children[0].offset + keyValue.children[0].length, lineOffsets),
              text: keyValue.children[0].value,
            },
            value: {
              range: toRange(AppManifestFileText, keyValue.children[1].offset, keyValue.children[1].offset + keyValue.children[1].length, lineOffsets),
              text: temptValue.get(keyValue.children[0].value),
            }
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
      this.logger.log("Cannot parse application manifest file as JSON");
      return;
    }
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