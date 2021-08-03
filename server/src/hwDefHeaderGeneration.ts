import { exec } from "child_process";
import { MessageType, ShowMessageParams } from "vscode-languageserver";

/**
 *
 * @param uri The hardware defintion file uri
 * @param command The command provided by the test or the one to generate the HD header files
 * @returns The stdout if seccessuful or the err/stderr if the commands did not execute as expected
 */
export const hwDefinitionHeaderGen = async (uri: string, command?: string): Promise<ShowMessageParams | undefined> => {
  // Hardware Definition header generation
  return new Promise((resolve) => {
    exec(`${command || "azsphere hardware-definition generate-header --hardware-definition-file"} ${uri}`, (err, stdout, stderr) => {
      if (stderr) return resolve({ message: `Header file generation error (stderr): ${stderr}`, type: MessageType.Error });
      if (err) return resolve({ message: `Header file generation error: ${err.message}`, type: MessageType.Error });
      return resolve({ message: stdout, type: MessageType.Info });
    });
  });
};
