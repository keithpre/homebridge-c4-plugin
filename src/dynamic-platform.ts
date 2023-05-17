import http, {IncomingMessage, Server, ServerResponse} from "http";
import {
  API,
  APIEvent,
  CharacteristicEventTypes,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
  CharacteristicValue,
  DynamicPlatformPlugin,
  HAP,
  Logging,
  PlatformAccessory,
  PlatformAccessoryEvent,
  PlatformConfig,
} from "homebridge";

var pollingtoevent = require('polling-to-event');
var request = require("request");
var url = require('url');


import * as baseDevice from './devices/base';
var light = require('./devices/light');
var thermostat = require('./devices/thermostat');
var devicesTypes: baseDevice.BaseDevice[] = [light, thermostat]

const PLUGIN_NAME = "homebridge-c4-plugin";
const PLATFORM_NAME = "C4DynamicPlatform";

// Some C4 Keys
const nameKey = "deviceName";
const roomKey = "roomName";
const idKey = "id";
const currentValue = "currentValue";

interface deviceContext {
  [key: string]: string;
}
interface RequestCallback { (error: any, response: http.IncomingMessage, body: any): void }
interface GetVariableCallback { (error: any, result: any): void }
interface GetVariablesCallback { (error: any, result: any, accessory: PlatformAccessory, deviceType: baseDevice.BaseDevice): void }

let hap: HAP;
let Accessory: typeof PlatformAccessory;

export = (api: API) => {
  hap = api.hap;
  Accessory = api.platformAccessory;
  api.registerPlatform(PLATFORM_NAME, C4DynamicPlatform);
};

class C4DynamicPlatform implements DynamicPlatformPlugin {

  private readonly log: Logging;
  private readonly api: API;
  private readonly config: PlatformConfig;
  private readonly baseURL: String;
  private readonly accessories: PlatformAccessory[] = [];
  private lastResult: {[uuid: string]: {[id: string]: any} | undefined;};
  private refreshInterval: number;
  private skipUpdate: boolean; //This is used by the polling mechanism to silently update the values in homekit.

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;
    this.config = config;
    this.baseURL = config.base_url
    this.lastResult = {}
    this.skipUpdate = false
    this.refreshInterval = config.refresh || 5000;

    log.info("C4DynamicPlatform Initializing");

    api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      this.findAccesories();

      // Setup Polling
      if (this.refreshInterval > 0) {
        var statePoll = pollingtoevent(
          function(this: C4DynamicPlatform, callback: GetVariablesCallback) {
            for(let accessory of this.accessories) {
              var foundDeviceType!: baseDevice.BaseDevice
              for(var deviceType of devicesTypes){
                if(accessory.context[baseDevice.driverFileNameKey] == deviceType.driverFileNameKey) {
                  foundDeviceType = deviceType;
                }
              }
              this.getState(accessory, foundDeviceType.variableMappingsKey, function(this: C4DynamicPlatform, accessory: PlatformAccessory, deviceType: baseDevice.BaseDevice, error: any, result: any) {
                  callback(null, result, accessory, deviceType)
              }.bind(this, accessory, foundDeviceType), false);
            }
          }.bind(this)
          ,
          { interval: this.refreshInterval }
        );
        statePoll.on("poll", function(this: C4DynamicPlatform, result: any, accessory: PlatformAccessory, deviceType: baseDevice.BaseDevice) {
          if (!result) {
            this.log.error("error fetching values");
          }
          this.skipUpdate = true;
          for (var variableName in deviceType.variableMappingsKey) {
              if(result[variableName]) {
                var characteristic = accessory.getService(deviceType.serviceKey)!.getCharacteristic(deviceType.variableMappingsKey[variableName].characteristic);
                characteristic.setValue(result[variableName]);
              }
          }
          this.skipUpdate = false;

        }.bind(this));
        statePoll.on("error", function(this: C4DynamicPlatform, error: any) {
          this.log.error(error.message);
        }.bind(this));
      }
    });
  }

  findAccesories() {
    this.log.info("Calling Control4 Device to find accessories " + this.baseURL);

    var deviceURL = url.parse(this.baseURL);
    deviceURL.query = {
      command: "getdevices",
    };
    request.get({
      url: deviceURL.format(deviceURL),
      body: "",
      method: "GET",
      json:true
    },
    function(this: C4DynamicPlatform, error: any, response: http.IncomingMessage, body: any) {
      if(!error) {
        // Iterate through devices
        for(let key in body){
          //Skip the success key by checking if we have an object (instead of true)
          if(typeof body[key] == "object" && "driverFileName" in body[key]){
            // Store the proxy id in the dictionary for context
            body[key]['id'] = key

            // Match based on type
            for(var deviceType of devicesTypes){
              if(body[key][baseDevice.driverFileNameKey] == deviceType.driverFileNameKey) {
                // Check for the cached accessory
                let found = false
                for(let existing of this.accessories) {
                  // Match to existing devices
                  if(existing.context[nameKey] == body[key][nameKey] &&
                     existing.context[roomKey] == body[key][roomKey] &&
                      existing.context[idKey] == body[key][idKey] ) {
                          found = true;
                  }
                }
                if(found == false) {
                  this.log("Found New Device")
                  this.log(body[key])
                  // Add if the device is new
                  this.addAccessory(body[key])
                }
              }
            }
          }
        }
      } else {
        this.log.error("Failed to initialize C4 accessories with error " + error);
      }
    }.bind(this));
  }

