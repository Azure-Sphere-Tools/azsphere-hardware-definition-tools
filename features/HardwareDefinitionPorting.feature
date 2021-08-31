Feature: Hardware definition porting to other Original Device Manufacturer (ODM) definitions
  A command can be run to "port" hardware definitions so they can support different development boards/hardware created by
  Original Device Manufacturers (ODM). When running the porting command, users can select which new hardware definition
  they want to support based on the the hardware definitions under ${AZSPHERE_SDK_PATH}/HardwareDefinitions.
  After the porting command runs, a new hardware definition is created based on the ported one,
  with its import and Mapping values changed to match the newly supported hardware definition.

Scenario: Uses pins that map to the same app manifest values
  Given a hardware definition file "sdk/HardwareDefinitions/mt3620.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Description": { "Name": "MT3620" },
    "Peripherals": [
      {"Name": "GPIO0", "Type": "Gpio", "MainCoreHeaderValue": "(0)", "AppManifestValue": 0 },
      {"Name": "PWM1", "Type": "Pwm", "MainCoreHeaderValue": "(1)", "AppManifestValue": "PWM-CONTROLLER-1" }
    ]
  }
  """
  And a hardware definition file "sdk/HardwareDefinitions/odmA.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Description": { "Name": "ODM A" },
    "Imports": [ {"Path": "mt3620.json"} ],
    "Peripherals": [
      {"Name": "GPIO0_ODM_A", "Type": "Gpio", "Mapping": "GPIO0" },
      {"Name": "PWM1_ODM_A", "Type": "Pwm", "Mapping": "PWM1" }
    ]
  }
  """
  And a hardware definition file "sdk/HardwareDefinitions/odmB.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Description": { "Name": "ODM B" },
    "Imports": [ {"Path": "mt3620.json"} ],
    "Peripherals": [
      {"Name": "GPIO0_ODM_B", "Type": "Gpio", "Mapping": "GPIO0" },
      {"Name": "PWM1_ODM_B", "Type": "Pwm", "Mapping": "PWM1" }
    ]
  }
  """
  And a hardware definition file "my_application.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Description": { "Name": "HW Definition for application based on ODM A" },
    "Imports": [ {"Path": "odmA.json"} ],
    "Peripherals": [
      {"Name": "BUTTON", "Type": "Gpio", "Mapping": "GPIO0_ODM_A" },
      {"Name": "LED", "Type": "Pwm", "Mapping": "PWM1_ODM_A" }
    ]
  }
  """
  And the setting "AzureSphere.SdkPath" is configured as "sdk/"
  When I open "my_application.json"
  And I run the "Port to another hardware definition" command
  And I select "ODM B" as the hardware definition to port to
  Then "my_application-ported.json" should be created
  And "my_application-ported.json" should import "odmB.json"
  And "my_application-ported.json" should contain the following pin mappings:
    | name   | type | mapping       |
    | BUTTON | Gpio | GPIO0_ODM_B   |
    | LED    | Pwm  | PWM1_ODM_B   |
