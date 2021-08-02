import { exec } from "child_process";
import { MessageType, ShowMessageNotification } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { TextDocument } from "vscode-languageserver-textdocument";
import { connection, validateDocument } from "./server";



export const hwDefinitionHeaderGen = async(textDocument: TextDocument) => {
const hwDefintionUri = await validateDocument(textDocument);

    // Hardware Definition header generation
    if (hwDefintionUri) {
      exec(`azsphere hardware-definition generate-header --hardware-definition-file ${URI.parse(hwDefintionUri).fsPath}`, (err, stdout, stderr) => {
        if (err) return connection.sendNotification(ShowMessageNotification.type, { message: `Header file generation error: ${err.message}`, type: MessageType.Error });
        if (stderr) return connection.sendNotification(ShowMessageNotification.type, { message: `Header file generation stderr: ${stderr}`, type: MessageType.Error });
        if (stdout) return connection.sendNotification(ShowMessageNotification.type, { message: stdout, type: MessageType.Info });
      });
    }
};