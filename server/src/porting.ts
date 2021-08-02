import { readFile, readdir } from "fs/promises";
import * as path from "path";
import { PinMapping } from "./hardwareDefinition";

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

export interface OdmHardwareDefinitionFile {
  name: string,
  path: string
}

/**
 * JSON representation of a Hardware Definition
 */
interface JsonHardwareDefinition {
  $schema: string | undefined,
  Metadata: {
    Type: string,
    Version: number
  },
  Description: {
    Name: string
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


function asJsonPinMapping(original: PinMapping): JsonPinMapping {
  return {
    Name: original.name.value.text,
    Type: original.type.value.text,
    Mapping: original.mapping?.value.text,
    AppManifestValue: original.appManifestValue?.value.text,
    Comment: original.comment?.value.text
  };
}