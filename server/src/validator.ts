import {
	Diagnostic,
	integer,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { HardwareDefinition, PinMapping, toRange } from './hardwareDefinition';
import { Controller, CONTROLLERS } from './mt3620Controllers';
import { duplicateMappingWarning, duplicateNameError, indirectMappingWarning, invalidPinTypeError, nonexistentMappingError, pinBlockConflictWarning, unknownImportWarning } from "./diagnostics";

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
		const existingMapping = reservedNames.get(mapping.name.value.text);
		if (existingMapping) {
			const diagnostic: Diagnostic = duplicateNameError(mapping, hwDefinition.uri, existingMapping.pinMapping, existingMapping.hardwareDefinitionUri, includeRelatedInfo);
			warningDiagnostics.push(diagnostic);
		} else {
			if (!mapping.isRootMapping() && mapping.mapping) {
				const mappedTo = mapping.mapping.value.text;
				const mappedToPin = reservedNames.get(mappedTo);
				if (!mappedToPin) {
					const diagnostic: Diagnostic = nonexistentMappingError(mapping, mappedTo);
					warningDiagnostics.push(diagnostic);
				} else {
					const mappedToPath = mappedToPin.hardwareDefinitionUri;
					let hasIndirectImport = true;
					for (const importedHwDefinition of hwDefinition.imports) {
						if (mappedToPath == importedHwDefinition.uri) {
							hasIndirectImport = false;
						}
					}
					if (hasIndirectImport) {
						const diagnostic: Diagnostic = indirectMappingWarning(mappedTo, mapping.range, mappedToPath);
						warningDiagnostics.push(diagnostic);
					}
				}
			}
			reservedNames.set(mapping.name.value.text, { pinMapping: mapping, hardwareDefinitionUri: hwDefinition.uri });
		}
	}
	return warningDiagnostics;
}

function recursiveFindDuplicateNames(hwDefinition: HardwareDefinition, reservedNames: Map<string, ReservedPinMapping>): void {
	for (const importedHwDefinition of hwDefinition.imports) {
		recursiveFindDuplicateNames(importedHwDefinition, reservedNames);
	}
	for (const mapping of hwDefinition.pinMappings) {
		if (reservedNames.has(mapping.name.value.text)) {
			continue;
		}
		reservedNames.set(mapping.name.value.text, { pinMapping: mapping, hardwareDefinitionUri: hwDefinition.uri });
	}
}

export function findDuplicateMappings(hwDefinition: HardwareDefinition, text: string, textDocument: TextDocument, includeRelatedInfo: boolean): Diagnostic[] {
	const nodes: Map<string, [integer, integer, integer]> = new Map();

	const diagnostics: Diagnostic[] = [];
	for (const mapping of hwDefinition.pinMappings) {
		const mappedTo = mapping.mapping?.value.text;
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
			const badMappingRange = toRange(textDocument.getText(), mapStart, mapEnd);
			const existingMappingRange = toRange(textDocument.getText(), prevStart, prevEnd);
			const diagnostic: Diagnostic = duplicateMappingWarning(mappedTo, badMappingRange, existingMappingRange, hwDefinition.uri, includeRelatedInfo);
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
		const diagnostic = unknownImportWarning(unknownImport, toRange(textDocument.getText(), unknownImport.start, unknownImport.end));
		diagnostics.push(diagnostic);
	}
	return diagnostics;
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
		mapping = definition.pinMappings.find(_ => _.name.value.text == name);

		if (mapping != undefined)
			break;
	}

	if (mapping != undefined && definition != undefined) {
		if (mapping.appManifestValue != undefined) {
			return mapping.appManifestValue.value.text;
		}

		if (mapping.mapping != undefined) {
			return getAppManifestValue(mapping.mapping.value.text, definition.imports);
		}
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
		const appManifestValue = getAppManifestValue(pinMapping.name.value.text, [hwDefinition]);

		if (appManifestValue != undefined) {
			const controller = getController(pinMapping.type.value.text, appManifestValue);

			if (controller == undefined) {
				const diagnostic: Diagnostic = invalidPinTypeError(pinMapping, hwDefinition.uri, includeRelatedInfo);
				warningDiagnostics.push(diagnostic);
			} else {
				const existingControllerSetup = controllerSetup.get(controller.name);

				if (existingControllerSetup != undefined &&
					existingControllerSetup?.type.value.text != pinMapping.type.value.text) {
					const diagnostic: Diagnostic = pinBlockConflictWarning(pinMapping, existingControllerSetup, hwDefinition.uri, includeRelatedInfo);
					warningDiagnostics.push(diagnostic);
				}

				controllerSetup.set(controller.name, pinMapping);
			}
		}
	}

	return warningDiagnostics;
}
