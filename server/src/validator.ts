import { Diagnostic } from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { HardwareDefinition, PinMapping, toRange } from './hardwareDefinition';
import { Controller, CONTROLLERS } from './mt3620Controllers';
import { duplicateMappingWarning, duplicateNameError, indirectMappingWarning, invalidPinTypeError, nonexistentMappingError, pinBlockConflictWarning, unknownImportWarning, appConflictPinBlock, appConflictDuplicateName } from "./diagnostics";
import { AppManifest } from "./applicationManifest";

export interface FlatPinMapping {
	pinMapping: PinMapping,
	resolvedAppManifestValue: string | number | undefined
	hardwareDefinitionUri: string
}

/**
 * Checks that the given Hardware Definition:
 * - Doesn't have pin mappings with duplicate names
 * - Doesn't have pin mappings which map to target mappings that don't exist
 * - Doesn't have indirectly imported pin mappings 
 * - Doesn't have multiple mappings to the same peripheral
 * @param hwDefinition The Hardware Definition to validate
 * @param allPeripherals Flattened pin mappings that are reachable from the given hardware definition, indexed by name
 * @param includeRelatedInfo If the client IDE supports adding diagnostic related information
 * @returns Diagnostics with the Hardware Definition's underlying issues
 */
 export function validateNamesAndMappings(hwDefinition: HardwareDefinition, allPeripherals: Map<string, FlatPinMapping[]>, includeRelatedInfo: boolean): Diagnostic[] {
	const pinDiagnostics: Diagnostic[] = [];

	for (const currentPeripheral of hwDefinition.pinMappings) {	
		const filteredByName = allPeripherals.get(currentPeripheral.name.value.text) ?? [];

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

				pinDiagnostics.push(diagnostic);
			}
		}

		if (currentPeripheral.mapping != undefined) {
			const mappedPeripherals = allPeripherals.get(currentPeripheral.mapping?.value.text) ?? [];

			if (mappedPeripherals.length == 0) {
				const diagnostic = nonexistentMappingError(currentPeripheral);
				pinDiagnostics.push(diagnostic);
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

					pinDiagnostics.push(diagnostic);
				}
			} else if (mappedPeripherals.length > 1) {
				// TODO: (DOBO) mapping to an imported peripheral with duplicate name exists
			}

			// find peripherals in current hardware definition which map to the same pin
			const currentHwDefUri = hwDefinition.uri;
			const filteredByMapping =  hwDefinition.pinMappings.filter((pinMapping) => currentPeripheral.mapping?.value.text == pinMapping.mapping?.value.text);

			if (filteredByMapping.length > 1) {
				const duplicate = filteredByMapping.find((pinMapping) => currentPeripheral != pinMapping);

				if (duplicate != undefined) {
					const diagnostic = duplicateMappingWarning(currentPeripheral, duplicate, currentHwDefUri, includeRelatedInfo);
					pinDiagnostics.push(diagnostic);
				}
			}
		}
	
	}
	return pinDiagnostics;
}

/**
 * Flattens a hwDefinition tree, into an array of PinMappings, with their app manifest values resolved.
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
 *   { peripheral_1, hw_def_1.json, app_manifest_val }
 *   { peripheral_2, hw_def_1.json, app_manifest_val }
 *   { peripheral_3, hw_def_2.json, app_manifest_val }
 * ]
 *  
 * @param hwDefinition Hardware Definition to flatten
 * @return All PinMappings reachable from the given hwDefinition, each linking to its original HW definition.
 * Also returns the pin mappings indexed by their names
 */
export function flatten(hwDefinition: HardwareDefinition): {flattened: FlatPinMapping[], indexedByName: Map<string, FlatPinMapping[]>} {
	const flatPinMappings: FlatPinMapping[] = [];
	const pinsIndexedByName = new Map<string, FlatPinMapping[]>();

	// add imported pins before pins in current hw def
	// so that we can lookup their app manifest values when resolving current pins' app manifest vals
	for (const importedDefinition of hwDefinition.imports) {
		const pinsFromImport = flatten(importedDefinition);
		flatPinMappings.push(...pinsFromImport.flattened);
		for (const [pinName, pinsForName] of pinsFromImport.indexedByName) {
			addToIndex(pinsIndexedByName, pinName, ...pinsForName);
		}
	}

	// add pins in current hardware definition
	for (const pinMapping of hwDefinition.pinMappings) {
		
		// get app manifest value
		const appManifestValue = tryResolveAppManifestValue(pinMapping, pinsIndexedByName);
		const flattenedPin = {
			hardwareDefinitionUri: hwDefinition.uri, 
			pinMapping: pinMapping, 
			resolvedAppManifestValue: appManifestValue
		};

		flatPinMappings.push(flattenedPin);
		addToIndex(pinsIndexedByName, pinMapping.name.value.text, flattenedPin);
	}
	return { flattened: flatPinMappings, indexedByName: pinsIndexedByName };
}

