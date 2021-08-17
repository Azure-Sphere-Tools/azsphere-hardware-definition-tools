import * as fs from "fs";
import * as path from "path";
import { URI } from "vscode-uri";
import { asURI } from "./test/testUtils";
import { Logger } from "./utils";
import * as glob from "glob";

export function parseCommandsParams(CMakeListsPath: string, logger: Logger = console): string | undefined {
  try {
    const text: string = fs.readFileSync(CMakeListsPath).toString();
    const match: RegExpExecArray | null = /TARGET_DIRECTORY "(.*)" TARGET_DEFINITION "(.*)"/g.exec(text);

    if (!match) return;

    if (match[1].length && match[2].length) {
      let [dir, file]: string[] = [match[1], match[2]];
      // TODO: Find out/*/cmakecache
      // const absolutePath: string = path.resolve(path.join(path.dirname(URI.parse(asURI(CMakeListsPath)).fsPath), "out/ARM-Debug/"));

      // Check if wrapped with ${}, not hardcoded
      if (/\${.*?\}/g.test(dir)) {
        const cacheTxt: string | undefined = getCacheTxt(CMakeListsPath);

        if (cacheTxt) {
          const TARGET_DIRECTORY = getHwDefPathFromCache(dir, cacheTxt);
          TARGET_DIRECTORY ? (dir = TARGET_DIRECTORY) : undefined;
        }
      }

      if (/\${.*?\}/g.test(file)) {
        const cacheTxt: string | undefined = getCacheTxt(CMakeListsPath);
        if (cacheTxt) {
          const TARGET_DEFINITION = getHwDefPathFromCache(file, cacheTxt);
          TARGET_DEFINITION ? (file = TARGET_DEFINITION) : undefined;
        }
      }

      const pathFromHwDefinitionFile: string = path.join(path.dirname(CMakeListsPath), dir, file);

      if (fs.existsSync(pathFromHwDefinitionFile)) {
        return pathFromHwDefinitionFile;
      } else {
        logger.log(`[Parse CMakeLists] Azuresphere Target Hardware Definition not found in the target specified in CMakeLists - ${pathFromHwDefinitionFile}`);
      }
    } else {
      logger.log(`[Parse CMakeLists] TARGET_DIRECTORY and/or TARGET_DEFINITION in CMakeLists are empty.`);
    }
  } catch (err) {
    logger.log(`[Parse CMakeLists] - Cannot parse CMAkeLists command's parameters. ${err}`);
  }
}

const getCacheTxt = (absolutePath: string): string => {
  return fs.readFileSync(getMostRecentFile(absolutePath)).toString();
};

/**
 *
 * @param targetValue TARGET_DIRECTORY or TARGET_DEFINITION value parsed from CMakeLists.txt
 * @param cacheTxt CMakeCache.txt text
 * @returns Correctly formatted dir/file value
 */
const getHwDefPathFromCache = (targetValue: string, cacheTxt: string) => {
  // "${file.json}" -> "file.json"
  const variableWithoutWrapping: RegExpExecArray | null = /(?<=\{)(.*?)(?=\})/s.exec(targetValue);
  if (variableWithoutWrapping && cacheTxt) {
    // Match the variable line in the cache text
    const regex: RegExp | null = new RegExp(`${variableWithoutWrapping[0]}(.*)`, "g");
    const variableLineInCache: RegExpExecArray | null = regex.exec(cacheTxt);
    if (variableLineInCache) {
      // Match everything after "="
      const variablleValue: RegExpExecArray | null = /(?<==).*/g.exec(variableLineInCache[0]);
      return variablleValue ? variablleValue[0] : undefined;
    }
  }
};

const getMostRecentFile = (dir: string) => {
  const files = orderReccentFiles(dir);
  return files?.length ? files[0].file : "";
};

const orderReccentFiles = (dir: string): { file: string; mtime: Date }[] | undefined => {
  const files = glob.sync(`${path.resolve(path.dirname(URI.parse(asURI(dir)).fsPath))}/out/**/CMakeCache.txt`);
  return files.map((file) => ({ file, mtime: fs.lstatSync(path.join(file)).mtime })).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
};
