Feature: Pin mapping generation in text editor
  When editing a hardware definition file's peripherals, a command can be run to generate pin mappings
  based on the available pins and the pin type selected by the user.
  The pin types and number of pins that can be generated are based on pin mappings which: 
  - Are defined in directly imported hardware definitions
  - Aren't be used by another pin mapping in the hardware definition
  - Don't cause pin block conflicts with other pin mappings in the hardware definition

Scenario: Adds available pin mappings of same type
  Given a hardware definition file "mt3620.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Peripherals": [
      {"Name": "GPIO0", "Type": "Gpio", "MainCoreHeaderValue": "(0)", "AppManifestValue": 0 },
      {"Name": "GPIO1", "Type": "Gpio", "MainCoreHeaderValue": "(1)", "AppManifestValue": 1 },
      {"Name": "GPIO2", "Type": "Gpio", "MainCoreHeaderValue": "(2)", "AppManifestValue": 2 }
    ]
  }
  """
  And a hardware definition file "my_application.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Imports": [
      {"Path": "mt3620.json"}
    ],
    "Peripherals": [
      {"Name": "MY_GPIO0", "Type": "Gpio", "Mapping": "GPIO0" }
    ]
  }   
  """
  When I open "my_application.json"
  And I run the "Add pin mappings for Hardware Definition File" command
  And I add 2 pin mappings of type "Gpio"
  Then "my_application.json" should contain the following pin mappings:
    | name     | type | mapping |
    | MY_GPIO0 | Gpio | GPIO0   |
    | <empty>  | Gpio | GPIO1   |
    | <empty>  | Gpio | GPIO2   |


Scenario: Adds available pin mappings that do not conflict with reserved pin blocks
  Given a hardware definition file "mt3620.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Peripherals": [
      {"Name": "GPIO0", "Type": "Gpio", "MainCoreHeaderValue": "(0)", "AppManifestValue": 0, "Comment": "Same pin block as PWM0" },
      {"Name": "GPIO8", "Type": "Gpio", "MainCoreHeaderValue": "(8)", "AppManifestValue": 8, "Comment": "Different pin block" },
      {"Name": "PWM0", "Type": "Pwm", "MainCoreHeaderValue": "(0)", "AppManifestValue": "PWM-CONTROLLER-0" }
    ]
  }
  """
  And a hardware definition file "my_application.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Imports": [
      {"Path": "mt3620.json"}
    ],
    "Peripherals": [
      {"Name": "MY_PWM0", "Type": "Pwm", "Mapping": "PWM0" }
    ]
  }   
  """
  When I open "my_application.json"
  And I run the "Add pin mappings for Hardware Definition File" command
  And I add 1 pin mappings of type "Gpio"
  Then "my_application.json" should contain the following pin mappings:
    | name     | type | mapping |
    | MY_PWM0  | Pwm  | PWM0    |
    | <empty>  | Gpio | GPIO8   |