configureAccessory(accessory: PlatformAccessory): void {
    //this.log("Configuring accessory %s with context %s", accessory.displayName, accessory.context)

    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log("%s identified!", accessory.displayName);
    });
    var foundDeviceType!: baseDevice.BaseDevice

    for(var deviceType of devicesTypes){
      if(accessory.context[baseDevice.driverFileNameKey] == deviceType.driverFileNameKey) {
        foundDeviceType = deviceType;
      }
    }
    if(foundDeviceType == undefined) {
      this.log.error("Configuring accessory %s Failed, no matching device type", accessory.displayName);
      return;
    }
    this.configureAccessoryWithDeviceType(accessory, foundDeviceType)
}

configureAccessoryWithDeviceType(accessory: PlatformAccessory,deviceType: baseDevice.BaseDevice): void {
    // Let's map the variables
    for(var variableName in deviceType.variableMappingsKey) {
        var mapping: baseDevice.VariableMapping = deviceType.variableMappingsKey[variableName];
        var characteristic = accessory.getService(deviceType.serviceKey)!.getCharacteristic(mapping.characteristic);
        characteristic.on('get', this.getStateVariable.bind(this, accessory, variableName, mapping, deviceType));
        if (!mapping.readOnly) {
          characteristic.on('set', this.setStateVariable.bind(this, accessory, variableName, mapping, deviceType));
        }
        if (mapping.props) {
          characteristic.setProps(mapping.props);
        }
    }
    this.accessories.push(accessory);
  }


setStateVariable (accessory: PlatformAccessory, variableName:string, mapping: baseDevice.VariableMapping, deviceType: baseDevice.BaseDevice, value: CharacteristicValue, callback: CharacteristicSetCallback) {
  if (this.skipUpdate) {
    // We are called to update inside of our polling method.
    // Do nothing so that we don't trigger the normally update logic recursively.
    callback();
    return;
  }

  if(this.lastResult[accessory.UUID] && this.lastResult[accessory.UUID]![variableName] == value) {
    // We double check that the property actually changes.
    // This is primarily for the light that has 2 properties mapped to the same one.   (on and brightness)
    // Homekit will sometimes send us changes for both and we need to make sure we don't set brightness always to 100 when we get an On command.
    callback();
    return
  }
  this.lastResult[accessory.UUID]![variableName] = value
  var variableID = mapping.variableID;

  if (mapping.derived && mapping.getVariableIDForSet) {
    // This is used for some thermostat values.  It needs to map a value onto either cold or hot.
    variableID = mapping.getVariableIDForSet(
      value,
      this.lastResult[accessory.UUID],
    );
  }

  this.setDeviceVariable(
    accessory,
    variableID,
    mapping.toConverter(value),
    function(this: C4DynamicPlatform, error:any, response: any, body:any) {
      if (error) {
        this.log.error("Set variable function failed for %s: %s", accessory.displayName,  error.message);
        callback(error);
      } else if (body.success == "true") {
          this.log("Set %s to %s", accessory.displayName, value);
          // Some variables don't like a value in the response
          callback(null)
          //callback(null, value);
      } else {
        this.log.error("Unable to set variable for %s", accessory.displayName);
        callback(new Error("Unable to set variable"));
      }
      //Refresh variables
      this.getState(accessory, deviceType.variableMappingsKey, function(this: C4DynamicPlatform, error: any, result: any) {
      }.bind(this), false);
    }.bind(this)
  );
};

