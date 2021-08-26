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


Scenario: Conflicting pin usage in application manifest file
  Given a hardware definition file "mt3620.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Description": { "Name": "MT3620" },
    "Peripherals": [
      {"Name": "MT3620_GPIO60", "Type": "Gpio", "MainCoreHeaderValue": "(60)", "AppManifestValue": 60, "Comment": "MT3620 GPIO 60"},
      {"Name": "MT3620_ISU0_I2C", "Type": "I2cMaster", "MainCoreHeaderValue": "(0)", "AppManifestValue": "ISU0", "Comment": "MT3620 ISU 0 configured as I2C"},
      {"Name": "MT3620_PWM_CONTROLLER1", "Type": "Pwm", "MainCoreHeaderValue": "(1)", "AppManifestValue": "PWM-CONTROLLER-1", "Comment": "shared with GPIO4, GPIO5, GPIO6, GPIO7."},
      {"Name": "MT3620_ISU3_UART", "Type": "Uart", "MainCoreHeaderValue": "(7)", "AppManifestValue": "ISU3", "Comment": "MT3620 ISU 3 configured as UART"},
      {"Name": "MT3620_GPIO5", "Type": "Gpio", "MainCoreHeaderValue": "(5)", "AppManifestValue": 5, "Comment": "MT3620 GPIO 5. Pin shared with PWM Controller 1."},
      {"Name": "MT3620_PWM_CONTROLLER0", "Type": "Pwm", "MainCoreHeaderValue": "(0)", "AppManifestValue": "PWM-CONTROLLER-0", "Comment": "shared with GPIO0, GPIO1, GPIO2, GPIO3."},
      {"Name": "MT3620_ISU2_UART", "Type": "Uart", "MainCoreHeaderValue": "(6)", "AppManifestValue": "ISU2", "Comment": "MT3620 ISU 2 configured as UART"},
      {"Name": "MT3620_ISU4_SPI", "Type": "SpiMaster", "MainCoreHeaderValue": "(4)", "AppManifestValue": "ISU4", "Comment": "MT3620 ISU 4 configured as SPI"},
      {"Name": "MT3620_ADC_CONTROLLER0", "Type": "Adc", "MainCoreHeaderValue": "(0)", "AppManifestValue": "ADC-CONTROLLER-0", "Comment": "shared with GPIO41, GPIO42, GPIO43, GPIO44, GPIO45, GPIO46, GPIO47 and GPIO48."},
    ]
  }
  """
  And a hardware definition file "application.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1},
    "Description": { "Name": "MT3620 Reference Development Board (RDB)"},
    "Imports" : [ {"Path": "mt3620.json"} ],
    "Peripherals": [
      {"Name": "SAMPLE_LED_RED2", "Type": "Gpio", "Mapping": "MT3620_GPIO60"},
      {"Name": "SAMPLE_I2C1", "Type": "I2cMaster", "Mapping": "MT3620_ISU0_I2C"},
      {"Name": "SAMPLE_Pwm2", "Type": "Pwm", "Mapping": "MT3620_PWM_CONTROLLER1"},
      {"Name": "SAMPLE_UART2", "Type": "Uart", "Mapping": "MT3620_ISU3_UART"}
    ]
  }
  """
  And a hardware definition file "application1.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1},
    "Description": { "Name": "MT3620 Reference Development Board (RDB)"},
    "Imports" : [ {"Path": "mt3620.json"} ],
    "Peripherals": [
      {"Name": "SAMPLE_LED_RED1", "Type": "Gpio", "Mapping": "MT3620_GPIO5"},
      {"Name": "SAMPLE_I2C1", "Type": "I2cMaster", "Mapping": "MT3620_ISU0_I2C"},
      {"Name": "SAMPLE_Pwm1", "Type": "Pwm", "Mapping": "MT3620_PWM_CONTROLLER0"},
      {"Name": "SAMPLE_UART1", "Type": "Uart", "Mapping": "MT3620_ISU2_UART"},
      {"Name": "SAMPLE_SpiMaster1", "Type": "SpiMaster", "Mapping": "MT3620_ISU4_SPI"},
      {"Name": "SAMPLE_ADC_CONTROLLER0", "Type": "Adc", "Mapping": "MT3620_ADC_CONTROLLER0"}
    ]
  }
  """
  And a cmake list file "applicationA/CMakeLists.txt":
  """
  azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "../" TARGET_DEFINITION "application.json")
  """
  And an application manifest file "applicationA/app_manifest.json":
  """
  {
    "SchemaVersion": 1,
    "Name": "HelloWorld_HighLevelApp",
    "ComponentId": "25025d2c-66da-4448-bae1-ac26fcdd3627",
    "EntryPoint": "/bin/app",
    "CmdArgs": [],
    "Capabilities": {
      "Gpio": [ "$SAMPLE_LED_RED2", 5, 8],
      "I2cMaster": [ "$SAMPLE_I2C1"],
      "Pwm": [ "$SAMPLE_Pwm2" ],
      "Uart": [ "$SAMPLE_UART2"],
      "SpiMaster": [ "ISU1" ],
      "Adc": [ "ADC-CONTROLLER-0" ],
      "AllowedApplicationConnections": ["005180bc-402f-4cb3-a662-72937dbcde47"]
    },
    "ApplicationType": "Default"
  }
  """
  And a cmake list file "applicationB/CMakeLists.txt":
  """
  azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "../" TARGET_DEFINITION "application1.json")
  """
  And an application manifest file "applicationB/app_manifest.json":  
  """
  {
    "SchemaVersion": 1,
    "Name": "IntercoreComms_RTApp_MT3620_BareMetal",
    "ComponentId": "005180bc-402f-4cb3-a662-72937dbcde47",
    "EntryPoint": "/bin/app",
    "Capabilities": {
      "Gpio": [ "$SAMPLE_LED_RED1"],
      "I2cMaster": [ "$SAMPLE_I2C1"],
      "Pwm": [ "$SAMPLE_Pwm1" ],
      "Uart": [ "$SAMPLE_UART1" ],
      "SpiMaster": [ "$SAMPLE_SpiMaster1" ],
      "Adc": [ "$SAMPLE_ADC_CONTROLLER0" ],
      "AllowedApplicationConnections": ["25025d2c-66da-4448-bae1-ac26fcdd3627"]
    },
    "ApplicationType": "RealTimeCapable"
  }
  """
  And open "applicationA/app_manifest.json"
  And open "applicationB/app_manifest.json"
  When I open "applicationA/app_manifest.json"
  Then I should get the following diagnostics:
    | severity | message                                                 |
    | Warning  | App manifest value of 5 is also declared in partner app 005180bc-402f-4cb3-a662-72937dbcde47 through $SAMPLE_LED_RED1.    |
    | Warning  | App manifest value of $SAMPLE_I2C1 is also declared in partner app 005180bc-402f-4cb3-a662-72937dbcde47 through $SAMPLE_I2C1.    |
    | Warning  | $SAMPLE_Pwm2 configured as Gpio by $SAMPLE_LED_RED1 in partner app 005180bc-402f-4cb3-a662-72937dbcde47.    |
    | Warning  | App manifest value of ADC-CONTROLLER-0 is also declared in partner app 005180bc-402f-4cb3-a662-72937dbcde47 through $SAMPLE_ADC_CONTROLLER0.    |

  When I open "applicationB/app_manifest.json"
  Then I should get the following diagnostics:
    | severity | message                                                 |
    | Warning  | $SAMPLE_LED_RED1 configured as Pwm by $SAMPLE_Pwm2 in partner app 25025d2c-66da-4448-bae1-ac26fcdd3627.    |
    | Warning  | App manifest value of $SAMPLE_LED_RED1 is also declared in partner app 25025d2c-66da-4448-bae1-ac26fcdd3627 through 5.    |
    | Warning  | App manifest value of $SAMPLE_I2C1 is also declared in partner app 25025d2c-66da-4448-bae1-ac26fcdd3627 through $SAMPLE_I2C1.    |
    | Warning  | App manifest value of $SAMPLE_ADC_CONTROLLER0 is also declared in partner app 25025d2c-66da-4448-bae1-ac26fcdd3627 through ADC-CONTROLLER-0.    |
