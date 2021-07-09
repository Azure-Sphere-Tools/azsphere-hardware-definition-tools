import { addAppManifestPathsToSettings } from "../appManifestPaths";
import * as assert from "assert";
import * as mockfs from "mock-fs";
import * as path from "path";
import * as fs from "fs";
import * as jsonc from "jsonc-parser";

const settingsPath = "my_app/.workplace/settings.json";
const app_manifestPath = "my_app/app_manifest.json";

suite("addAppManifestPathsToSettings", async () => {
  const obj = {
    "my_app/.workplace/settings.json": `{
      "AzureSphere.partnerApplications": {
        "68eaeb66-86d9-4791-b160-d2b1045fe911":"c:\\my_app\\app_manifest.json",
        "68deaeb66-86d9-d34791-bw160-d3srdsds1045fe94y": "",
        "8eerdedd66-sd8dsdddd9-47d91-bh1d60-dd3dsde94y": "",
      }`,

    "my_app/app_manifest.json": `{
      ComponentId: "68eaeb66-86d9-4791-b160-d2b1045fe911",
      Capabilities: {
        Gpio: ["$TEMPLATE_LED"],
        AllowedApplicationConnections: ["68deaeb66-86d9-d34791-bw160-d3srdsds1045fe94c", "8eerded66-sd8dsdddd9-47d91-bh1d60-dd3dsde94c"],
      },
    }`,
  };

  setup(() => {
    teardown(mockfs.restore);
    mockfs(obj);
  });

  test("partnerApplications fully filled", () => {
    const initialSettings = jsonc.parse(fs.readFileSync(path.resolve(settingsPath), { encoding: "utf8" }));
    const actualSettings = getActualSettings();

    if (actualSettings) {
      assert.deepStrictEqual(actualSettings, initialSettings);
    } else {
      assert.fail(`settings.json was not the same`);
    }
  });

  test("Missing partnerApplications", () => {
    const [initialSettings, settings] = getSettings();

    delete settings["AzureSphere.partnerApplications"];

    const actualSettings = getActualSettings();

    if (actualSettings) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], initialSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json did not contain the property partnerApplications");
    }
  });

  test("Missing app_manifest ComponentId item", () => {
    const [initialSettings, settings] = getSettings();

    // remove componentId entry
    delete settings["AzureSphere.partnerApplications"]["68eaeb66-86d9-4791-b160-d2b1045fe911"];

    const actualSettings = getActualSettings();

    if (actualSettings["AzureSphere.partnerApplications"]) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], initialSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json did not contain the ComponentId path alongside its app_manifest.json path");
    }
  });

  test("Missing app_manifest ComponentId path", () => {
    const [initialSettings, settings] = getSettings();

    // remove componentId entry
    delete settings["AzureSphere.partnerApplications"]["68eaeb66-86d9-4791-b160-d2b1045fe911"];

    const actualSettings = getActualSettings();

    if (actualSettings["AzureSphere.partnerApplications"]) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], initialSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json missing app_manifest ComponentId path");
    }
  });

  test("Missing an AllowedApplicationConnections ComponentId key", () => {
    const [initialSettings, settings] = getSettings();

    // remove AllowedApplicationConnections key
    delete settings["AzureSphere.partnerApplications"]["8eerdedd66-sd8dsdddd9-47d91-bh1d60-dd3dsde94y"];

    const actualSettings = getActualSettings();

    if (actualSettings["AzureSphere.partnerApplications"]) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], initialSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json did not have containt all the AllowedApplicationConnections specified in the app_manifest");
    }
  });
});

function getSettings(): any[] {
  const initialSettings = jsonc.parse(fs.readFileSync(path.resolve(settingsPath), { encoding: "utf8" }));
  const settings = JSON.parse(JSON.stringify(initialSettings));

  return [initialSettings, settings];
}

function getActualSettings(): any {
  addAppManifestPathsToSettings(path.resolve(app_manifestPath), path.resolve(settingsPath));
  return jsonc.parse(fs.readFileSync(path.resolve(settingsPath), { encoding: "utf8" }));
}
