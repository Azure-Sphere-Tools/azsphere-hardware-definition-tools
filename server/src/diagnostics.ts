import { Diagnostic, DiagnosticSeverity, Position, Range } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { PinMapping, UnknownImport } from "./hardwareDefinition";

const EXTENSION_SOURCE = 'az sphere';

export const DiagnosticCode = {
  DUPLICATE_NAME:         "AST1",
  NONEXISTENT_MAPPING:    "AST2",
  DUPLICATE_MAPPING:      "AST3",
  INDIRECT_MAPPING:       "AST4",
  INVALID_PIN_TYPE:       "AST5",
  PIN_BLOCK_CONFLICT:     "AST6",
  INVALID_IMPORT:         "AST9",
  UNKNOWN_IMPORT:         "AST10",
  APP_PIN_BLOCK_CONFLICT: "AST11",
  APP_DUPLICATE_VALUE:    "AST12",
  APP_MANIFEST_NOT_FOUND: "AST13"
};

/**
 * 
 * @param badMapping The faulty pin mapping which uses the same name as another mapped pin
 * @param badMappingUri The uri of the hardware definition in which 'badMapping' is declared
 * @param existingMapping The pin mapping which used the pin name before 'badMapping' 
 * @param existingMappingUri The uri of the hardware definition in which 'existingMapping' is declared
 * @param includeRelatedInfo If the IDE supports the 'relatedInformation' property
 */
export function duplicateNameError(badMapping: PinMapping, badMappingUri: string, existingMapping: PinMapping, existingMappingUri: string, includeRelatedInfo: boolean): Diagnostic {
  const diagnostic: Diagnostic = {
    code: DiagnosticCode.DUPLICATE_NAME,
    message: `Peripheral name ${badMapping.name.value.text} is used multiple times.`,
    range: badMapping.name.value.range,
    severity: DiagnosticSeverity.Error,
    source: EXTENSION_SOURCE
  };
  if (includeRelatedInfo) {
    diagnostic.relatedInformation = [
      {
        location: {
          uri: existingMappingUri,
          range: existingMapping.name.value.range
        },
        message: `Duplicate peripheral name`
      }
    ];
  } else {
    const relatedInfoPosition = existingMapping.name.value.range.start;
    addRelatedInfoAsDiagnosticMessage(diagnostic, relatedInfoPosition, badMappingUri != existingMappingUri ? existingMappingUri : undefined);
  }
  return diagnostic;
}

/**
 * @param badMapping The pin mapping which maps to a pin that does not exist
 */
export function nonexistentMappingError(badMapping: PinMapping): Diagnostic {
  return {
    code: DiagnosticCode.NONEXISTENT_MAPPING,
    message: `Peripheral ${badMapping.mapping?.value.text} not found.`,
    range: badMapping.mapping?.value.range || badMapping.range,
    severity: DiagnosticSeverity.Error,
    source: EXTENSION_SOURCE
  };
}

/**
 * 
 * @param duplicateMapping1 First peripheral mapping to the same peripheral
 * @param duplicateMapping2 Second peripheral mapping to the same peripheral
 * @param duplicateUri The uri of the hardware definition in which second peripheral is declared
 * @param includeRelatedInfo If the IDE supports the 'relatedInformation' property
 */
export function duplicateMappingWarning(duplicateMapping1: PinMapping, duplicateMapping2: PinMapping, duplicateUri: string, includeRelatedInfo: boolean): Diagnostic {
  const diagnostic: Diagnostic = {
    code: DiagnosticCode.DUPLICATE_MAPPING,
    severity: DiagnosticSeverity.Warning,
    range: duplicateMapping1.mapping?.value.range || duplicateMapping1.range,
    message: `${duplicateMapping1.mapping?.value.text} is also mapped to ${duplicateMapping2.name.value.text}.`,
    source: EXTENSION_SOURCE
  };
  if (includeRelatedInfo) {
    diagnostic.relatedInformation = [
      {
        location: {
          uri: duplicateUri,
          range: duplicateMapping2.mapping?.value.range || duplicateMapping2.range
        },
        message: `Duplicate peripheral mapping`
      }
    ];
  } else {
    const relatedInfoPosition = duplicateMapping2.mapping 
      ? duplicateMapping2.mapping.value.range.start 
      : duplicateMapping2.range.start;
    addRelatedInfoAsDiagnosticMessage(diagnostic, relatedInfoPosition);
  }
  return diagnostic;
}

/**
 * 
 * @param badMapping The pin which maps to an indirectly imported peripheral
 * @param indirectMapping The indirectly imported pin
 * @param indirectMappingUri The uri of the hardware definition file in which the indirect pin mapping is declared
 * @param includeRelatedInfo If the IDE supports the 'relatedInformation' property
 */
export function indirectMappingWarning(badMapping: PinMapping, indirectMapping: PinMapping, indirectMappingUri: string, includeRelatedInfo: boolean): Diagnostic {
  const diagnostic: Diagnostic = {
    code: DiagnosticCode.INDIRECT_MAPPING,
    message: `${badMapping.mapping?.value.text} is indirectly imported from ${URI.parse(indirectMappingUri).fsPath}.`,
    range: badMapping.mapping?.value.range || badMapping.range,
    severity: DiagnosticSeverity.Warning,
    source: EXTENSION_SOURCE
  };
  if (includeRelatedInfo) {
    diagnostic.relatedInformation = [
      {
        location: {
          uri: indirectMappingUri,
          range: indirectMapping.range
        },
        message: `Indirect import`
      }
    ];
  } else {
    const relatedInfoPosition = indirectMapping.range.start;
    addRelatedInfoAsDiagnosticMessage(diagnostic, relatedInfoPosition, indirectMappingUri);
  }
  return diagnostic;
}

