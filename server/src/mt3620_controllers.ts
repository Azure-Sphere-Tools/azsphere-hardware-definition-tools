interface Controller {
    name: string,
    values: ControllerValues
}

interface ControllerValues {
    [key: string]: (number | string)[]
}

const CONTROLLERS: Controller[] = [
    {
        "name": "PWM-CONTROLLER-0",
        "values": {
            "gpio": [0, 1, 2, 3],
            "pwm": ["PWM-CONTROLLER-0"]
        }
    },
    {
        "name": "PWM-CONTROLLER-1",
        "values": {
            "gpio": [4, 5, 6, 7],
            "pwm": ["PWM-CONTROLLER-1"]
        }
    },
    {
        "name": "PWM-CONTROLLER-2",
        "values": {
            "gpio": [8, 9, 10, 11],
            "pwm": ["PWM-CONTROLLER-2"]
        }
    },
    {
        "name": "UNDEFINED-0",
        "values": {
            "gpio": [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
        }
    },
    {
        "name": "ISU0",
        "values": {
            "gpio": [26, 27, 28, 29, 30],
            "i2cmaster": ["ISU0"],
            "spimaster": ["ISU0"],
            "uart": ["ISU0"]
        }
    },
    {
        "name": "ISU1",
        "values": {
            "gpio": [31, 32, 33, 34, 35],
            "i2cmaster": ["ISU1"],
            "spimaster": ["ISU1"],
            "uart": ["ISU1"]
        }
    },
    {
        "name": "ISU2",
        "values": {
            "gpio": [36, 37, 38, 39, 40],
            "i2cmaster": ["ISU2"],
            "spimaster": ["ISU2"],
            "uart": ["ISU2"]
        }
    },
    {
        "name": "ADC-CONTROLLER-0",
        "values": {
            "gpio": [41, 42, 43, 44, 45, 46, 47, 48],
            "adc": ["ADC-CONTROLLER-0"]
        }
    },
    {
        "name": "UNDEFINED-1",
        "values": {
            "gpio": [56, 57, 58, 59, 60, 61, 6, 63, 64, 65]
        }
    },
    {
        "name": "I2S0",
        "values": {}
    },
    {
        "name": "I2S1",
        "values": {}
    },
    {
        "name": "ISU3",
        "values": {
            "gpio": [66, 67, 68, 69, 70],
            "i2cmaster": ["ISU3"],
            "spimaster": ["ISU3"],
            "uart": ["ISU3"]
        }
    },
    {
        "name": "ISU4",
        "values": {
            "gpio": [71, 72, 73, 74, 75],
            "i2cmaster": ["ISU4"],
            "spimaster": ["ISU4"],
            "uart": ["ISU4"]
        }
    },
    // NOTE: (DOBO) While present in mt3620.json, GPIO08 is missing from the Mediatek MT3620 datasheet
    {
        "name": "UNDEFINED-2",
        "values": {
            "gpio": [80]
        }
    }
];

export { CONTROLLERS, Controller };
