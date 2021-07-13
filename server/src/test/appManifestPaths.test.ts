import { addAppManifestPathsToSettings } from "../appManifestPaths";
import * as assert from "assert";
import * as mockfs from "mock-fs";
import * as path from "path";
import { rm } from "fs/promises";
import * as fs from "fs";
import * as jsonc from "jsonc-parser";
import { URI } from "vscode-uri";

const settingsPath = "my_app/.workplace/settings.json";
const app_manifestUri = URI.file(path.resolve("my_app/app_manifest.json"));

suite("addAppManifestPathsToSettings", async () => {
  const obj = {
    "my_app/.workplace/settings.json": `{
      "AzureSphere.partnerApplications": {
        "app-id-a": ${JSON.stringify(app_manifestUri.fsPath)},
        "app-id-b": "",
        "app-id-c": ""
      }`,

    "my_app/app_manifest.json": `{
      "ComponentId": "app-id-a",
      "Capabilities": {
        "Gpio": ["$TEMPLATE_LED"],
        "AllowedApplicationConnections": ["app-id-b", "app-id-c"]
      }
    }`,
  };

  setup(() => {
    mockfs(obj);
  });
  teardown(mockfs.restore);


  test("partnerApplications fully filled", async () => {
    const initialSettings = jsonc.parse(fs.readFileSync(settingsPath, { encoding: "utf8" }));
    const actualSettings = await getActualSettings();

    if (actualSettings) {
      assert.deepStrictEqual(actualSettings, initialSettings);
    } else {
      assert.fail(`settings.json was not the same`);
    }
  });

  test("Missing partnerApplications", async () => {
    const [initialSettings, settings] = getSettings();

    delete settings["AzureSphere.partnerApplications"];

    const actualSettings = await getActualSettings();

    if (actualSettings) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], initialSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json did not contain the property partnerApplications");
    }
  });

  test("Missing app_manifest ComponentId item", async () => {
    const [initialSettings, settings] = getSettings();

    // remove componentId entry
    delete settings["AzureSphere.partnerApplications"]["app-id-a"];

    const actualSettings = await getActualSettings();

    if (actualSettings["AzureSphere.partnerApplications"]) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], initialSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json did not contain the ComponentId path alongside its app_manifest.json path");
    }
  });

  test("Missing app_manifest ComponentId path", async () => {
    const [initialSettings, settings] = getSettings();

    // remove componentId entry
    delete settings["AzureSphere.partnerApplications"]["app-id-a"];

    const actualSettings = await getActualSettings();

    if (actualSettings["AzureSphere.partnerApplications"]) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], initialSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json missing app_manifest ComponentId path");
    }
  });

  test("Missing an AllowedApplicationConnections ComponentId key", async () => {
    const [initialSettings, settings] = getSettings();

    // remove AllowedApplicationConnections key
    delete settings["AzureSphere.partnerApplications"]["app-id-c"];

    const actualSettings = await getActualSettings();

    if (actualSettings["AzureSphere.partnerApplications"]) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], initialSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json did not contain all the AllowedApplicationConnections specified in the app_manifest");
    }
  });

  test("Handles non-existent settings file", async () => {
    const [expectedSettings, _] = getSettings();

    // delete settings file
    await rm(settingsPath);

    const actualSettings = await getActualSettings();

    if (actualSettings["AzureSphere.partnerApplications"]) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], expectedSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json did not contain all the AllowedApplicationConnections specified in the app_manifest");
    }
  });
});

function getSettings(): any[] {
  const initialSettings = jsonc.parse(fs.readFileSync(settingsPath, { encoding: "utf8" }));
  const settings = JSON.parse(JSON.stringify(initialSettings));

  return [initialSettings, settings];
}

async function getActualSettings(): Promise<any> {
  await addAppManifestPathsToSettings(app_manifestUri.toString(), path.resolve(settingsPath));
  return jsonc.parse(fs.readFileSync(settingsPath, { encoding: "utf8" }));
}
