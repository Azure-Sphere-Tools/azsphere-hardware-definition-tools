import {
	Diagnostic,
	DiagnosticSeverity,
	integer,
} from 'vscode-languageserver/node';

import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { HardwareDefinition, PinMapping, toRange } from './hardwareDefinition';
import { URI } from 'vscode-uri';

const EXTENSION_SOURCE = 'az sphere';

interface ReservedPinMapping {
	pinMapping: PinMapping,
	hardwareDefinitionUri: string
}
/**
 * Checks that the given Hardware Definition and its imports:
 * - Don't have pin mappings with duplicate names
 * - Don't have pin mappings which map to target mappings that don't exist
 * @param hwDefinition The Hardware Definition to validate
 * @param includeRelatedInfo If the client IDE supports adding diagnostic related information
 * @returns Diagnostics with the Hardware Definition's underlying issues
 */
export function validateNamesAndMappings(hwDefinition: HardwareDefinition, includeRelatedInfo: boolean): Diagnostic[] {
	const warningDiagnostics: Diagnostic[] = [];
	const reservedNames: Map<string, ReservedPinMapping> = new Map();
	for (const importedHwDefinition of hwDefinition.imports) {
		recursiveFindDuplicateNames(importedHwDefinition, reservedNames);
	}
	for (const mapping of hwDefinition.pinMappings) {
		const existingMapping = reservedNames.get(mapping.name);
		if (existingMapping) {
			const diagnostic: Diagnostic = {
				message: `${mapping.name} is already used by another pin mapping`,
				range: mapping.range,
				severity: DiagnosticSeverity.Warning,
				source: EXTENSION_SOURCE
			};
			if (includeRelatedInfo) {
				diagnostic.relatedInformation = [
					{
						location: {
							uri: existingMapping.hardwareDefinitionUri,
							range: existingMapping.pinMapping.range
						},
						message: `Duplicate peripheral mapping declared`
					}
				];
			} else {
				const relatedInfoPosition = existingMapping.pinMapping.range.start;
				const relatedInfoUri = existingMapping.hardwareDefinitionUri;
				addRelatedInfoAsDiagnosticMessage(diagnostic, relatedInfoPosition, relatedInfoUri, hwDefinition.uri);
			}
			warningDiagnostics.push(diagnostic);
		} else {
			if (!mapping.isRootMapping()) {
				const mappedTo = <string>mapping.mapping;
				if (!reservedNames.has(mappedTo)) {
					const diagnostic: Diagnostic = {
						message: `Mapping ${mappedTo} is invalid. There is no imported pin mapping with that name.`,
						range: mapping.range,
						severity: DiagnosticSeverity.Warning,
						source: EXTENSION_SOURCE
					};
					warningDiagnostics.push(diagnostic);
				}
			}
			reservedNames.set(mapping.name, { pinMapping: mapping, hardwareDefinitionUri: hwDefinition.uri });
		}
	}
	return warningDiagnostics;
}

function recursiveFindDuplicateNames(hwDefinition: HardwareDefinition, reservedNames: Map<string, ReservedPinMapping>): void {
	for (const importedHwDefinition of hwDefinition.imports) {
		recursiveFindDuplicateNames(importedHwDefinition, reservedNames);
	}
	for (const mapping of hwDefinition.pinMappings) {
		if (reservedNames.has(mapping.name)) {
			continue;
		}
		reservedNames.set(mapping.name, { pinMapping: mapping, hardwareDefinitionUri: hwDefinition.uri });
	}
}

export function findDuplicateMappings(hwDefinition: HardwareDefinition, text: string, textDocument: TextDocument, includeRelatedInfo: boolean): Diagnostic[] {
	const nodes: Map<string, [integer, integer, integer]> = new Map();


	const diagnostics: Diagnostic[] = [];
	for (const mapping of hwDefinition.pinMappings) {
		const mappedTo = mapping.mapping;
		if (!mappedTo) {
			continue;
		}
		const mappedToRegex = new RegExp(`"Mapping"\\s*:\\s*"${mappedTo}"`, "g");

		let matchedPattern = mappedToRegex.exec(text);
		let mapStart = matchedPattern == null ? 0 : matchedPattern.index;
		let mapEnd = matchedPattern == null ? mapStart : mapStart + matchedPattern[0].length;

		if (nodes.has(mappedTo)) {
			const prevMapped = nodes.get(mappedTo);
			const prevStart = prevMapped == null ? 0 : prevMapped[0];
			const prevEnd = prevMapped == null ? 0 : prevMapped[1];
			const numDuplicates = prevMapped == null ? 0 : prevMapped[2] + 1;
			nodes.set(mappedTo, [mapStart, mapEnd, numDuplicates]);
			for (let i = 0; i < numDuplicates; i++) {
				matchedPattern = mappedToRegex.exec(text);

				mapStart = matchedPattern == null ? 0 : matchedPattern.index;
				mapEnd = matchedPattern == null ? mapStart : mapStart + matchedPattern[0].length;

			}
			const diagnostic: Diagnostic = {
				severity: DiagnosticSeverity.Warning,
				range: toRange(textDocument.getText(), mapStart, mapEnd),
				message: `"${mappedTo}" is already mapped`,
				source: EXTENSION_SOURCE
			};
			if (includeRelatedInfo) {
				diagnostic.relatedInformation = [
					{
						location: {
							uri: textDocument.uri,
							range: toRange(textDocument.getText(), prevStart, prevEnd)
						},
						message: `Duplicate peripheral mapping declared`
					}
				];
			} else {
				const relatedInfoPosition = toRange(textDocument.getText(), prevStart, prevEnd).start;
				addRelatedInfoAsDiagnosticMessage(diagnostic, relatedInfoPosition, textDocument.uri, hwDefinition.uri);
			}
			diagnostics.push(diagnostic);
		} else {
			nodes.set(mappedTo, [mapStart, mapEnd, 0]);
		}
	}
	return diagnostics;
}

export function findUnknownImports(hwDefinition: HardwareDefinition, textDocument: TextDocument): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	for (const unknownImport of hwDefinition.unknownImports) {
		diagnostics.push({
			severity: DiagnosticSeverity.Warning,
			range: toRange(textDocument.getText(), unknownImport.start, unknownImport.end),
			message: `Cannot find imported file '${unknownImport.fileName}' under ${unknownImport.hwDefinitionFilePath} or ${unknownImport.sdkPath}`,
			source: EXTENSION_SOURCE
		});
	}
	return diagnostics;
}

/**
 * 
 * @param diagnostic Adds a diagnostic's related information directly in its message under the form (line x, char y)
 * - useful for IDEs that don't support a diagnostic's 'relatedInformation' property.
 * If the related information is in a different file than the diagnostic, "in {filepath}" is appended to the message 
 * @param relatedInfoPosition The position in the document that the related information would appear
 * @param hwDefinitionUri The uri of the hardware definition file where the diagnostic will appear 
 * @param relatedInfoUri The uri of the file containing the related information
 */
function addRelatedInfoAsDiagnosticMessage(diagnostic: Diagnostic, relatedInfoPosition: Position, hwDefinitionUri: string, relatedInfoUri: string) {
	// line and char are incremented by 1 since we start counting lines from 1 in text files (not 0)
	diagnostic.message += ` (line ${relatedInfoPosition.line + 1}, char ${relatedInfoPosition.character + 1}`;
	if (hwDefinitionUri != relatedInfoUri) {
		// mention the related info's file uri if it wasn't defined in the current hw definition file  
		diagnostic.message += ` in ${URI.file(relatedInfoUri).fsPath}`;
	}
	diagnostic.message += ')';
}
