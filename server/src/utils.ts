export const HW_DEFINITION_SCHEMA_URL = "https://raw.githubusercontent.com/Azure-Sphere-Tools/hardware-definition-schema/master/hardware-definition-schema.json";

/**
 * Interface to abstract the Language Server Connection's remote logger.
 * Compatible with javascript's built in "console" class.
 */
export interface Logger {
  log(message: string): any;
  info(message: string): any;
  warn(message: string): any;
  error(message: string): any;
}