import {
	Diagnostic,
	integer,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { HardwareDefinition, PinMapping, toRange } from './hardwareDefinition';
import { Controller, CONTROLLERS } from './mt3620Controllers';
import { duplicateMappingWarning, duplicateNameError, indirectMappingWarning, invalidPinTypeError, nonexistentMappingError, pinBlockConflictWarning, unknownImportWarning, appConflictPinBlock, appConflictDuplicateName } from "./diagnostics";
import { AppManifest } from "./applicationManifest";

const EXTENSION_SOURCE = 'az sphere';

interface FlatPinMapping {
	pinMapping: PinMapping,
	hardwareDefinitionUri: string
}

/**
 * Checks that the given Hardware Definition and its imports:
 * - Don't have pin mappings with duplicate names
 * - Don't have pin mappings which map to target mappings that don't exist
 * - Don't have indirectly imported pin mappings 
 * - Don't have multiple mappings to the same peripheral
 * @param hwDefinition The Hardware Definition to validate
 * @param includeRelatedInfo If the client IDE supports adding diagnostic related information
 * @returns Diagnostics with the Hardware Definition's underlying issues
 */
export function validateNamesAndMappings(hwDefinition: HardwareDefinition, includeRelatedInfo: boolean): Diagnostic[] {
	const warningDiagnostics: Diagnostic[] = [];
	const allPeripherals = flatten(hwDefinition);

	for (const currentPeripheral of hwDefinition.pinMappings) {
		const filteredByName = allPeripherals.filter(({ pinMapping }) => currentPeripheral.name.value.text == pinMapping.name.value.text);

		if (filteredByName.length > 1) {
			const conflictingNamePeripheral = filteredByName.find(flatPinMapping => flatPinMapping.pinMapping != currentPeripheral);

			if (conflictingNamePeripheral != undefined) {
				const diagnostic = duplicateNameError(
					currentPeripheral,
					hwDefinition.uri,
					conflictingNamePeripheral.pinMapping,
					conflictingNamePeripheral.hardwareDefinitionUri,
					includeRelatedInfo
				);

				warningDiagnostics.push(diagnostic);
			}
		}

		if (currentPeripheral.mapping != undefined) {
			const mappedPeripherals = allPeripherals.filter(({ pinMapping }) => currentPeripheral.mapping?.value.text == pinMapping.name.value.text);

			if (mappedPeripherals.length == 0) {
				const diagnostic = nonexistentMappingError(currentPeripheral);
				warningDiagnostics.push(diagnostic);
			} else if (mappedPeripherals.length == 1) {
				const firstLevelImports = hwDefinition.imports.map(({ uri }) => uri);
				const importedMappingUri = mappedPeripherals[0].hardwareDefinitionUri;

				if (importedMappingUri != hwDefinition.uri &&
					!firstLevelImports.includes(importedMappingUri)) {
					const diagnostic = indirectMappingWarning(
						currentPeripheral,
						mappedPeripherals[0].pinMapping,
						importedMappingUri,
						includeRelatedInfo
					);

					warningDiagnostics.push(diagnostic);
				}
			} else if (mappedPeripherals.length > 1) {
				// TODO: (DOBO) mapping to an imported peripheral with duplicate name exists
			}

			const filteredByMapping = allPeripherals.filter(({ pinMapping }) => currentPeripheral.mapping?.value.text == pinMapping.mapping?.value.text);

			if (filteredByMapping.length > 1) {
					const duplicate = filteredByMapping.find(({ pinMapping }) => currentPeripheral != pinMapping);

					if (duplicate != undefined) {
						const diagnostic = duplicateMappingWarning(currentPeripheral, duplicate.pinMapping, duplicate.hardwareDefinitionUri, includeRelatedInfo);
						warningDiagnostics.push(diagnostic);
					}
			}
		}
	}
	
	return warningDiagnostics;
}

/**
 * Flattens a hwDefinition tree, into an array of PinMappings.
 * 
 * F.e.
 * hw_def_1.json
 *   imports [ { hw_def_2.json } ]
 *   { peripheral_1 }
 *   { peripheral_2 }
 *
 * hw_def_2.json
 *   { peripheral_3 }
 *
 * becomes
 * [
 *   { peripheral_1, hw_def_1.json }
 *   { peripheral_2, hw_def_1.json }
 *   { peripheral_3, hw_def_2.json }
 * ]
 *  
 * @param hwDefinition Hardware Definition to flatten
 * @returns An array of all PinMappings reachable from the given hwDefinition, each linking to it's original HW definition
 */
function flatten(hwDefinition: HardwareDefinition): FlatPinMapping[] {
	const pins: FlatPinMapping[] = [];

	const flatPins: FlatPinMapping[] = hwDefinition.pinMappings.map(pinMapping => ({ pinMapping, hardwareDefinitionUri: hwDefinition.uri }));
	pins.push(...flatPins);
	
	hwDefinition.imports.forEach(hwDefImport => pins.push(...flatten(hwDefImport)));

	return pins;
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
export function getAppManifestValue(name: string, hwDefinitions: HardwareDefinition[]): number | string | undefined {
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

export const getController = memoize(_getController);

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


/**
 * Checks that the opening app_manifest file:
 * - Record all pin type and corresponding appManifest
 * - Record the partner pin conroller information for finding pin block conflict
 *
 * @param hwDefinition The Hardware Definition to validate
 * @param appManifest Record the information of opening app_manifest file
 * @param partnerAppManifest Record the information of partner app_manifest file
 * @returns Diagnostics with the app_manifest file underlying pin conflicts
 */
export const validateAppPinConflict = (hwDefinition: HardwareDefinition, appManifest: AppManifest, partnerAppManifest: AppManifest ): Diagnostic[] => {
	const warningDiagnostics: Diagnostic[] = [];

	const appManifestMap = appManifest.Capabilities.RecordMap;
	const partnerMap = partnerAppManifest.Capabilities.RecordMap;

	const partnerController: Map<string, {pinType: string, pinName: string}> = new Map();
	for(const [pinType, value] of partnerMap){
		const partnerPinNames = partnerMap.get(pinType)?.value.text as string[];
		const partnerAppManifestValues = findAppManifestValue(hwDefinition, partnerPinNames);

		for (let index = 0; index < partnerAppManifestValues.length; index++) {
			const controller = getController(pinType, partnerAppManifestValues[index]);
			partnerController.set(controller.name, {pinType: pinType, pinName: partnerPinNames[index]});
		}
	}

	for(const [pinType, value] of appManifestMap){
		if(partnerMap.has(pinType)){
			const partnerPinNames = partnerMap.get(pinType)?.value.text as string[];
			const appPinNames = value?.value.text as string[];
			const appManifestValues = findAppManifestValue(hwDefinition, appPinNames);
			const partnerAppManifestValues = findAppManifestValue(hwDefinition, partnerPinNames);

			for (let index = 0; index < appManifestValues.length; index++) {
				// find the pin conflict base on the pin block
				const controller = getController(pinType, appManifestValues[index]);
				const existingControllerSetup = partnerController.get(controller.name);
				if(existingControllerSetup?.pinType != undefined &&
					existingControllerSetup?.pinType != pinType){
					const range = value?.value.range;
					const diagnostic: Diagnostic = appConflictPinBlock(appPinNames[index], partnerAppManifest.ComponentId,range, existingControllerSetup);
					warningDiagnostics.push(diagnostic);
				}
				
				// find the pin conflic for duplicate name
				if(partnerAppManifestValues.includes(appManifestValues[index])){
					const range = value?.value.range;
					const diagnostic: Diagnostic = appConflictDuplicateName(appPinNames[index], partnerAppManifest.ComponentId,range);
					warningDiagnostics.push(diagnostic);
				}
			}
		}
	}
	return warningDiagnostics;
};

/**
 * Checks that the given Hardware Definition:
 * - Pin name is "$SAMPLE_LED_RED1" o remove the "$" or "PWM-CONTROLLER-0"
 * - Uses getAppManifestValue function to help find each pin's appmanifest value
 *
 * @param hwDefinition The Hardware Definition to find the appmanifest value
 * @param typeArray The pin array that needs to find the appmanifest value
 * @returns appmanifest value array for the pin array
 */
export function findAppManifestValue(hwDefinition: HardwareDefinition, typeArray: string[]): string[] {
  const result = [];
  if (typeArray) {
    for (const name of typeArray) {
      if (name.toString().includes("$")) {
        const pinName = name.replace('$', '');
        const appManifestValue = getAppManifestValue(pinName, [hwDefinition]);
        result.push(appManifestValue as string);
      } else {
        result.push(name);
      }
    }
  }
  return result;
}
