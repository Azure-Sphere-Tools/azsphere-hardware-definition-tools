import { readFile, readdir, writeFile } from "fs/promises";
import * as path from "path";
import { Range } from "vscode-languageserver-textdocument";
import { HardwareDefinition, Import, PinMapping, PinMappingKey } from "./hardwareDefinition";
import { getPinMappingSuggestions } from "./suggestions";
import { HW_DEFINITION_SCHEMA_URL } from "./utils";
import { HardwareDefinitionScan, scanHardwareDefinition } from "./validator";

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

export function portHardwareDefinition(
  jsonHwDefinition: JsonHardwareDefinition, 
  hwDefinition: HardwareDefinition,
  targetHwDefinition: HardwareDefinition, 
  pathToTargetHwDefFile: string): JsonHardwareDefinition {
  const hwDefinitionScan = scanHardwareDefinition(hwDefinition, true);
  const targetHwDefinitionScan = scanHardwareDefinition(targetHwDefinition, true);

  const generatedPeripherals: PinMapping[] = [];
  const namesOfPinsWithoutExactMatch = new Set<string>();
  for (const flatPinMapping of hwDefinitionScan.pinsInHardwareDefinition) {
    // make a deep copy of the pin so we can safely edit it
    const generatedPinMapping = copyPinMapping(flatPinMapping.pinMapping);

    const mappedTo = flatPinMapping.pinMapping.mapping?.value.text;
    if (mappedTo && generatedPinMapping.mapping) {
      const appManifestValueToQuery = hwDefinitionScan.getAppManifestValue(mappedTo);
      if (appManifestValueToQuery !== undefined) {
        const newMappingValue = findPinNameWithAppManifestValue(appManifestValueToQuery, targetHwDefinitionScan);
        if (newMappingValue) {
          // found a pin in the target hw def with the same app manifest value
          generatedPinMapping.mapping.value.text = newMappingValue;
        } else {
          // couldn't find a pin in the target hw def with the same app manifest value, mark it for editing later
          namesOfPinsWithoutExactMatch.add(generatedPinMapping.name.value.text);
        }
      }
    }
    generatedPeripherals.push(generatedPinMapping);
  }
  
  const targetImport: Import = {
    hardwareDefinition: targetHwDefinition,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 }},
    key: {
      text: "Path",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 }}
    },
    value: {
      text: targetHwDefinition.uri,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 }}
    }
  };

  const generatedHwDefinition = new HardwareDefinition("not_needed", false, undefined, generatedPeripherals, [targetImport]);

  if (namesOfPinsWithoutExactMatch.size > 0) {
    replacePinsWithoutExactMatch(generatedHwDefinition, namesOfPinsWithoutExactMatch);
  }

  return {
    $schema: HW_DEFINITION_SCHEMA_URL,
    Metadata: jsonHwDefinition.Metadata,
    Description: {
      Name: `Ported to support ${pathToTargetHwDefFile} - Created from ${jsonHwDefinition.Description.Name}`,
      MainCoreHeaderFileTopContent: jsonHwDefinition.Description.MainCoreHeaderFileTopContent
    },
    Imports: [{ Path: pathToTargetHwDefFile }],
    Peripherals: generatedHwDefinition.pinMappings.map(p => asJsonPinMapping(p))
  };
}

/**
 * Edits the passed hardware definition and replaces the "Mapping" values of pins that did not have an exact match.
 * @param generatedHwDefinition The generated Hardware Definition to edit
 * @param namesOfPinsWithoutExactMatch Names of generated peripherals for which we couldn't find an imported pin with the same app manifest value 
 */
function replacePinsWithoutExactMatch(generatedHwDefinition: HardwareDefinition, namesOfPinsWithoutExactMatch: Set<string>) {
  for (const pin of generatedHwDefinition.pinMappings) {
    if (namesOfPinsWithoutExactMatch.has(pin.name.value.text)) {
      const alternativePins = getPinMappingSuggestions(generatedHwDefinition, pin.type.value.text);
      if (alternativePins.length > 0) {
        (<PinMappingKey<string>>pin.mapping).value.text = alternativePins[0];
      }
    }
  }
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

/**
 * Creates a deep copy of the given pin mapping
 */
function copyPinMapping(original: PinMapping): PinMapping {
  return new PinMapping(
    copyRange(original.range),
    copyKey(original.name),
    copyKey(original.type),
    original.mapping ? copyKey(original.mapping) : undefined,
    original.appManifestValue ? copyKey(original.appManifestValue) : undefined,
    original.comment ? copyKey(original.comment) : undefined
  );
}

function copyKey<T>(o: PinMappingKey<T>): PinMappingKey<T> {
  return {
    range: copyRange(o.range),
    key: {
      range: copyRange(o.key.range),
      text: o.key.text,
    },
    value: {
      range: copyRange(o.value.range),
      text: o.value.text
    }
  };
}

function copyRange(o: Range): Range {
  return {
    start: { line: o.start.line, character: o.start.character },
    end: { line: o.end.line, character: o.end.character },
  };
}