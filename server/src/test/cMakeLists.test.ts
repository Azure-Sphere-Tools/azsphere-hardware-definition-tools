import { parseCommandsParams, getCacheTxt, getMostRecentFile, orderReccentFiles } from "../cMakeLists";
import * as assert from "assert";
import * as mockfs from "mock-fs";
import * as path from "path";

suite("CMakeLists Infer", () => {
  const cacheTxt = `#######################
  # EXTERNAL cache entries
  #######################
  //VarA comment
  VAR_A:STRING=HardwareDefinitions/mt3620_rdb
  //VarB comment
  VAR_B:STRING=template_appliance.json`;

  const obj = {
    "my_app/CMakeListsBothStrings.txt": `azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "HardwareDefinitions/mt3620_rdb" TARGET_DEFINITION "template_appliance.json")`,
    "my_app/CMakeListsBothVars.txt": `azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "\${VAR_A}" TARGET_DEFINITION "\${VAR_B}"`,
    "my_app/CMakeListsDirStringDefVar.txt": `azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "HardwareDefinitions/mt3620_rdb" TARGET_DEFINITION "\${VAR_B}")`,
    "my_app/CMakeListsDirVarDefString.txt": `azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "\${VAR_A}" TARGET_DEFINITION "template_appliance.json")`,

    "my_app/out/a/CMakeCache.txt": cacheTxt,
    "my_app/out/a/b/CMakeCache.txt": cacheTxt,

    "my_app/HardwareDefinitions/mt3620_rdb/template_appliance.json": "file_content",
  };
  setup(() => {
    mockfs(obj);
  });
  teardown(mockfs.restore);

  test("Azuresphere Target Hardware Definition specified in CMakeLists", () => {
    const CMakeListsBothStrings: string | undefined = parseCommandsParams(path.resolve("my_app/CMakeListsBothStrings.txt"));
    const CMakeListsBothVars: string | undefined = parseCommandsParams(path.resolve("my_app/CMakeListsBothVars.txt"));
    const CMakeListsDirStringDefVar: string | undefined = parseCommandsParams(path.resolve("my_app/CMakeListsDirStringDefVar.txt"));
    const CMakeListsDirVarDefString: string | undefined = parseCommandsParams(path.resolve("my_app/CMakeListsDirVarDefString.txt"));

    const expectedPath = "my_app/HardwareDefinitions/mt3620_rdb/template_appliance.json";

    CMakeListsBothStrings ? assert.strictEqual(path.resolve(CMakeListsBothStrings), path.resolve(expectedPath)) : assert.fail(`Path was undefined`);
    CMakeListsBothVars ? assert.strictEqual(path.resolve(CMakeListsBothVars), path.resolve(expectedPath)) : assert.fail(`Path was undefined`);
    CMakeListsDirStringDefVar ? assert.strictEqual(path.resolve(CMakeListsDirStringDefVar), path.resolve(expectedPath)) : assert.fail(`Path was undefined`);
    CMakeListsDirVarDefString ? assert.strictEqual(path.resolve(CMakeListsDirVarDefString), path.resolve(expectedPath)) : assert.fail(`Path was undefined`);
  });

  test("Get CMakeLists cache text", () => {
    const actualCacheTxt: string | undefined = getCacheTxt("my_app/CMakeListsDirStringDefVar.txt");
    actualCacheTxt ? assert.strictEqual(actualCacheTxt, cacheTxt) : assert.fail(`Failed to read CMakeLists cache`);
  });

  test("Returns undefined if no CMakeCache.txt is found", () => {
    const actualCacheTxt = getCacheTxt("my_app/random/path/withNoCache/CMakeCache.txt");
    console.log(actualCacheTxt);
    !actualCacheTxt ? assert.strictEqual(actualCacheTxt, undefined) : assert.fail(`getCacheTxt() did not return undefined`);
  });

  test("Get all CMakeLists cache text under /out/", () => {
    const actualFiles = orderReccentFiles("my_app/CMakeListsDirStringDefVar.txt");
    // There should be 2 caches
    actualFiles ? assert.strictEqual(actualFiles.length, 2) : assert.fail(`Did not get all CMakeLists cache text under /out/`);
  });

  test("Get most recent CMakeCache.txt", () => {
    mockfs({ "my_app/out/newer/CMakeCache.txt": mockfs.file({ mtime: new Date(1) }) });
    const mostRecentFile = getMostRecentFile("my_app/CMakeListsDirStringDefVar.txt");
    mostRecentFile ? assert.strictEqual(mostRecentFile.endsWith("my_app/out/newer/CMakeCache.txt"), true) : assert.fail(`Did not get most reccent CMakeCache.txt`);
  });
});
