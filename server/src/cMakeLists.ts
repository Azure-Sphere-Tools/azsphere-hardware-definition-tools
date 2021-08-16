import * as fs from "fs";
import * as path from "path";
import { URI } from "vscode-uri";
import { asURI } from "./test/testUtils";
import { Logger } from "./utils";

export function parseCommandsParams(CMakeListsPath: string, logger: Logger = console): string | undefined {
  try {
    const text: string = fs.readFileSync(CMakeListsPath).toString();
    const match: RegExpExecArray | null = /TARGET_DIRECTORY "(.*)" TARGET_DEFINITION "(.*)"/g.exec(text);
    // Variables not hardcode
    if (!match) return;

    if (match[1].length && match[2].length) {
      let [dir, file]: string[] = [match[1], match[2]];
      const absolutePath: string = path.resolve(path.join(path.dirname(URI.parse(asURI(CMakeListsPath)).fsPath), "out/ARM-Debug/"));
      let mostRecentCachePath: string | undefined;
      let cacheTxt: string | undefined;

      // Check if wrapped with ${}
      if (/\${.*?\}/g.test(dir)) {
        mostRecentCachePath = path.join(absolutePath, getMostRecentFile(absolutePath));
        cacheTxt = fs.readFileSync(mostRecentCachePath).toString();

        const variableWithoutWrapping: RegExpExecArray | null = /(?<=\{)(.*?)(?=\})/s.exec(dir);
        if (variableWithoutWrapping && cacheTxt) {
          // Match the variable line in the cache text
          const regex: RegExp | null = new RegExp(`${variableWithoutWrapping[0]}(.*)`, "g");

          const variableLineInCache: RegExpExecArray | null = regex.exec(cacheTxt);
          if (variableLineInCache) {
            // Match everything after "="
            const dirVariable: RegExpExecArray | null = /(?<==).*/g.exec(variableLineInCache[0]);
            dirVariable ? (dir = dirVariable[0]) : undefined;
          }
        }
      }

      if (/\${.*?\}/g.test(file)) {
        if (!mostRecentCachePath) {
          mostRecentCachePath = path.join(absolutePath, getMostRecentFile(absolutePath));
          cacheTxt = fs.readFileSync(mostRecentCachePath).toString();
        }
        const variableWithoutWrapping: RegExpExecArray | null = /(?<=\{)(.*?)(?=\})/s.exec(file);
        if (variableWithoutWrapping && cacheTxt) {
          // Match the variable line in the cache text
          const regex: RegExp | null = new RegExp(`${variableWithoutWrapping[0]}(.*)`, "g");

          const variableLineInCache: RegExpExecArray | null = regex.exec(cacheTxt);
          if (variableLineInCache) {
            // Match everything after "="
            const fileVariable: RegExpExecArray | null = /(?<==).*/g.exec(variableLineInCache[0]);
            fileVariable ? (file = fileVariable[0]) : undefined;
          }
        }
      }

      console.log(dir);
      console.log(file);
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

const getMostRecentFile = (dir: string) => {
  const files = orderReccentFiles(dir);
  return files.length ? files[0].file : "";
};

const orderReccentFiles = (dir: string) => {
  return fs
    .readdirSync(dir)
    .filter((file) => fs.lstatSync(path.join(dir, file)).isFile() && file.includes("CMakeCache.txt"))
    .map((file) => ({ file, mtime: fs.lstatSync(path.join(dir, file)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
};
