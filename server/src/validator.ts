import {
	Diagnostic,
	DiagnosticSeverity,
	integer,
} from 'vscode-languageserver/node';

import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { HardwareDefinition, PinMapping, toRange } from './hardwareDefinition';
import { URI } from 'vscode-uri';
import { Controller, CONTROLLERS } from './mt3620Controllers';

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

/**
 * Memoize function
 *
 * @param fn Function to memoize
 * @returns Memoized function
 */
// eslint-disable-next-line @typescript-eslint/ban-types
function memoize(fn: Function): Function {
	const cache: Map<string, any> = new Map();

	return (...args: any) => {
		let toReturn = cache.get(args.join('-'));
		if (toReturn != undefined) {
			return toReturn;
		}

		toReturn = fn(...args);
		cache.set(args.join('-'), toReturn);

		return toReturn;
	};
}

/**
 * Get AppManifestValue for the mapping with the given name 
 * from the given list of Hardware Definitions and their imports
 * 
 * NOTE: (DOBO) String typed AppManifestValue allows for several ways of defining the same thing.
 *              F.e "(0)" and 0, perceived to be equal in C, will not be equal in TS.
 *
 * @param name The name of the mapping. (Peripherals.Name)
 * @param hwDefinitions A list of hardware definitions to look in. (Imports)
 * @returns AppManifestValue if mapping (directly or indirectly) leads to one, otherwise undefined
 */
function getAppManifestValue(name: string, hwDefinitions: HardwareDefinition[]): number | string | undefined {
	let mapping: PinMapping | undefined;
	let definition: HardwareDefinition | undefined;

	for (definition of hwDefinitions) {
		mapping = definition.pinMappings.find(_ => _.name == name);

		if (mapping != undefined)
			break;
	}

	if (mapping != undefined && definition != undefined) {
		return (mapping.appManifestValue != undefined)
			? mapping.appManifestValue
			: getAppManifestValue(mapping.mapping || "", definition.imports);
	}

	return undefined;
}

/**
 * Get the MT3620 Controller a mapping with the given type and appManifestValue is connected to
 *
 * @param type The type of the mapping. (Peripherals.Type)
 * @param appManifestValue AppManifestValue
 * @returns Controller, if mapping with the given type and appManifestValue exists, otherwise undefined
 */
function _getController(type: string, appManifestValue: number | string): Controller | undefined {
	type = type.toLowerCase();

	return CONTROLLERS.find(controller =>
		controller.values[type] != undefined && controller.values[type].includes(appManifestValue)
	);
}

const getController = memoize(_getController);

/**
 * Get the MT3620 Controller a mapping with the given type and appManifestValue is connected to
 *
 * @param type The type of the mapping. (Peripherals.Type)
 * @param appManifestValue AppManifestValue
 * @returns Controller, if mapping with the given type and appManifestValue exists, otherwise undefined
 */

/**
 * Checks that the given Hardware Definition:
 * - Uses valid peripheral types
 * - Doesn't define peripherals with conflicting types
 *
 * @param hwDefinition The Hardware Definition to validate
 * @param includeRelatedInfo If the client IDE supports adding diagnostic related information
 * @returns Diagnostics with the Hardware Definition's underlying pin block conflicts
 */
export function validatePinBlock(hwDefinition: HardwareDefinition, includeRelatedInfo: boolean): Diagnostic[] {
	const warningDiagnostics: Diagnostic[] = [];
	const controllerSetup: Map<string, PinMapping> = new Map();

	for (const pinMapping of hwDefinition.pinMappings) {
		const appManifestValue = getAppManifestValue(pinMapping.name, [hwDefinition]);

		if (appManifestValue != undefined) {
			const controller = getController(pinMapping.type, appManifestValue);

			if (controller == undefined) {
				const diagnostic: Diagnostic = {
					message: `${pinMapping.mapping != undefined ? pinMapping.mapping : pinMapping.appManifestValue} cannot be used as ${pinMapping.type}`,
					range: pinMapping.range,
					severity: DiagnosticSeverity.Warning,
					source: EXTENSION_SOURCE
				};
				if (includeRelatedInfo) {
					diagnostic.relatedInformation = [
						{
							location: {
								uri: hwDefinition.uri,
								range: pinMapping.range
							},
							message: `[TODO] Alternative options to be suggested here`
						}
					];
				}
				warningDiagnostics.push(diagnostic);
			} else {
				const existingControllerSetup = controllerSetup.get(controller.name);

				if (existingControllerSetup != undefined &&
					existingControllerSetup?.type != pinMapping.type) {
					const diagnostic: Diagnostic = {
						message: `${pinMapping.name} configured as ${existingControllerSetup?.type} by ${existingControllerSetup.name}`,
						range: pinMapping.range,
						severity: DiagnosticSeverity.Warning,
						source: EXTENSION_SOURCE
					};
					if (includeRelatedInfo) {
						diagnostic.relatedInformation = [
							{
								location: {
									uri: hwDefinition.uri,
									range: pinMapping.range
								},
								message: `[TODO] Alternative options to be suggested here`
							}
						];
					}
					warningDiagnostics.push(diagnostic);
				}

				controllerSetup.set(controller.name, pinMapping);
			}
		}
	}

	return warningDiagnostics;
}
