import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from "fs";

export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;

/**
 * Activates the ucl-ixn.vscode-extension-poc extension
 */
export async function activate(docUri: vscode.Uri) {
	// The extensionId is `publisher.name` from package.json
	const ext = vscode.extensions.getExtension('ucl-ixn.azsphere-hardware-definition-tools')!;
	await ext.activate();
	try {
		doc = await vscode.workspace.openTextDocument(docUri);
		editor = await vscode.window.showTextDocument(doc);
		await sleep(2000); // Wait for server activation
	} catch (e) {
		console.error(e);
	}
}

export async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export const getDocPath = (p: string) => {
	return path.resolve(__dirname, '../../../testFixture', p);
};
export const getDocUri = (p: string) => {
	return vscode.Uri.file(getDocPath(p));
};

export async function setTestContent(content: string): Promise<boolean> {
	const all = new vscode.Range(
		doc.positionAt(0),
		doc.positionAt(doc.getText().length)
	);
	return editor.edit(eb => eb.replace(all, content));
}

export function createFile(path: string, data: string) {
  fs.writeFile(getDocPath(path), data, function(err) {
    if (err) {
      return console.error(err);
    }
  });
}

export function removeFile(path: string) {
  fs.unlink(getDocPath(path), (err) => {
    if (err) {
      return console.error(err);
    }
  });
}
