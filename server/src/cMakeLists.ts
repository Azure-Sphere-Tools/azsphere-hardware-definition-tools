import * as fs from "fs";
import * as path from "path";
import { Logger } from "./utils";

export function parseCommandsParams(CMakeListsPath: string, logger: Logger = console): string | undefined {

  try {
    const text: string = fs.readFileSync(CMakeListsPath).toString();
    const match: RegExpExecArray | null = /TARGET_DIRECTORY "(.*)" TARGET_DEFINITION "(.*)"/g.exec(text);

    if (!match) return;

    if (match[1].length && match[2].length) {
      const [dir, file]: string[] = [match[1], match[2]];

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
