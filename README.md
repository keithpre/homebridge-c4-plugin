# homebridge-c4-plugin

This plugin for homebridge allows you to control your control4 devices using
Siri/Homekit on iOS. This plugin is very early state and right now only supports
lights/dimmers and thermostat.

This does two-way sync so any changes made using switches or control4 app will
be reflected in Homekit in few seconds.

How To:
--------
- Install homebridge - https://github.com/nfarina/homebridge
- Install Web2Way driver in Control4 - https://github.com/keithpre/control4-2way-web-driver
- Git checkout this plugin
- install this plugin ("npm run build")  ("npm install .")
- Reboot homebridge
- Setup the ip address and poll time in config.json.

Known Issues:
--------------
- Changing thermostat mode is not working (The property is read only, if you figure this out let me know)


Sample Homebridge Config:
--------------------------
~~~~
"platforms": [
    {
        "base_url": "http://10.0.1.70:9000",
        "refresh": 5000,
        "platform": "C4DynamicPlatform"
    }
],
~~~~

Adding More Device types:
-------------------------
You need to add new device file similar to src/devices/light.js. For each variable
the device supports, you need to the following:
- Driver file name
- Characteristic mapping from hap-nodejs
- Value convertors from and to control4 values to homebridge values.
Once you have the new type, add it to the dynamic-platform.ts
var light = require('./devices/light');
var thermostat = require('./devices/thermostat');
var devicesTypes: baseDevice.BaseDevice[] = [light, thermostat]

npm run build
npm install
