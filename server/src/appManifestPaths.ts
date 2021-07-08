import { readFile } from "fs/promises";
import * as fs from "fs";
import { URI } from "vscode-uri";
import * as jsonc from "jsonc-parser";

import { MessageType, ShowMessageRequest, ShowMessageRequestParams } from "vscode-languageserver/node";
import { connection, ide } from "./server";

export async function addAppManifestPathsToSettings(uri: string, settingsPath: string) {
  const app_manifestPath = URI.parse(uri).fsPath;
  const {
    ComponentId,
    Capabilities: { AllowedApplicationConnections },
  } = jsonc.parse(await readFile(app_manifestPath, "utf8"));

  // const { name } = returnIde();

  if (ComponentId && Array.isArray(AllowedApplicationConnections) && AllowedApplicationConnections.length && ide) {
    if (ide.name.includes("Visual Studio Code")) {
      settingsPath = ".vscode/settings.json";
    } else {
      settingsPath = ".vs/VSWorkspaceSettings.json";
    }

    const msg: ShowMessageRequestParams = {
      message: `Partner applications ${AllowedApplicationConnections.join(", ")} detected, please open their app_manifest.json`,
      type: MessageType.Warning,
    };
    connection.sendRequest(ShowMessageRequest.type, msg);

    const settingsTxt = await readFile(settingsPath, "utf8");
    const settings = jsonc.parse(settingsTxt);
    const applications: Record<string, unknown> = {};
    const partnerApplications = settings["AzureSphere.partnerApplications"];
    // add default application if !partnerApplications key, object with id as ComponentId doesn't exist, (ComponentId exists but path is not defined), path is defined but has changed
    if (!partnerApplications) {
      applications["AzureSphere.partnerApplications"] = { [ComponentId]: app_manifestPath };
    } else if (!partnerApplications[ComponentId] || !!partnerApplications.ComponentId || partnerApplications.ComponentId !== app_manifestPath) {
      applications[ComponentId] = app_manifestPath;
    }

    // add entries for each componentId in AllowedApplicationConnections, user will need to add path
    for (const id of AllowedApplicationConnections) {
      if (!applications[id]) {
        applications[id] = "";
      }
    }

    const edits = jsonc.modify(settingsTxt, ["AzureSphere.partnerApplications"], applications, { formattingOptions: { insertSpaces: true } });
    writeToJson(settingsPath, settingsTxt, edits);
  }
  return;
}

export function writeToJson(path: string, text: string, edits: jsonc.Edit[]): void {
  fs.writeFile(path, jsonc.applyEdits(text, edits), (err) => {
    if (err) throw err;
  });
  return;
}
