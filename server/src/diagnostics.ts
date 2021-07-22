import { Diagnostic, DiagnosticSeverity, Position, Range } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { PinMapping, UnknownImport } from "./hardwareDefinition";

const EXTENSION_SOURCE = 'az sphere';

export const DUPLICATE_NAME_ERROR_CODE = "AST1";
export const NONEXISTENT_MAPPING_ERROR_CODE = "AST2";
export const DUPLICATE_MAPPING_WARNING_CODE = "AST3";
export const INDIRECT_MAPPING_WARNING_CODE = "AST4";
export const INVALID_PIN_TYPE_ERROR_CODE = "AST5";
export const PIN_BLOCK_CONFLICT_WARNING_CODE = "AST6";


export const UNKNOWN_IMPORT_WARNING_CODE = "AST10";
/**
 * 
 * @param badMapping The faulty pin mapping which uses the same name as another mapped pin
 * @param pinMappingUri The uri of the hardware definition in which 'badMapping' is declared
 * @param existingMapping The pin mapping which used the pin name before 'badMapping' 
 * @param existingMappingUri The uri of the hardware definition in which 'existingMapping' is declared
 * @param includeRelatedInfo If the IDE supports the 'relatedInformation' property
 */
export function duplicateNameError(badMapping: PinMapping, pinMappingUri: string, existingMapping: PinMapping, existingMappingUri: string, includeRelatedInfo: boolean): Diagnostic {
  const diagnostic: Diagnostic = {
    code: DUPLICATE_NAME_ERROR_CODE,
    message: `${badMapping.name} is already used by another pin mapping`,
    range: badMapping.range,
    severity: DiagnosticSeverity.Error,
    source: EXTENSION_SOURCE
  };
  if (includeRelatedInfo) {
    diagnostic.relatedInformation = [
      {
        location: {
          uri: existingMappingUri,
          range: existingMapping.range
        },
        message: `Duplicate peripheral mapping declared`
      }
    ];
  } else {
    const relatedInfoPosition = existingMapping.range.start;
    addRelatedInfoAsDiagnosticMessage(diagnostic, pinMappingUri, relatedInfoPosition, existingMappingUri);
  }
  return diagnostic;
}

/**
 * @param badMapping The pin mapping which maps to a pin that does not exist
 * @param nonexistentMappingName The name of the pin which does not exist
 */
export function nonexistentMappingError(badMapping: PinMapping, nonexistentMappingName: string): Diagnostic {
  return {
    code: NONEXISTENT_MAPPING_ERROR_CODE,
    message: `Mapping ${nonexistentMappingName} is invalid. There is no imported pin mapping with that name.`,
    range: badMapping.range,
    severity: DiagnosticSeverity.Error,
    source: EXTENSION_SOURCE
  };
}

/**
 * 
 * @param duplicateMappingName The name of the pin mapping which was already reserved by 'existingMapping'
 * @param badMappingRange The location of the pin mapping which maps to an already used mapping
 * @param existingMappingRange The location of  the pin mapping which reserved 'reservedMapping' first
 * @param hardwareDefinitionUri The uri of the hardware definition in which the pin mappings are declared
 * @param includeRelatedInfo If the IDE supports the 'relatedInformation' property
 */
export function duplicateMappingWarning(duplicateMappingName: string, badMappingRange: Range, existingMappingRange: Range, hardwareDefinitionUri: string, includeRelatedInfo: boolean): Diagnostic {
  const diagnostic: Diagnostic = {
    code: DUPLICATE_MAPPING_WARNING_CODE,
    severity: DiagnosticSeverity.Warning,
    range: badMappingRange,
    message: `"${duplicateMappingName}" is already mapped`,
    source: EXTENSION_SOURCE
  };
  if (includeRelatedInfo) {
    diagnostic.relatedInformation = [
      {
        location: {
          uri: hardwareDefinitionUri,
          range: existingMappingRange
        },
        message: `Duplicate peripheral mapping declared`
      }
    ];
  } else {
    const relatedInfoPosition = existingMappingRange.start;
    addRelatedInfoAsDiagnosticMessage(diagnostic, hardwareDefinitionUri, relatedInfoPosition, hardwareDefinitionUri);
  }
  return diagnostic;
}


