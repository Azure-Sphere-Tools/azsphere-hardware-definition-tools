import { exec } from "child_process";
import { MessageType, ShowMessageNotification } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { TextDocument } from "vscode-languageserver-textdocument";
import { connection, validateDocument } from "./server";



export const hwDefinitionHeaderGen = async(textDocument: TextDocument): Promise<string | undefined> => {
const validateHardwareDefinition = await validateDocument(textDocument);
    // Hardware Definition header generation
    if (validateHardwareDefinition) {
      const lol = URI.parse(validateHardwareDefinition).fsPath;
      exec(`azsphere hardware-definition generate-header --hardware-definition-file ${URI.parse(validateHardwareDefinition).fsPath}`, (err, stdout, stderr) => {
        if (err) {
          connection.sendNotification(ShowMessageNotification.type, { message: `Header file generation error: ${err.message}`, type: MessageType.Error });
          return err.message;
      } 
        if (stderr) { 
          connection.sendNotification(ShowMessageNotification.type, { message: `Header file generation stderr: ${stderr}`, type: MessageType.Error });
          return stderr;
        }

        if (stdout) { 
          connection.sendNotification(ShowMessageNotification.type, { message: stdout, type: MessageType.Info });
          return stdout;
        }
      });
    }
    return;
};