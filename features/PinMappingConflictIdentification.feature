Feature: Pin mapping conflict identification in HW definition level
  A hardware definition file's pin mappings may include conflicts which might cause errors at compile or runtime.
  Conflicts must be detected and marked as errors or warnings.
  Conflicts marked as errors include:
  - Pin mappings with duplicate names across all imported hardware definitions
  - Pin mappings which map to target mappings that don't exist
  - Pin mappings which use invalid peripheral types
  Conflicts marked as warnings include:
  - Pin mappings which map to indirectly imported pin mappings 
  - Multiple pin mappings which map to the same peripheral
  - Pin mappings of different types that share the same pin block

Scenario: Duplicate and nonexistent pin mappings
  Given a hardware definition file "diagnostics.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Description": { "Name": "HW Definition file with duplicate and nonexistent mappings" },
    "Peripherals": [
      { "Name": "SAMPLE_BUTTON_1", "Type": "Gpio", "Mapping": "USER_BUTTON_A" },
      { "Name": "SAMPLE_BUTTON_2", "Type": "Gpio", "Mapping": "USER_BUTTON_A" },
      { "Name": "SAMPLE_BUTTON_3", "Type": "Gpio", "Mapping": "USER_BUTTON_B" }
    ]
  }
  """
  When I open "diagnostics.json"
  Then I should get the following diagnostics:
    | severity | message                                          |
    | Error    | Peripheral USER_BUTTON_A not found.              |
    | Warning  | USER_BUTTON_A is also mapped to SAMPLE_BUTTON_2. |
    | Error    | Peripheral USER_BUTTON_A not found.              |
    | Warning  | USER_BUTTON_A is also mapped to SAMPLE_BUTTON_1. |
    | Error    | Peripheral USER_BUTTON_B not found.              |


Scenario: Conflicting pin blocks
  Given a hardware definition file "mt3620.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Description": { "Name": "MT3620" },
    "Peripherals": [
      {"Name": "GPIO0", "Type": "Gpio", "AppManifestValue": 0, "MainCoreHeaderValue": "(0)", "Comment": "MT3620 GPIO 0. Pin shared with PWM Controller 0."},
      {"Name": "GPIO1", "Type": "Gpio", "AppManifestValue": 1, "MainCoreHeaderValue": "(1)", "Comment": "MT3620 GPIO 1. Pin shared with PWM Controller 0."},
      {"Name": "GPIO5", "Type": "Gpio", "AppManifestValue": 5, "MainCoreHeaderValue": "(5)", "Comment": "MT3620 GPIO 5. Pin shared with PWM Controller 1."},
      {"Name": "GPIO6", "Type": "Gpio", "AppManifestValue": 6, "MainCoreHeaderValue": "(6)", "Comment": "MT3620 GPIO 6. Pin shared with PWM Controller 1."},
      {"Name": "PWM_CONTROLLER0", "Type": "Pwm", "AppManifestValue": "PWM-CONTROLLER-0", "MainCoreHeaderValue": "(0)", "Comment": "Shared with GPIO0, GPIO1, GPIO2, GPIO3."},
      {"Name": "ISU0_I2C", "Type": "I2cMaster", "AppManifestValue": "ISU0", "MainCoreHeaderValue": "(0)", "Comment": "MT3620 ISU 0 configured as I2C"},
      {"Name": "ISU0_SPI", "Type": "SpiMaster", "AppManifestValue": "ISU0", "MainCoreHeaderValue": "(0)", "Comment": "MT3620 ISU 0 configured as SPI"}
    ]
  }
  """
  And a hardware definition file "pinblock.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Description": { "Name": "HW Definition file reserving conflicting types on same pin block" },
    "Imports": [ { "Path": "mt3620.json" } ],
    "Peripherals": [
      { "Name": "LED1_RED", "Type": "Gpio",  "Mapping": "GPIO0" },
      { "Name": "LED1_BLUE", "Type": "Gpio", "Mapping": "GPIO1" },
      { "Name": "APP_PWM_CONTROLLER0", "Type": "Pwm", "Mapping": "PWM_CONTROLLER0" },
      { "Name": "APP_ISU0_I2C", "Type": "I2cMaster", "Mapping": "ISU0_I2C" },
      { "Name": "APP_ISU0_SPI", "Type": "SpiMaster", "Mapping": "ISU0_SPI" },
      { "Name": "LED2_RED", "Type": "Gpio", "Mapping": "GPIO5" },
      { "Name": "LED2_BLUE", "Type": "Gpio", "Mapping": "GPIO6" }
    ]
  }   
  """
  When I open "pinblock.json"
  Then I should get the following diagnostics:
    | severity | message                                                 |
    | Warning  | APP_PWM_CONTROLLER0 configured as Gpio by LED1_BLUE     |
    | Warning  | APP_ISU0_SPI configured as I2cMaster by APP_ISU0_I2C    |