import * as path from "path";
import { URI } from "vscode-uri";
import { Range } from "vscode-languageserver-textdocument";
import { PinMappingKey, PinMapping } from '../hardwareDefinition';
import { AppManifest, AppPinKey } from "../applicationManifest";
import { Parser } from "../parser";
import { error } from "console";

export function asURI(hwDefFilePath: string): string {
  return URI.file(path.resolve(hwDefFilePath)).toString();
}

/**
 * Returns a Range with given or default arbitrary values.
 * Useful for when we need to provide a Range that we don't care about
 */
export function getRange(startLine = 0, startChar = 0, endLine = 0, endChar = 27): Range {
  return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
}

type _PinMappingKey<T> = {
  range?: Range,
  key?: {
    text?: T,
    range?: Range
  },
  value?: {
    text?: T,
    range?: Range
  }
}

/**
 * Returns a new PinMapping with the given or default values for all the required parameters
 *
 * </br></br>
 * Examples:
 *
 * </br>
 * <code>getDummyPinMapping()</code> returns a new PinMapping with all ranges
 * set to <b>0</b>, <i>Name</i> set to <b>MY_PIN</b> and <i>Type</i> <b>Gpio</b>.
 *
 * </br></br>
 * <code>getDummyPinMapping({appManifestValue: 1})</code> returns a new PinMapping with all ranges
 * set to <b>0</b>, <i>Name</i> set to <b>MY_PIN</b>, <i>Type</i> <b>Gpio</b> and <i>AppManifestValue</i> <b>1</b>
 *
 * </br></br>
 * <code>getDummyPinMapping({appManifestValue: {value: {text: 1}}})</code> returns a new PinMapping with all ranges
 * set to <b>0</b>, <i>Name</i> set to <b>MY_PIN</b>, <i>Type</i> <b>Gpio</b> and <i>AppManifestValue</i> <b>1</b>
 *
 * @param {Object} [opt]
 * @param {Range}  [opt.range=(0,0,0,0)]
 * @param {Object} [opt.name]
 * @param {Range}  [opt.name.range=(0,0,0,0)]
 * @param {Object} [opt.name.key]
 * @param {string} [opt.name.key.text=Name]
 * @param {Range}  [opt.name.key.range=(0,0,0,0)]
 * @param {Object} [opt.name.value]
 * @param {string} [opt.name.value.text=MY_PIN]
 * @param {Range}  [opt.name.value.range=(0,0,0,0)]
 * @param {Object} [opt.type]
 * @param {Range}  [opt.type.range=(0,0,0,0)]
 * @param {Object} [opt.type.key]
 * @param {string} [opt.type.key.text=Type]
 * @param {Range}  [opt.type.key.range=(0,0,0,0)]
 * @param {Object} [opt.type.value]
 * @param {string} [opt.type.value.text=Gpio]
 * @param {Range}  [opt.type.value.range=(0,0,0,0)]
 * @param {Object} [opt.mapping='undefined']
 * @param {Range}  [opt.mapping.range=(0,0,0,0)]
 * @param {Object} [opt.mapping.key]
 * @param {string} [opt.mapping.key.text=Mapping]
 * @param {Range}  [opt.mapping.key.range=(0,0,0,0)]
 * @param {Object} [opt.mapping.value]
 * @param {string} [opt.mapping.value.text=MT3620_GPIO1]
 * @param {Range}  [opt.mapping.value.range=(0,0,0,0)]
 * @param {Object} [opt.appManifestValue='undefined']
 * @param {Range}  [opt.appManifestValue.range=(0,0,0,0)]
 * @param {Object} [opt.appManifestValue.key]
 * @param {string} [opt.appManifestValue.key.text=AppManifestValue]
 * @param {Range}  [opt.appManifestValue.key.range=(0,0,0,0)]
 * @param {Object} [opt.appManifestValue.value]
 * @param {string} [opt.appManifestValue.value.text=1]
 * @param {Range}  [opt.appManifestValue.value.range=(0,0,0,0)]
 * @param {Object} [opt.comment='undefined']
 * @param {Range}  [opt.comment.range=(0,0,0,0)]
 * @param {Object} [opt.comment.key]
 * @param {string} [opt.comment.key.text=Comment]
 * @param {Range}  [opt.comment.key.range=(0,0,0,0)]
 * @param {Object} [opt.comment.value]
 * @param {string} [opt.comment.value.text=empty]
 * @param {Range}  [opt.comment.value.range=(0,0,0,0)]
 * @returns PinMapping
 */
