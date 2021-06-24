import {
	Diagnostic,
	DiagnosticSeverity,
	integer,
	Range,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { HardwareDefinition } from './hardwareDefinition';

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
				range: toRange(textDocument, mapStart, mapEnd),
				message: `"${mappedTo}" is already mapped`,
				source: 'az sphere'
			};
			if (includeRelatedInfo) {
				diagnostic.relatedInformation = [
					{
						location: {
							uri: textDocument.uri,
							range: toRange(textDocument, prevStart, prevEnd)
						},
						message: `Duplicate peripheral mapping declared`
					}
				];
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
			range: toRange(textDocument, unknownImport.start, unknownImport.end),
			message: `Cannot find imported file '${unknownImport.fileName}' under ${unknownImport.hwDefinitionFilePath} or ${unknownImport.sdkPath}`,
			source: 'az sphere'
		});
	}
	return diagnostics;
}

function toRange(textDocument: TextDocument, prevStart: number, prevEnd: number): Range {
	return {
		start: textDocument.positionAt(prevStart),
		end: textDocument.positionAt(prevEnd)
	};
}