function addToIndex(pinsIndexedByName: Map<string, FlatPinMapping[]>, pinName: string, ...pinsWithName: FlatPinMapping[]) {
	if (pinsIndexedByName.has(pinName)) {
		pinsIndexedByName.get(pinName)?.push(...pinsWithName);
	} else {
		pinsIndexedByName.set(pinName, pinsWithName);
	}
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
 * Checks that the given peripherals in a Hardware Definition:
 * - Use valid peripheral types
 * - Don't define peripherals with conflicting types
 *
 * @param pinsToValidate The pins to validate that are directly defined in the hardware definition
 * @param controllerSetup The controller setup for the hardware definition. Maps pin blocks/controllers to the pins that have configured them.
 * After validation the controllerSetup will be configured based on the pinsToValidate. 
 * @param includeRelatedInfo If the client IDE supports adding diagnostic related information
 * @returns Diagnostics with the Hardware Definition's underlying pin block conflicts
 */
export function validatePinBlock(pinsToValidate: FlatPinMapping[], controllerSetup: Map<string, PinMapping>, hwDefinitionUri: string, includeRelatedInfo: boolean): Diagnostic[] {
	const warningDiagnostics: Diagnostic[] = [];

	for (const flatPinMapping of pinsToValidate) {
		const pinMapping = flatPinMapping.pinMapping;
		const appManifestValue = flatPinMapping.resolvedAppManifestValue;

		if (appManifestValue != undefined) {
			const controller = getController(pinMapping.type.value.text, appManifestValue);

			if (controller == undefined) {
				const diagnostic: Diagnostic = invalidPinTypeError(pinMapping, hwDefinitionUri, includeRelatedInfo);
				warningDiagnostics.push(diagnostic);
			} else {
				const existingControllerSetup = controllerSetup.get(controller.name);

				if (existingControllerSetup != undefined &&
					existingControllerSetup?.type.value.text != pinMapping.type.value.text) {
					const diagnostic: Diagnostic = pinBlockConflictWarning(pinMapping, existingControllerSetup, hwDefinitionUri, includeRelatedInfo);
					warningDiagnostics.push(diagnostic);
				} else {
					// add to controllerSetup if no other pin type has configured this pin block
					controllerSetup.set(controller.name, pinMapping);
				}
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
 * @param hwDefScan The scan of the Hardware Definition to validate
 * @param appManifest Record the information of opening app_manifest file
 * @param partnerAppManifest Record the information of partner app_manifest file
 * @returns Diagnostics with the app_manifest file underlying pin conflicts
 */
export const validateAppPinConflict = (hwDefScan: HardwareDefinitionScan, appManifest: AppManifest, partnerAppManifest: AppManifest ): Diagnostic[] => {
	const warningDiagnostics: Diagnostic[] = [];

	const appManifestMap = appManifest.Capabilities.RecordMap;
	const partnerMap = partnerAppManifest.Capabilities.RecordMap;

	const partnerController: Map<string, {pinType: string, pinName: string}> = new Map();
	for(const [pinType, value] of partnerMap){
		const partnerPinNames = partnerMap.get(pinType)?.value.text as string[];
		const partnerAppManifestValues = findAppManifestValue(hwDefScan, partnerPinNames);

		for (let index = 0; index < partnerAppManifestValues.length; index++) {
			const controller = getController(pinType, partnerAppManifestValues[index]);
			partnerController.set(controller.name, {pinType: pinType, pinName: partnerPinNames[index]});
		}
	}

	for(const [pinType, value] of appManifestMap){
		if(partnerMap.has(pinType)){
			const partnerPinNames = partnerMap.get(pinType)?.value.text as string[];
			const appPinNames = value?.value.text as string[];
			const appManifestValues = findAppManifestValue(hwDefScan, appPinNames);
			const partnerAppManifestValues = findAppManifestValue(hwDefScan, partnerPinNames);

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
 *
 * @param flatPinMappings The Hardware Definition Scan to find the appmanifest value
 * @param pinNames The pin array that needs to find the appmanifest value
 * @returns appmanifest value array for the pin array
 */
export function findAppManifestValue(hwDefScan: HardwareDefinitionScan, pinNames: string[]): string[] {
  const result = [];
  if (pinNames) {
    for (const name of pinNames) {
      if (name.toString().includes("$")) {
        const pinName = name.replace('$', '');
        const appManifestValue = hwDefScan.getAppManifestValue(pinName);
        result.push(appManifestValue as string);
      } else {
        result.push(name);
      }
    }
  }
  return result;
}


export class HardwareDefinitionScan {
	constructor(
		/**
		 * Pins that are directly declared in this hardware definition
		 */
		public pinsInHardwareDefinition: FlatPinMapping[],
		/**
		 * All pins that are reachable through this hardware definition, indexed by name
		 */
		public allPinMappings: Map<string, FlatPinMapping>,
		/**
		 * The controller configuration of this hardware definition
		 */
		public controllerSetup: Map<string, PinMapping>,
		/**
		 * Issues found in this hardware definition
		 */
		public diagnostics: Diagnostic[]
	) { }

	getFlatPinMapping(pinName: string): FlatPinMapping | undefined {
		return this.allPinMappings.get(pinName);
	}

	hasPinMappingWithName(pinName: string): boolean {
		return this.allPinMappings.has(pinName);
	}

	getAppManifestValue(pinName: string): string | number | undefined {
		return this.allPinMappings.get(pinName)?.resolvedAppManifestValue;
	}

	controllerConfiguredAsDifferentType(pinType: string, pinAppManifestValue: string | number) {
		const controller = getController(pinType, pinAppManifestValue);

		if (controller == undefined) {
			return false;
		} else {
			const existingControllerSetup = this.controllerSetup.get(controller.name);
			return existingControllerSetup != undefined &&	existingControllerSetup?.type.value.text != pinType;
		}
	}
}

export function scanHardwareDefinition(mainHardwareDefinition: HardwareDefinition, includeRelatedInfo: boolean): HardwareDefinitionScan {
	const controllerSetup: Map<string, PinMapping> = new Map();	

	// discover all available pins
	const flattenedAndIndexed = flatten(mainHardwareDefinition);
	const reachablePinMappings = flattenedAndIndexed.flattened;
	const indexedPinMappings = flattenedAndIndexed.indexedByName;
	
	const diagnostics: Diagnostic[] = [];
	
	diagnostics.push(...validateNamesAndMappings(mainHardwareDefinition, indexedPinMappings, includeRelatedInfo));
	
	const pinMappingsInCurrentHwDef = reachablePinMappings.filter(p => p.hardwareDefinitionUri === mainHardwareDefinition.uri);
	diagnostics.push(...validatePinBlock(pinMappingsInCurrentHwDef, controllerSetup, mainHardwareDefinition.uri, includeRelatedInfo));

	// drop duplicate names if they exist
	const allPinsWithoutDuplicates = new Map<string, FlatPinMapping>();
	for (const [pinName, pinsWithName] of indexedPinMappings) {
		allPinsWithoutDuplicates.set(pinName, pinsWithName[0]);
	}
	return new HardwareDefinitionScan(pinMappingsInCurrentHwDef, allPinsWithoutDuplicates, controllerSetup, diagnostics);
}

/**
 * Returns the app manifest value of the given pinMapping based on imported pin mappings.
 * If there are multiple imported pin mappings with the same name, the app manifest value is based on the 1st one found.
 * @param pinMapping The pin mapping for which we want to determine the app manifest value
 * @param importedPins The imported pins indexed by name that pinMapping might map to
 * @returns The app manifest value that pinMapping references, or undefined if not found
 */
function tryResolveAppManifestValue(pinMapping: PinMapping, importedPins: Map<string, FlatPinMapping[]>): string | number | undefined {
	const appManifestProperty = pinMapping.appManifestValue;
	if (appManifestProperty) {
		return appManifestProperty.value.text;
	} 

	const mappingProperty = pinMapping.mapping;
	if (mappingProperty) {
		const mappedTo = mappingProperty.value.text;
		const pinsWithMappedToName = importedPins.get(mappedTo);
		if (pinsWithMappedToName !== undefined) {
			// app manifest value is based on the first pin found with the given name.
			// In case of pin mappings with duplicate names (which is the exception), we ignore the others  
			const appManifestValue = pinsWithMappedToName[0].resolvedAppManifestValue;
			return appManifestValue;
		}
	}

	return undefined;
}