export function getDummyPinMapping(
  opt: {
    range?: Range,
    name?: string | _PinMappingKey<string>,
    type?: string | _PinMappingKey<string>,
    mapping?: string | _PinMappingKey<string>,
    appManifestValue?: number | string | _PinMappingKey<number | string>,
    comment?: string | _PinMappingKey<string>
  } = {}): PinMapping {

  function getDummyPinMappingKey(opt?: _PinMappingKey<number | string>, def?: _PinMappingKey<number | string>): PinMappingKey<number | string> {
    return {
      range: opt?.range || def?.range || getRange(0, 0, 0, 0),
      key: {
        text: opt?.key?.text || def?.key?.text || '',
        range: opt?.key?.range || def?.key?.range || getRange(0, 0, 0, 0)
      },
      value: {
        text: opt?.value?.text || def?.value?.text || '',
        range: opt?.value?.range || def?.value?.range || getRange(0, 0, 0, 0)
      }
    };
  }

  // If required field is undefined, set it to a defalt string value
  opt.range = opt.range || getRange(0, 0, 0, 0);
  opt.name = opt.name || 'MY_PIN';
  opt.type = opt.type || 'Gpio';

  // If field is a string or number, convert it to _PinMappingKey
  if (typeof opt.name == 'string')
    opt.name = { key: { text: 'Name' }, value: { text: opt.name } };

  if (typeof opt.type == 'string')
    opt.type = { key: { text: 'Type' }, value: { text: opt.type } };

  if (typeof opt.mapping == 'string')
    opt.mapping = { key: { text: 'Mapping' }, value: { text: opt.mapping } };

  if (typeof opt.appManifestValue == 'string' ||
    typeof opt.appManifestValue == 'number')
    opt.appManifestValue = { key: { text: 'AppManifestValue' }, value: { text: opt.appManifestValue } };

  if (typeof opt.comment == 'string')
    opt.comment = { key: { text: 'Comment' }, value: { text: opt.comment } };

  // If required or defined field has undefined properties, set them to default values and convert to PinMappingKey
  opt.name = getDummyPinMappingKey(opt.name, { key: { text: 'Name' }, value: { text: 'MY_PIN' } }) as PinMappingKey<string>;
  opt.type = getDummyPinMappingKey(opt.type, { key: { text: 'Type' }, value: { text: 'Gpio' } }) as PinMappingKey<string>;

  if (opt.mapping != undefined)
    opt.mapping = getDummyPinMappingKey(opt.mapping, { key: { text: 'Mapping' }, value: { text: 'MT3620_GPIO1' } }) as PinMappingKey<string>;

  if (opt.appManifestValue != undefined)
    opt.appManifestValue = getDummyPinMappingKey(opt.appManifestValue, { key: { text: 'AppManifestValue' }, value: { text: 1 } }) as PinMappingKey<number | string>;

  if (opt.comment != undefined)
    opt.comment = getDummyPinMappingKey(opt.comment, { key: { text: 'Comment' }, value: { text: '' } }) as PinMappingKey<string>;

  return new PinMapping(
    opt.range,
    opt.name as PinMappingKey<string>,
    opt.type as PinMappingKey<string>,
    opt.mapping as PinMappingKey<string>,
    opt.appManifestValue as PinMappingKey<number | string>,
    opt.comment as PinMappingKey<string>,
  );
}

export function dummyAppManifest(appId: string, partnerIds?: string[], gpios?: (string | number)[]): AppManifest {
  partnerIds = partnerIds ?? [];
  gpios = gpios ?? [];
  const parsedDummy = new Parser().tryParseAppManifestFile(`
  {
    "SchemaVersion": 1,
    "Name": "Some mock application manifest",
    "ComponentId": "${appId}",
    "EntryPoint": "/bin/app",
    "CmdArgs": [],
    "Capabilities": {
      "AllowedApplicationConnections": ${JSON.stringify(partnerIds)},
      "Gpio": ${JSON.stringify(gpios)}
    },
    "ApplicationType": "Default"
  }`);
  if (parsedDummy) {
    return parsedDummy;
  } else {
    throw error("Failed to create dummy app manifest");
  }
}
