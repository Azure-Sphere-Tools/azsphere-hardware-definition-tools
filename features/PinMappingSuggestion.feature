Feature: Appropriate pin mapping suggestion in text editor
  When editing a hardware definition file's peripherals, suggestions can be requested for the "Mapping" property to obtain
  a list of available pin mappings in the imported hardware definitions.
  For a given pin mapping, all suggestions must:
  - Be of the same type as the pin mapping
  - Exist in a directly imported hardware definition
  - Not be used by another pin mapping in the hardware definition
  - Not cause pin block conflicts with other pin mappings in the hardware definition

Scenario: Suggests directly imported mappings of same type
  Given a hardware definition file "mt3620.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Peripherals": [
      {"Name": "GPIO0", "Type": "Gpio", "MainCoreHeaderValue": "(0)", "AppManifestValue": 0 },
      {"Name": "GPIO1", "Type": "Gpio", "MainCoreHeaderValue": "(1)", "AppManifestValue": 1 },
      {"Name": "GPIO2", "Type": "Gpio", "MainCoreHeaderValue": "(2)", "AppManifestValue": 2 },
      {"Name": "PWM1", "Type": "Pwm", "MainCoreHeaderValue": "(0)", "AppManifestValue": "PWM-CONTROLLER-1" }
    ]
  }
  """
  And a hardware definition file "odm.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Imports": [
      {"Path": "mt3620.json"}
    ],
    "Peripherals": [
      {"Name": "ODM_GPIO0", "Type": "Gpio", "Mapping": "GPIO0" },
      {"Name": "ODM_GPIO1", "Type": "Gpio", "Mapping": "GPIO1" },
      {"Name": "ODM_PWM1", "Type": "Pwm", "Mapping": "PWM1" }
    ]
  }   
  """
  And a hardware definition file "completion.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Imports": [
      {"Path": "odm.json"}
    ],
    "Peripherals": [
      {"Name": "MY_GPIO0", "Type": "Gpio", "Mapping": "ODM_GPIO0" },
      {"Name": "MY_GPIO1", "Type": "Gpio", "Mapping": "ODM_G" },
      {"Name": "MY_PWM1", "Type": "Pwm", "Mapping": "ODM_P" } 
    ]
  }
  """
  When I open "completion.json"
  And I move my caret to "ODM_G"
  Then I should get the following suggestions:
    | "ODM_GPIO1" |
  When I open "completion.json"
  And I move my caret to "ODM_P"
  Then I should get the following suggestions:
    | "ODM_PWM1" |


Scenario: Suggests mappings that do not conflict with reserved pin blocks
  Given a hardware definition file "mt3620.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Peripherals": [
      {"Name": "GPIO0", "Type": "Gpio", "MainCoreHeaderValue": "(0)", "AppManifestValue": 0, "Comment": "Same pin block as PWM0" },
      {"Name": "GPIO1", "Type": "Gpio", "MainCoreHeaderValue": "(1)", "AppManifestValue": 1, "Comment": "Same pin block as PWM0" },
      {"Name": "GPIO8", "Type": "Gpio", "MainCoreHeaderValue": "(8)", "AppManifestValue": 8, "Comment": "Different pin block" },
      {"Name": "PWM0", "Type": "Pwm", "MainCoreHeaderValue": "(0)", "AppManifestValue": "PWM-CONTROLLER-0" }
    ]
  }
  """
  And a hardware definition file "odm.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Imports": [
      {"Path": "mt3620.json"}
    ],
    "Peripherals": [
      {"Name": "ODM_GPIO0", "Type": "Gpio", "Mapping": "GPIO0" },
      {"Name": "ODM_GPIO1", "Type": "Gpio", "Mapping": "GPIO1" },
      {"Name": "ODM_GPIO8", "Type": "Gpio", "Mapping": "GPIO8" },
      {"Name": "ODM_PWM0", "Type": "Pwm", "Mapping": "PWM0" }
    ]
  }   
  """
  And a hardware definition file "completion.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Imports": [
      {"Path": "odm.json"}
    ],
    "Peripherals": [
      {"Name": "MY_GPIO1", "Type": "Gpio", "Mapping": "ODM_G" },
      {"Name": "MY_PWM0", "Type": "Pwm", "Mapping": "ODM_PWM0" } 
    ]
  }
  """
  When I open "completion.json"
  And I move my caret to "ODM_G"
  Then I should get the following suggestions:
    | "ODM_GPIO8" |