addAccessory(context: deviceContext) {
  let name = context[nameKey]
  let room = context[roomKey]
  let id = context[idKey]
  this.log.info("Adding new accessory with name %s and room %s and id", name, room, id);

  // uuid must be generated from a unique but not changing data source, name should not be used in the most cases. But works in this specific example.
  const uuid = hap.uuid.generate(name + room + id);
  const accessory = new Accessory(name, uuid);
  accessory.context = context

  for(var deviceType of devicesTypes){
    if(context[baseDevice.driverFileNameKey] == deviceType.driverFileNameKey) {
      accessory.addService(deviceType.serviceKey, name);
      this.configureAccessory(accessory); // abusing the configureAccessory here
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}

getStateVariable(accessory: PlatformAccessory, variableName:string, mapping: baseDevice.VariableMapping, deviceType: baseDevice.BaseDevice, callback: GetVariableCallback) {
  this.getState(accessory, deviceType.variableMappingsKey, function(this: C4DynamicPlatform, error: any, result: any) {
    callback(error, result[variableName]);
  }.bind(this), true);
};


getState(accessory: PlatformAccessory, mapping: baseDevice.VariableMappings, callback: GetVariableCallback, useCached: boolean) {
  if (useCached && this.lastResult[accessory.UUID]) {
    callback(null, this.lastResult[accessory.UUID]);
    return;
  }
  var variablesToFetch = [];
  for (var variableName in mapping) {
    if (!mapping.hasOwnProperty(variableName)) {
      continue;
    }
    if (
      mapping[variableName].variableID &&
      variablesToFetch.indexOf(mapping[variableName].variableID) === -1
    ) {
      variablesToFetch.push(mapping[variableName].variableID);
    }
  }
  this.getDeviceVariables(
    accessory,
    variablesToFetch,
    function(this: C4DynamicPlatform, mapping: baseDevice.VariableMappings, error: any, response: http.IncomingMessage, body: any) {
      if (error) {
        this.log.error("Get state function failed: " + error.message);
        callback(error, {});
        return;
      }
      //this.log("Results %s", body)
      var result: { [id: string]: any; }  = {};
      for (var variableName  in mapping) {
        if (!mapping.hasOwnProperty(variableName)) {
          continue;
        }
        if (mapping[variableName].derived) {
          // compute the derived in second iteration
          continue;
        }
        result[variableName] = mapping[variableName].fromConverter(
          body[mapping[variableName].variableID]
        );
      }
      for (var variableName in mapping) {
        if (!mapping.hasOwnProperty(variableName)) {
          continue;
        }
        if (!mapping[variableName].derived) {
          // skip non-derived since already computed them
          continue;
        }
        result[variableName] = mapping[variableName].fromConverter(
          body[mapping[variableName].variableID],
          result
        );
      }
      this.lastResult[accessory.UUID] = result;
      callback(null, result);
    }.bind(this,  mapping)
  );
};

getDeviceVariables(accessory: PlatformAccessory, variableIDs:String[], callback:RequestCallback) {
  var deviceURL = url.parse(this.baseURL);
  deviceURL.query = {
    command: "get",
    proxyID: accessory.context[idKey],
    variableID: variableIDs.join(",")
  };

  request({
    url: deviceURL.format(deviceURL),
    body: "",
    method: "GET",
    json:true
  },
  function(error: any, response: http.IncomingMessage, body: any) {
    callback(error, response, body)
  })
};

setDeviceVariable(accessory: PlatformAccessory , variableID:String , newValue:String , callback:RequestCallback) {
  var deviceURL = url.parse(this.baseURL);
  deviceURL.query = {
    command: "set",
    proxyID: accessory.context[idKey],
    variableID: variableID,
    newValue: newValue
  };

  request({
    url: deviceURL.format(deviceURL),
    body: "",
    method: "GET",
    json:true
  },
  function(error: any, response: http.IncomingMessage, body: any) {
    callback(error, response, body)
  })
};

}
