Feature: Pin usage conflict identification across partner applications
  If an application reserves a pin under its app manifest's Capabilities, no other partner application may request to use this pin again.
  Partner apps are defined under an app manifest's AllowedApplicationConnections.
  Warning conflicts must be raised in an app manifest for every pin that:
  - Uses the same app manifest value as a partner app's pins
  - Shares a pin block with a partner app pin that has a different type  


Scenario: Same pins used across partner applications
  Given a hardware definition file "hwDefs/mt3620.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Description": { "Name": "MT3620" },
    "Peripherals": [
      {"Name": "MT3620_GPIO4", "Type": "Gpio", "MainCoreHeaderValue": "(4)", "AppManifestValue": 4},
      {"Name": "MT3620_GPIO5", "Type": "Gpio", "MainCoreHeaderValue": "(5)", "AppManifestValue": 5},
      {"Name": "MT3620_PWM0", "Type": "Pwm", "MainCoreHeaderValue": "(0)", "AppManifestValue": "PWM-CONTROLLER-0"},
      {"Name": "MT3620_GPIO60", "Type": "Gpio", "MainCoreHeaderValue": "(60)", "AppManifestValue": 60}
    ]
  }
  """
  And a hardware definition file "hwDefs/applicationA.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1},
    "Imports" : [ {"Path": "mt3620.json"} ],
    "Peripherals": [
      {"Name": "LED_RED_A", "Type": "Gpio", "Mapping": "MT3620_GPIO4"},
      {"Name": "LED_BLUE_A", "Type": "Gpio", "Mapping": "MT3620_GPIO5"},
      {"Name": "LED_PWM_A", "Type": "Pwm", "Mapping": "MT3620_PWM0"},
      {"Name": "BUTTON_A", "Type": "Gpio", "Mapping": "MT3620_GPIO60"}
    ]
  }
  """
  And a hardware definition file "hwDefs/applicationB.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1},
    "Imports" : [ {"Path": "mt3620.json"} ],
    "Peripherals": [
      {"Name": "LED_RED_B", "Type": "Gpio", "Mapping": "MT3620_GPIO4"},
      {"Name": "LED_BLUE_B", "Type": "Gpio", "Mapping": "MT3620_GPIO5"},
      {"Name": "LED_PWM_B", "Type": "Pwm", "Mapping": "MT3620_PWM0"}
    ]
  }
  """
  And a cmake list file "applicationA/CMakeLists.txt":
  """
  azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "../hwDefs/" TARGET_DEFINITION "applicationA.json")
  """
  And an application manifest file "applicationA/app_manifest.json":
  """
  {
    "SchemaVersion": 1,
    "Name": "applicationA",
    "ComponentId": "app-id-a",
    "EntryPoint": "/bin/app",
    "Capabilities": {
      "Gpio": [ "$LED_RED_A", "$LED_BLUE_A", "$BUTTON_A"],
      "Pwm": [ "$LED_PWM_A" ],
      "AllowedApplicationConnections": ["app-id-b"]
    },
    "ApplicationType": "Default"
  }
  """
  And a cmake list file "applicationB/CMakeLists.txt":
  """
  azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "../hwDefs/" TARGET_DEFINITION "applicationB.json")
  """
  And an application manifest file "applicationB/app_manifest.json":  
  """
  {
    "SchemaVersion": 1,
    "Name": "applicationB",
    "ComponentId": "app-id-b",
    "EntryPoint": "/bin/app",
    "Capabilities": {
      "Gpio": [ "$LED_RED_B", "$LED_BLUE_B", 60],
      "Pwm": [ "$LED_PWM_B" ],
      "AllowedApplicationConnections": ["app-id-a"]
    },
    "ApplicationType": "RealTimeCapable"
  }
  """
  When I open "applicationB/app_manifest.json"
  And I open "applicationA/app_manifest.json"
  Then I should get the following diagnostics:
    | severity | message                                                 |
    | Warning  | App manifest value of $LED_RED_A is also declared in partner app app-id-b through $LED_RED_B.   |
    | Warning  | App manifest value of $LED_BLUE_A is also declared in partner app app-id-b through $LED_BLUE_B. |
    | Warning  | App manifest value of $BUTTON_A is also declared in partner app app-id-b through 60.            |
    | Warning  | App manifest value of $LED_PWM_A is also declared in partner app app-id-b through $LED_PWM_B.   |


Scenario: Pin block conflict across partner applications
  Given a hardware definition file "hwDefs/mt3620.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1 },
    "Description": { "Name": "MT3620" },
    "Peripherals": [
      {"Name": "MT3620_GPIO3", "Type": "Gpio", "MainCoreHeaderValue": "(3)", "AppManifestValue": 3},
      {"Name": "MT3620_GPIO4", "Type": "Gpio", "MainCoreHeaderValue": "(4)", "AppManifestValue": 4, "Comment": "shared with PWM1."},
      {"Name": "MT3620_GPIO5", "Type": "Gpio", "MainCoreHeaderValue": "(5)", "AppManifestValue": 5, "Comment": "shared with PWM1."},
      {"Name": "MT3620_PWM1", "Type": "Pwm", "MainCoreHeaderValue": "(1)", "AppManifestValue": "PWM-CONTROLLER-1", "Comment": "shared with GPIO4, GPIO5, GPIO6, GPIO7."}
    ]
  }
  """
  And a hardware definition file "hwDefs/applicationA.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1},
    "Imports" : [ {"Path": "mt3620.json"} ],
    "Peripherals": [
      {"Name": "BUTTON_A", "Type": "Gpio", "Mapping": "MT3620_GPIO3"},
      {"Name": "LED_RED_A", "Type": "Gpio", "Mapping": "MT3620_GPIO4"},
      {"Name": "LED_BLUE_A", "Type": "Gpio", "Mapping": "MT3620_GPIO5"}
    ]
  }
  """
  And a hardware definition file "hwDefs/applicationB.json":
  """
  {
    "Metadata": { "Type": "Azure Sphere Hardware Definition", "Version": 1},
    "Imports" : [ {"Path": "mt3620.json"} ],
    "Peripherals": [
      {"Name": "LED_PWM_B", "Type": "Pwm", "Mapping": "MT3620_PWM1"}
    ]
  }
  """
  And a cmake list file "applicationA/CMakeLists.txt":
  """
  azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "../hwDefs/" TARGET_DEFINITION "applicationA.json")
  """
  And an application manifest file "applicationA/app_manifest.json":
  """
  {
    "SchemaVersion": 1,
    "Name": "applicationA",
    "ComponentId": "app-id-a",
    "EntryPoint": "/bin/app",
    "Capabilities": {
      "Gpio": [ "$BUTTON_A", "$LED_RED_A", "$LED_BLUE_A"],
      "AllowedApplicationConnections": ["app-id-b"]
    },
    "ApplicationType": "Default"
  }
  """
  And a cmake list file "applicationB/CMakeLists.txt":
  """
  azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "../hwDefs/" TARGET_DEFINITION "applicationB.json")
  """
  And an application manifest file "applicationB/app_manifest.json":  
  """
  {
    "SchemaVersion": 1,
    "Name": "applicationB",
    "ComponentId": "app-id-b",
    "EntryPoint": "/bin/app",
    "Capabilities": {
      "Pwm": [ "$LED_PWM_B" ],
      "AllowedApplicationConnections": ["app-id-a"]
    },
    "ApplicationType": "RealTimeCapable"
  }
  """
  When I open "applicationB/app_manifest.json"
  And I open "applicationA/app_manifest.json"
  Then I should get the following diagnostics:
    | severity | message                                                              |
    | Warning  | $LED_RED_A configured as Pwm by $LED_PWM_B in partner app app-id-b.  |
    | Warning  | $LED_BLUE_A configured as Pwm by $LED_PWM_B in partner app app-id-b. |
