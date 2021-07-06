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

export function validatePinBlock(hwDefinition: HardwareDefinition, includeRelatedInfo: boolean) : Diagnostic[]{
	const warningDiagnostics: Diagnostic[] = [];
	const countMap: string[] = [];
	// create the pinBlock using Map
	// type information = {value: number; pin: string};
	let pinArray = [];
	const pinBlock: Map<string, Map<string, string[]>> = new Map();

	// create "PWM-CONTROLLER-0"
	pinArray = ["MT3620_GPIO0", "MT3620_GPIO1", "MT3620_GPIO2", "MT3620_GPIO3"];
	const pwm0PinBlock: Map<string, string[]> = new Map();
	pwm0PinBlock.set("gpio", pinArray);
	pinArray = ["MT3620_PWM_CONTROLLER0"];
	pwm0PinBlock.set("pwm", pinArray);
	pinBlock.set("PWM-CONTROLLER-0", pwm0PinBlock);

	// create "PWM-CONTROLLER-1"
	pinArray = ["MT3620_GPIO4", "MT3620_GPIO5", "MT3620_GPIO6", "MT3620_GPIO7"];
	const pwm1PinBlock: Map<string, string[]> = new Map();
	pwm1PinBlock.set("gpio", pinArray);
	pinArray = ["MT3620_PWM_CONTROLLER1"];
	pwm1PinBlock.set("pwm", pinArray);
	pinBlock.set("PWM-CONTROLLER-1", pwm1PinBlock);

	// create "PWM-CONTROLLER-2"
	pinArray = ["MT3620_GPIO8", "MT3620_GPIO9", "MT3620_GPIO10", "MT3620_GPIO11"];
	const pwm2PinBlock: Map<string, string[]> = new Map();
	pwm2PinBlock.set("gpio", pinArray);
	pinArray = ["MT3620_PWM_CONTROLLER2"];
	pwm2PinBlock.set("pwm", pinArray);
	pinBlock.set("PWM-CONTROLLER-2", pwm2PinBlock);

	// create "ISU0"
	pinArray = ["MT3620_GPIO26", "MT3620_GPIO27", "MT3620_GPIO28", "MT3620_GPIO29", "MT3620_GPIO30"];
	const isu0PinBlock: Map<string, string[]> = new Map();
	isu0PinBlock.set("gpio", pinArray);
	pinArray = ["MT3620_ISU0_I2C"];
	isu0PinBlock.set("i2cmaster", pinArray);
	pinArray = ["MT3620_ISU0_SPI"];
	isu0PinBlock.set("spimaster", pinArray);
	pinArray = ["MT3620_ISU0_UART"];
	isu0PinBlock.set("uart", pinArray);
	pinBlock.set("ISU0", isu0PinBlock);

	// create "ISU1"
	pinArray = ["MT3620_GPIO31", "MT3620_GPIO32", "MT3620_GPIO33", "MT3620_GPIO34", "MT3620_GPIO35"];
	const isu1PinBlock: Map<string, string[]> = new Map();
	isu1PinBlock.set("gpio", pinArray);
	pinArray = ["MT3620_ISU1_I2C"];
	isu1PinBlock.set("i2cmaster", pinArray);
	pinArray = ["MT3620_ISU1_SPI"];
	isu1PinBlock.set("spimaster", pinArray);
	pinArray = ["MT3620_ISU1_UART"];
	isu1PinBlock.set("uart", pinArray);
	pinBlock.set("ISU1", isu1PinBlock);

	// create "ISU2"
	pinArray = ["MT3620_GPIO35", "MT3620_GPIO36", "MT3620_GPIO37", "MT3620_GPIO38", "MT3620_GPIO39"];
	const isu2PinBlock: Map<string, string[]> = new Map();
	isu2PinBlock.set("gpio", pinArray);
	pinArray = ["MT3620_ISU2_I2C"];
	isu2PinBlock.set("i2cmaster", pinArray);
	pinArray = ["MT3620_ISU2_SPI"];
	isu2PinBlock.set("spimaster", pinArray);
	pinArray = ["MT3620_ISU2_UART"];
	isu2PinBlock.set("uart", pinArray);
	pinBlock.set("ISU2", isu2PinBlock);
	
	// create "ADC-CONTROLLER-0"
	pinArray = ["MT3620_GPIO41", "MT3620_GPIO42", "MT3620_GPIO43", "MT3620_GPIO44", "MT3620_GPIO45", "MT3620_GPIO46", "MT3620_GPIO47", "MT3620_GPIO48"];
	const adc0PinBlock: Map<string, string[]> = new Map();
	adc0PinBlock.set("gpio", pinArray);
	pinArray = ["MT3620_ADC_CONTROLLER0"];
	adc0PinBlock.set("int", pinArray);
	pinBlock.set("ADC-CONTROLLER-0", adc0PinBlock);

	// create "ISU3"
	pinArray = ["MT3620_GPIO66", "MT3620_GPIO67", "MT3620_GPIO68", "MT3620_GPIO69", "MT3620_GPIO70"];
	const isu3PinBlock: Map<string, string[]> = new Map();
	isu3PinBlock.set("gpio", pinArray);
	pinArray = ["MT3620_ISU3_I2C"];
	isu3PinBlock.set("i2cmaster", pinArray);
	pinArray = ["MT3620_ISU3_SPI"];
	isu3PinBlock.set("spimaster", pinArray);
	pinArray = ["MT3620_ISU3_UART"];
	isu3PinBlock.set("uart", pinArray);
	pinBlock.set("ISU3", isu3PinBlock);

	// create "ISU4"
	pinArray = ["MT3620_GPIO71", "MT3620_GPIO72", "MT3620_GPIO73", "MT3620_GPIO74", "MT3620_GPIO75"];
	const isu4PinBlock: Map<string, string[]> = new Map();
	isu4PinBlock.set("gpio", pinArray);
	pinArray = ["MT3620_ISU4_I2C"];
	isu4PinBlock.set("i2cmaster", pinArray);
	pinArray = ["MT3620_ISU4_SPI"];
	isu4PinBlock.set("spimaster", pinArray);
	pinArray = ["MT3620_ISU4_UART"];
	isu4PinBlock.set("uart", pinArray);
	pinBlock.set("ISU4", isu4PinBlock);

	// find the conflict
	for(const mapping of hwDefinition.pinMappings){
		if(hwDefinition.imports.length == 0){
			continue;
		}

		let temptHWDefinition = hwDefinition;
		const applicationName = mapping.name;
		let mappingTo = mapping.mapping;
		let appManifestValue = '';
		// find appManifestValue and set the used pin by transfering the import file
		while(temptHWDefinition.imports.length != 0){
			// query all import path
			for(const importedHwDefinition of temptHWDefinition.imports){
				const importMapping = importedHwDefinition.pinMappings;
				// query all mapping in the import json file
				for(const temptMapping of importMapping){
					if(temptMapping.name == mappingTo){
						mappingTo = temptMapping.mapping;
						if(mappingTo == undefined){
							appManifestValue = temptMapping.appManifestValue as string;
							// if it is allowed, record the pin that express it has been used
							if(pinBlock.has(appManifestValue)){
								const subPinBlock = pinBlock.get(appManifestValue);
								let determineFactors = 0;
								const recordBlock = [];
								if(subPinBlock){
									for(const [key,value] of subPinBlock){
										// Skip the own pin
										if(temptMapping.type.toLowerCase() == key){
											continue;
										}
										// Determine if other PINs are in use
										for(const pinValue of value){
											if(countMap.indexOf(pinValue) != -1){
												determineFactors = 1;
												recordBlock.push(pinValue);
											}
										}
									}
								}
								let blockMessage = "";
								for(const block of recordBlock){
									blockMessage += block.toString() + " ";
								}
								if(determineFactors == 1){
									const diagnostic: Diagnostic = {
										message: `${temptMapping.name} already configured as a Gpio by ${blockMessage} pin mapping`,
										range: mapping.range,
										severity: DiagnosticSeverity.Warning,
										source: EXTENSION_SOURCE
									};
									if (includeRelatedInfo) {
										diagnostic.relatedInformation = [
											{
												location: {
													uri: hwDefinition.uri,
													range: mapping.range
												},
												message: `Confilct Pin Block`
											}
										];
									}
									warningDiagnostics.push(diagnostic);
								}else{
									countMap.push(temptMapping.name);
								}
							}else{
								countMap.push(temptMapping.name);
							}
						}
						temptHWDefinition = importedHwDefinition;
					}
				}
			}
		}
	}
	console.log(countMap);
	return warningDiagnostics;
}