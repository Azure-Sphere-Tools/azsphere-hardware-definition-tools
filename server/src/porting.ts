import { readFile, readdir, writeFile } from "fs/promises";
import * as path from "path";
import { PinMapping } from "./hardwareDefinition";
import { HardwareDefinitionScan } from "./validator";

export async function listOdmHardwareDefinitions(sdkPath: string): Promise<OdmHardwareDefinitionFile[]> {
  const hwDefFolder = path.join(sdkPath, "HardwareDefinitions");
  const files = await readdir(hwDefFolder);
  const odmHwDefinitionFileNames = files.filter(f => f.endsWith(".json"));

  const odmHwDefsToReturn: OdmHardwareDefinitionFile[] = [];
  for (const f of odmHwDefinitionFileNames) {
    const pathToHwDef = path.join(hwDefFolder, f);
    const jsonHwDef = <JsonHardwareDefinition | undefined>JSON.parse(await readFile(pathToHwDef, { encoding: "utf8" }));
    if (jsonHwDef?.Description?.Name && jsonHwDef?.Metadata?.Type === "Azure Sphere Hardware Definition") {
      odmHwDefsToReturn.push({ name: jsonHwDef.Description.Name, path: pathToHwDef });
    }
  }
  return odmHwDefsToReturn;
}

// TODO Add tests
export function portHardwareDefinition(hwDefinition: JsonHardwareDefinition, hwDefinitionScan: HardwareDefinitionScan,
  targetHwDefinitionScan: HardwareDefinitionScan, pathToTargetHwDefFile: string): JsonHardwareDefinition {
  const generatedPeripherals: JsonPinMapping[] = [];
  for (const flatPinMapping of hwDefinitionScan.pinsInHardwareDefinition) {
    const generatedPinMapping = asJsonPinMapping(flatPinMapping.pinMapping);
    
    const mappedTo = flatPinMapping.pinMapping.mapping?.value.text;
    if (mappedTo) {
      const appManifestValueToQuery = hwDefinitionScan.getAppManifestValue(mappedTo);
      if (appManifestValueToQuery) {
        const newMappingValue = findPinNameWithAppManifestValue(appManifestValueToQuery, targetHwDefinitionScan);
        if (newMappingValue) {
          generatedPinMapping.Mapping = newMappingValue;
        }
        // TODO If can't find pin in target hw def with same app manifest value,
        // we should replace it with another pin of the same type (after we've tried to assign all other pins with their exact match)
      }
    }
    generatedPeripherals.push(generatedPinMapping);
  }

  return {
    $schema: "https://raw.githubusercontent.com/Azure-Sphere-Tools/hardware-definition-schema/master/hardware-definition-schema.json",
    Metadata: hwDefinition.Metadata,
    Description: { 
      Name: `Ported to support ${pathToTargetHwDefFile} - Created from ${hwDefinition.Description.Name}`,
      MainCoreHeaderFileTopContent: hwDefinition.Description.MainCoreHeaderFileTopContent
    },
    Imports: [{ Path: pathToTargetHwDefFile }],
    Peripherals: generatedPeripherals
  };

}

export async function saveHardwareDefinition(generatedHwDef: JsonHardwareDefinition, targetPath: string): Promise<void> {
  const hwDefAsString = JSON.stringify(generatedHwDef, undefined, 4);
  await writeFile(targetPath, hwDefAsString);
}


export interface OdmHardwareDefinitionFile {
  name: string,
  path: string
}

/**
 * JSON representation of a Hardware Definition
 */
export interface JsonHardwareDefinition {
  $schema: string | undefined,
  Metadata: {
    Type: string,
    Version: number
  },
  Description: {
    Name: string,
    MainCoreHeaderFileTopContent: string[] | undefined
  },
  Imports: JsonImport[] | undefined
  Peripherals: JsonPinMapping[],
}

interface JsonPinMapping {
  Name: string,
  Type: string,
  Mapping?: string,
  MainCoreHeaderValue?: string,
  AppManifestValue?: string | number,
  Comment?: string
}

interface JsonImport {
  Path: string
}

function findPinNameWithAppManifestValue(
  appManifestValueToQuery: string | number,
  targetHwDefinitionScan: HardwareDefinitionScan): string | undefined {
  for (const targetPin of targetHwDefinitionScan.pinsInHardwareDefinition) {
    const targetPinName = targetPin.pinMapping.name.value.text;
    const targetAppManifestValue = targetHwDefinitionScan.getAppManifestValue(targetPinName);
    if (targetAppManifestValue === appManifestValueToQuery) {
      return targetPinName;
    }
  }
  return undefined;
}

function asJsonPinMapping(original: PinMapping): JsonPinMapping {
  return {
    Name: original.name.value.text,
    Type: original.type.value.text,
    Mapping: original.mapping?.value.text,
    AppManifestValue: original.appManifestValue?.value.text,
    Comment: original.comment?.value.text
  };
}