/**
 * 
 * @param pinMapping The pin mapping whose appManifestValue and type do not match
 */
export function invalidPinTypeError(pinMapping: PinMapping): Diagnostic {
  const diagnostic: Diagnostic = {
    code: DiagnosticCode.INVALID_PIN_TYPE,
    message: `${pinMapping.mapping != undefined ? pinMapping.mapping.value.text : pinMapping.appManifestValue?.value.text} cannot be used as ${pinMapping.type.value.text}`,
    range: pinMapping.range,
    severity: DiagnosticSeverity.Error,
    source: EXTENSION_SOURCE
  };
  return diagnostic;
}

/**
 * 
 * @param badMapping The pin mapping whose pin block is already configured as a different type by 'existingMapping'
 * @param existingMapping The pin mapping which already configured the shared pin block as a different type
 * @param hwDefinitionUri The uri of the hardware definition file in which the pin mappings are declared
 * @param includeRelatedInfo If the IDE supports the 'relatedInformation' property
 */
export function pinBlockConflictWarning(badMapping: PinMapping, existingMapping: PinMapping, hwDefinitionUri: string, includeRelatedInfo: boolean): Diagnostic {
  const diagnostic: Diagnostic = {
    code: DiagnosticCode.PIN_BLOCK_CONFLICT,
    message: `${badMapping.name.value.text} configured as ${existingMapping.type.value.text} by ${existingMapping.name.value.text}`,
    range: badMapping.range,
    severity: DiagnosticSeverity.Warning,
    source: EXTENSION_SOURCE
  };
  if (includeRelatedInfo) {
    diagnostic.relatedInformation = [
      {
        location: {
          uri: hwDefinitionUri,
          range: badMapping.range
        },
        message: `Pin block configured as ${existingMapping.type.value.text}`
      }
    ];
  } else {
    const relatedInfoPosition = existingMapping.range.start;
    addRelatedInfoAsDiagnosticMessage(diagnostic, relatedInfoPosition, hwDefinitionUri);
  }
  return diagnostic;
}

export function unknownImportWarning(unknownImport: UnknownImport) {
  return {
    code: DiagnosticCode.UNKNOWN_IMPORT,
    severity: DiagnosticSeverity.Warning,
    range: unknownImport.range,
    message: `Cannot find '${unknownImport.fileName}' under ${unknownImport.hwDefinitionFilePath} or ${unknownImport.sdkPath}.`,
    source: EXTENSION_SOURCE
  };
}

export function appConflictPinBlock(conflictPinName: string, partnerComponentId: string, range: Range, existingControllerSetup: {pinType: string, pinName: string}) {
  return{
    code: DiagnosticCode.APP_PIN_BLOCK_CONFLICT,
    message: `${conflictPinName} configured as ${existingControllerSetup?.pinType} by ${existingControllerSetup?.pinName} in partner app ${partnerComponentId}.`,
    range: range,
    severity: DiagnosticSeverity.Warning,
    source: EXTENSION_SOURCE
  };
}

export function appConflictDuplicateValue(conflictPinName: string, partnerComponentId: string, range: Range, existingPinName: string) {
  return{
    code: DiagnosticCode.APP_DUPLICATE_VALUE,
    message: `App manifest value of ${conflictPinName} is also declared in partner app ${partnerComponentId} through ${existingPinName}.`,
    range: range,
    severity: DiagnosticSeverity.Warning,
    source: EXTENSION_SOURCE
  };
}

export function appManifestNotFound(partnerId: string, partnerAppManifestPath: string, settingsName: string, range: Range) {
  return{
    code: DiagnosticCode.APP_MANIFEST_NOT_FOUND,
    message: `Could not find partner app ${partnerId} under path "${partnerAppManifestPath}".\n`
      + `Please check your ${settingsName} file to fix the path to the partner app manifest.`,
    range: range,
    severity: DiagnosticSeverity.Warning,
    source: EXTENSION_SOURCE
  };
}

export function invalidImport(range: Range, importedErrorUri: string, importedErrorRange: Range, includeRelatedInfo: boolean): Diagnostic {
  const diagnostic: Diagnostic = {
    code: DiagnosticCode.INVALID_IMPORT,
    message: `Imported hardware definition contains errors.`,
    range: range,
    severity: DiagnosticSeverity.Error,
    source: EXTENSION_SOURCE
  };
  if (includeRelatedInfo) {
    diagnostic.relatedInformation = [
      {
        location: {
          uri: importedErrorUri,
          range: importedErrorRange
        },
        message: `Imported error`
      }
    ];
  } else {
    const relatedInfoPosition = importedErrorRange.start;
    addRelatedInfoAsDiagnosticMessage(diagnostic, relatedInfoPosition, importedErrorUri);
  }
  return diagnostic;
}

/**
 * @param diagnostic Adds a diagnostic's related information directly in its message under the form (line x, char y)
 * - useful for IDEs that don't support a diagnostic's 'relatedInformation' property.
 * If the related information is in a different file than the diagnostic, "in {filepath}" is appended to the message 
 * @param relatedInfoPosition The position in the document that the related information would appear
 * @param relatedInfoUri The uri of the file containing the related information
 */
function addRelatedInfoAsDiagnosticMessage(diagnostic: Diagnostic, relatedInfoPosition: Position, relatedInfoUri?: string) {
  // line and char are incremented by 1 since we start counting lines from 1 in text files (not 0)
  diagnostic.message += ` (line ${relatedInfoPosition.line + 1}, char ${relatedInfoPosition.character + 1}`;
  if (relatedInfoUri != undefined) {
    // mention the related info's file uri if it wasn't defined in the current hw definition file  
    diagnostic.message += ` in ${URI.parse(relatedInfoUri).fsPath}`;
  }
  diagnostic.message += ')';
}
