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

### Non Existent Mapping

```json
{ "Name": "LED_1", "Type": "Pwm", "Mapping": "NON_EXISTENT_GPIO" }
```

|                     | |
|---------------------|-|
|Range                |`"NON_EXISTENT_GPIO"`|
|Message              |`Peripheral NON_EXISTENT_GPIO not found.`|
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
