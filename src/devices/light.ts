var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
import * as baseDevice from './base';

let light: baseDevice.BaseDevice = {
  typeKey: "light",
  serviceKey : Service.Lightbulb,
  driverFileNameKey : "light_v2.c4i",
  variableMappingsKey  : {
    "state": {
      "characteristic" : Characteristic.On,
      "readOnly": false,
      "variableID" : "1001",
      fromConverter: function(value: any) {
        return value > 0 ;
      },
      toConverter: function(value: any) {
        return value ? 100 : 0;
      },
      "derived": false
    },
    "level": {
      "characteristic" : Characteristic.Brightness,
      "readOnly": false,
      "variableID" : "1001",
      fromConverter: function(value: any) {
        return parseInt(value);
      },
      toConverter: function(value: any) {
        return value;
      },
      "derived": false
    }
  }
}

module.exports = light;
