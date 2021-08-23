import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from "fs";

export const WORKING_DIR = path.resolve(__dirname, "../../testWorkingDir");


/**
 * Activates the extension and opens/shows the given document
 */
export async function activate(docUri: vscode.Uri) {
	// The extensionId is `publisher.name` from package.json
	const ext = vscode.extensions.getExtension('ucl-ixn.azsphere-hardware-definition-tools')!;
	await ext.activate();
	try {
		const doc = await vscode.workspace.openTextDocument(docUri);
		await vscode.window.showTextDocument(doc);
		await sleep(2000); // Wait for server activation
	} catch (e) {
		console.error(e);
	}
}

export async function positionInDoc(textToFind: string, docUri: vscode.Uri): Promise<vscode.Position> {
	const openedDoc = await vscode.workspace.openTextDocument(docUri);
	return openedDoc.positionAt(openedDoc.getText().indexOf(textToFind));
}

export async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export const getDocPath = (p: string) => {
	return path.resolve(WORKING_DIR, p);
};
export const getDocUri = (p: string) => {
	return vscode.Uri.file(getDocPath(p));
};

/**
 * Creates a file under the "working directory" for the test
 * @param relativePath Path to the file relative to the test "working directory"
 * @param content Content of the file to create
 */
 export function createFile(relativePath: string, content: string) {
	const fullPath = getDocPath(relativePath);
	fs.mkdirSync(path.dirname(fullPath), {recursive: true});
  fs.writeFileSync(fullPath, content);
}

export async function getFileText(relativePath: string): Promise<string> {
	const docUri = getDocUri(relativePath);
	const docToRead = await vscode.workspace.openTextDocument(docUri);
	return docToRead.getText();
}

export async function clearWorkingDir(): Promise<void> {
	await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	
	const deleteRecursive = (dir) => {
		const files = fs.readdirSync(dir).map(file => path.resolve(dir, file));
		for (const fileOrDir of files) {
			if (fs.statSync(fileOrDir).isFile()) {
				fs.unlinkSync(fileOrDir);
			} else {
				deleteRecursive(fileOrDir);
				fs.rmdirSync(fileOrDir);
			}
		}

	};
	deleteRecursive(WORKING_DIR);
}

export async function writeText(textToWrite: string): Promise<void> {
	// need to use clipboard paste command to write to quickpick through vscode API
	const prevClipboardValue = await vscode.env.clipboard.readText();
	await vscode.env.clipboard.writeText(textToWrite);
	await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
	await vscode.env.clipboard.writeText(prevClipboardValue);
}