/**
 * 
 * @param indirectMappingName The name of the pin mapping which is indirectly imported
 * @param badMappingRange The location of the pin mapping which references to the indirect mapping
 * @param indirectMappingUri The uri of the hardware definition file in which the indirect pin mapping is declared
 */
export function indirectMappingWarning(indirectMappingName: string, badMappingRange: Range, indirectMappingUri: string): Diagnostic {
  const diagnostic: Diagnostic = {
    code: INDIRECT_MAPPING_WARNING_CODE,
    message: `${indirectMappingName} is indirectly imported from ${URI.parse(indirectMappingUri).fsPath}.`,
    range: badMappingRange,
    severity: DiagnosticSeverity.Warning,
    source: EXTENSION_SOURCE
  };
  return diagnostic;
}


/**
 * 
 * @param pinMapping The pin mapping whose appManifestValue and type do not match
 * @param hwDefinitionUri The uri of the hardware definition in which the pin mapping is declared
 * @param includeRelatedInfo If the IDE supports the 'relatedInformation' property
 */
export function invalidPinTypeError(pinMapping: PinMapping, hwDefinitionUri: string, includeRelatedInfo: boolean): Diagnostic {
  const diagnostic: Diagnostic = {
    code: INVALID_PIN_TYPE_ERROR_CODE,
    message: `${pinMapping.mapping != undefined ? pinMapping.mapping : pinMapping.appManifestValue} cannot be used as ${pinMapping.type}`,
    range: pinMapping.range,
    severity: DiagnosticSeverity.Error,
    source: EXTENSION_SOURCE
  };
  if (includeRelatedInfo) {
    diagnostic.relatedInformation = [
      {
        location: {
          uri: hwDefinitionUri,
          range: pinMapping.range
        },
        message: `[TODO] Alternative options to be suggested here`
      }
    ];
  }
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
    code: PIN_BLOCK_CONFLICT_WARNING_CODE,
    message: `${badMapping.name} configured as ${existingMapping?.type} by ${existingMapping.name}`,
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
        message: `Pin block configured as ${existingMapping?.type}`
      }
    ];
  } else {
    const relatedInfoPosition = existingMapping.range.start;
    addRelatedInfoAsDiagnosticMessage(diagnostic, hwDefinitionUri, relatedInfoPosition, hwDefinitionUri);
  }
  return diagnostic;
}

export function unknownImportWarning(unknownImport: UnknownImport, unknownImportRange: Range) {
  return {
    code: UNKNOWN_IMPORT_WARNING_CODE,
    severity: DiagnosticSeverity.Warning,
    range: unknownImportRange,
    message: `Cannot find imported file '${unknownImport.fileName}' under ${unknownImport.hwDefinitionFilePath} or ${unknownImport.sdkPath}`,
    source: EXTENSION_SOURCE
  };
}

/**
 * @param diagnostic Adds a diagnostic's related information directly in its message under the form (line x, char y)
 * - useful for IDEs that don't support a diagnostic's 'relatedInformation' property.
 * If the related information is in a different file than the diagnostic, "in {filepath}" is appended to the message 
 * @param diagnosticUri The uri of the file where the diagnostic will appear 
 * @param relatedInfoPosition The position in the document that the related information would appear
 * @param relatedInfoUri The uri of the file containing the related information
 */
function addRelatedInfoAsDiagnosticMessage(diagnostic: Diagnostic, diagnosticUri: string, relatedInfoPosition: Position, relatedInfoUri: string) {
  // line and char are incremented by 1 since we start counting lines from 1 in text files (not 0)
  diagnostic.message += ` (line ${relatedInfoPosition.line + 1}, char ${relatedInfoPosition.character + 1}`;
  if (diagnosticUri != relatedInfoUri) {
    // mention the related info's file uri if it wasn't defined in the current hw definition file  
    diagnostic.message += ` in ${URI.file(relatedInfoUri).fsPath}`;
  }
  diagnostic.message += ')';
}