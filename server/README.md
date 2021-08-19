# Language Server
This `server` project contains the source code for the Azure Sphere Hardware Language Server.
It is IDE agnostic and can be embedded within different IDE extensions to offer "language" support for hardware definition files.

The language server runs as a separate process which communicates with "clients" (i.e. an extension) via JSON-RPC to offer utilities like code completion. So while the language server "binaries" should be embedded in extensions using it, every extension will spawn it as a separate process to interact with it.

The `pack-server.sh` script can be run to pack the language server into a tarball under `packed/language-server.tar.gz` which can then be referenced and embedded by extensions that use it.

## Supported errors and warnings

### Duplicate Name

```json
{ "Name": "LED_1", "Type": "Gpio", "Mapping": "GPIO0" }
{ "Name": "LED_1", "Type": "Gpio", "Mapping": "GPIO1" }
```

|                     | |
|---------------------|-|
|Range                |all `"LED_1"`|
|Message              |`Peripheral name LED_1 is used multiple times.`|
|Severity             |Error|
|Related info location|first `"LED_1"` from the top in the closest import, excluding the hovered one|
|Related info message |`Duplicate peripheral name`|

### Nonexistent Mapping

```json
{ "Name": "LED_1", "Type": "Pwm", "Mapping": "NONEXISTENT_GPIO" }
```

|                     | |
|---------------------|-|
|Range                |`"NONEXISTENT_GPIO"`|
|Message              |`Peripheral NONEXISTENT_GPIO not found.`|
|Severity             |Error|

### Duplicate Mapping

```json
{ "Name": "LED_1", "Type": "Gpio", "Mapping": "GPIO0" }
{ "Name": "LED_2", "Type": "Gpio", "Mapping": "GPIO0" }
```

|                     | |
|---------------------|-|
|Range                |all `"GPIO0"`|
|Message              |`GPIO0 is also mapped to LED1.`|
|                     |`GPIO0 is also mapped to LED2.`|
|Severity             |Warning|
|Related info location|first `"GPIO0"` from the top excluding the hovered one|
|Related info message |`Duplicate peripheral mapping`|

### Indirect Mapping

```json
"Imports": [ {"Path": "mt3620_rdb.json"} ],
"Peripherals": {
  { "Name": "LED_1", "Type": "Gpio", "Mapping": "GPIO0" }
}
```

|                     | |
|---------------------|-|
|Range                |`"GPIO0"`|
|Message              |`GPIO0 is indirectly imported from mt3620.json.`|
|Severity             |Warning|
|Related info location|GPIO0 peripheral in mt3620.json|
|Related info message |`Indirect import`|

### Invalid Pin Type

```json
{ "Name": "LED_1", "Type": "Pwm", "Mapping": "GPIO0" }
```

|                     | |
|---------------------|-|
|Range                |`"Pwm"`|
|Message              |`Peripheral GPIO0 cannot be used as Pwm.`|
|Severity             |Error|
|Related info location|GPIO0 peripheral type|
|Related info message |`Invalid type`|

### Pin Block Conflict

```json
{ "Name": "LED_1", "Type": "Gpio", "Mapping": "GPIO0" }
{ "Name": "LED_2", "Type": "Pwm", "Mapping": "PWM_CONTROLLER0" }
```

|                     | |
|---------------------|-|
|Range                |`"Gpio"`|
|                     |`"Pwm"`|
|Message              |`GPIO0 controller configured as Pwm by LED_2`|
|                     |`PWM_CONTROLLER0 controller configured as Gpio by LED_1`|
|Severity             |Error|
|Related info location|`"Pwm"`|
|                     |`"Gpio"`|
|Related info message |`Pin block conflict`|

### Unknown Import

```json
"Imports": [ {"Path": "mt3620_rdb.json"}, {"Path": "invalid_path"} ]
```

|                     | |
|---------------------|-|
|Range                |`"invalid_path"`|
|Message              |`Cannot find invalid_path under HW_DEFINITION_FILE_PATH or SDK_PATH.`|
|Severity             |Warning|

### Duplicate Mapping Across Apps

```json
{
  "ComponentId": "00000000-0000-0000-0000-000000000001",
  "Capabilities": {
    "Gpio": [ "$LED_1" ],
    "AllowedApplicationConnections": [ "00000000-0000-0000-0000-000000000002" ]
  }
}
```

```json
{
  "ComponentId": "00000000-0000-0000-0000-000000000002",
  "Capabilities": {
    "Gpio": [ "$LED_2" ],
    "AllowedApplicationConnections": [ "00000000-0000-0000-0000-000000000001" ]
  }
}
```

|                     | |
|---------------------|-|
|Range                |`"$LED_1"`|
|                     |`"$LED_2"`|
|Message              |`App manifest value of $LED_1 is also declared in partner app 00000000-0000-0000-0000-000000000002 through $LED_2.`|
|                     |`App manifest value of $LED_2 is also declared in partner app 00000000-0000-0000-0000-000000000001 through $LED_1.`|
|Severity             |Warning|

### Pin Block Conflict Across Apps

```json
{
  "ComponentId": "00000000-0000-0000-0000-000000000001",
  "Capabilities": {
    "Gpio": [ "$LED_1" ],
    "AllowedApplicationConnections": [ "00000000-0000-0000-0000-000000000002" ]
  }
}
```

```json
{
  "ComponentId": "00000000-0000-0000-0000-000000000002",
  "Capabilities": {
    "Pwm": [ "$LED_2" ],
    "AllowedApplicationConnections": [ "00000000-0000-0000-0000-000000000001" ]
  }
}
```

|                     | |
|---------------------|-|
|Range                |`"$LED_1"`|
|                     |`"$LED_2"`|
|Message              |`$LED_1 configured as Pwm by $LED_2 in partner app 00000000-0000-0000-0000-000000000002.`|
|                     |`$LED_2 configured as Gpio by $LED_1 in partner app 00000000-0000-0000-0000-000000000001.`|
|Severity             |Warning|

### Unknown Partner Application

```json
.vscode/settings.json
{
    "AzureSphere.partnerApplications": {
        "00000000-0000-0000-0000-000000000001": "dir_1/app_manifest.json",
        "00000000-0000-0000-0000-000000000002": "dir_2/app_manifest.json"
    }
}
```

```json
app_manifest.json
{
  "ComponentId": "00000000-0000-0000-0000-000000000001",
  "Capabilities": {
    "AllowedApplicationConnections": [ "00000000-0000-0000-0000-000000000002" ]
  }
}
```

|                     | |
|---------------------|-|
|Range                |`[ "00000000-0000-0000-0000-000000000002" ]`|
|Message              |`Could not find partner app 00000000-0000-0000-0000-000000000002 under path "dir_2/app_manifest.json". \nPlease check your .vscode/settings.json or .code-workspace file to fix the path to the partner app manifest.`|
|Severity             |Warning|
