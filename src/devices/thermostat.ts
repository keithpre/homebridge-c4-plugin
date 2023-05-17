var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
import * as baseDevice from './base';

function fahrenheitToCelsius(temperature: number) {
  return (temperature - 32) / 1.8
}

function celsiusToFahrenheit(temperature: number) {
  return (temperature * 1.8) + 32
}

let thermostat: baseDevice.BaseDevice = {
  typeKey: "thermostat",
  serviceKey : Service.Thermostat,
  driverFileNameKey : "thermostatV2.c4i",
  variableMappingsKey  : {
    "unit": {
      "characteristic" : Characteristic.TemperatureDisplayUnits,
      "readOnly": true,
      "variableID" : "1100",
      fromConverter: function(value: any) {
        if (value === "FAHRENHEIT" || value === "F") {
          return Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
        } else {
          return Characteristic.TemperatureDisplayUnits.CELSIUS;
        }
      },
      toConverter: function(value: any) {
        return value;
      },
      "derived": false
    },
    "current_state": {
      "characteristic" : Characteristic.CurrentHeatingCoolingState,
      "readOnly": true,
      "variableID" : "1107",
      // 1107 seems to be read only in 2.10.6  The older 1000 variable seems to still work
      //"variableID" : "1107",
      fromConverter: function(value: any) {
        switch (value) {
          case "Heat":
            return Characteristic.CurrentHeatingCoolingState.HEAT;
          case "Cool":
            return Characteristic.CurrentHeatingCoolingState.COOL;
          default:
            return Characteristic.CurrentHeatingCoolingState.OFF;
        }
      },
      toConverter: function(value: any) {
        return value;
      },
      "derived": false
    },
    "target_state": {
      "characteristic" : Characteristic.TargetHeatingCoolingState,
      "variableID" : "1104",
      // 1107 seems to be read only in 2.10.6  The older 1000 variable seems to still work
      //"variableID" : "1107",
      "readOnly": false,
      fromConverter: function(value: any) {
        switch (value) {
          case "Heat":
            return Characteristic.TargetHeatingCoolingState.HEAT;
          case "Cool":
            return Characteristic.TargetHeatingCoolingState.COOL;
          case "Auto":
            return Characteristic.TargetHeatingCoolingState.AUTO;
          default:
            return Characteristic.TargetHeatingCoolingState.OFF;
        }
      },
      toConverter: function(value: any) {
        switch (value) {
          case Characteristic.TargetHeatingCoolingState.HEAT:
            return "Heat";
          case Characteristic.TargetHeatingCoolingState.COOL:
            return "Cool";
          case Characteristic.TargetHeatingCoolingState.AUTO:
            return "Auto";
          default:
            return "Off";
        }
      },
      "derived": false
    },
    "current_temperature": {
      "characteristic" : Characteristic.CurrentTemperature,
      "variableID" : "1130",
      "readOnly": true,
      "props": {
        format: Characteristic.Formats.FLOAT,
        unit: Characteristic.Units.CELSIUS,
        minStep: 0.5,
        minValue: 0,
        maxValue: 100
      },
      fromConverter: function(value: any) {
        return fahrenheitToCelsius(parseInt(value));
      },
      toConverter: function(value: any) {
        return Math.round(celsiusToFahrenheit(value));
      },
      "derived": false
    },
    "heatpoint": {
      "characteristic" : Characteristic.HeatingThresholdTemperature,
      "readOnly": false,
      "variableID" : "1132",
      "props": {
        format: Characteristic.Formats.FLOAT,
        unit: Characteristic.Units.CELSIUS,
        minStep: 0.5,
        minValue: 15,
        maxValue: 30
      },
      fromConverter: function(value: any) {
        return fahrenheitToCelsius(parseInt(value));
      },
      toConverter: function(value: any) {
        return Math.round(celsiusToFahrenheit(value));
      },
      "derived": false
    },
    "coolpoint": {
      "characteristic" : Characteristic.CoolingThresholdTemperature,
      "readOnly": false,
      "variableID" : "1134",
      "props": {
        format: Characteristic.Formats.FLOAT,
        unit: Characteristic.Units.CELSIUS,
        minStep: 0.5,
        minValue: 15,
        maxValue: 30
      },
      fromConverter: function(value: any) {
        return fahrenheitToCelsius(parseInt(value));
      },
      toConverter: function(value: any) {
        return Math.round(celsiusToFahrenheit(value));
      },
      "derived": false
    },
    "target_temperature": {
      "characteristic" : Characteristic.TargetTemperature,
      "readOnly": false,
      "derived": true,
      "variableID" : "1134",
      "props": {
        format: Characteristic.Formats.FLOAT,
        unit: Characteristic.Units.CELSIUS,
        minStep: 0.5,
        minValue: 15,
        maxValue: 30
      },
      fromConverter: function(value, result) {
        if (!result) {
          console.log('from converted undefined result')
          return;
        }
        var targetTemperature = null;
        var high = result["coolpoint"];
        var low = result["heatpoint"];
        var current = result["current_temperature"];
        switch (result.target_state) {
          case Characteristic.TargetHeatingCoolingState.HEAT:
            targetTemperature = low;
            break;
          case Characteristic.TargetHeatingCoolingState.COOL:
            targetTemperature = high;
            break;
          case Characteristic.TargetHeatingCoolingState.AUTO:
          case Characteristic.TargetHeatingCoolingState.OFF:
            if (current <= low) {
              targetTemperature = low;
            } else if (current >= high) {
              targetTemperature = high;
            } else {
              // set to nearest
              targetTemperature =  Math.abs(high - current) < Math.abs(current - low) ? high : low;
            }
            break;
        }
        if (!targetTemperature) {
          return;
        }
        return targetTemperature;
      },
      toConverter: function(value: any) {
        return Math.round(celsiusToFahrenheit(value));
      },
      getVariableIDForSet: function(value:any , result: { [id: string]: any; }) {
        var targetTemperature = null;
        var high = result["coolpoint"];
        var low = result["heatpoint"];
        var current = result["current_temperature"];
        switch (result.target_state) {
          case Characteristic.TargetHeatingCoolingState.HEAT:
            return "1132"; // variableIDs["heatpoint"];
          case Characteristic.TargetHeatingCoolingState.COOL:
            return "1134"; // variableIDs["coolpoint"];
          case Characteristic.TargetHeatingCoolingState.AUTO:
          case Characteristic.TargetHeatingCoolingState.OFF:
          default:
            if (Math.abs(high - current) < Math.abs(current - low)) {
              return "1134"; // variableIDs["coolpoint"];
            } else {
              return "1132"; // variableIDs["heatpoint"];
            }
        }
      }
    }
  }
}

module.exports = thermostat;
