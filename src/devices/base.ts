var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var CharacteristicValue = require("hap-nodejs").CharacteristicValue;
export const driverFileNameKey = "driverFileName";
export const typeKey = "type";
export const variableMappingsKey = "variableMappings";
export const serviceKey = "service";


export interface ConverterFunctionFrom { (value: any, result?: { [id: string]: any; }): any }
export interface ConverterFunctionTo { (value: any): any }

export interface getVariableIDForSetFunction { (value: typeof CharacteristicValue, result: any): string }


export type VariableMapping = {
  "characteristic" : typeof Characteristic;
  "readOnly": boolean;
  "variableID" : string;
  fromConverter: ConverterFunctionFrom;
  toConverter: ConverterFunctionTo;
  "derived": boolean;
  "props"? : {[name: string]: any};
  getVariableIDForSet?: getVariableIDForSetFunction
}


export type VariableMappings = {
  [name: string]: VariableMapping;
}

export type BaseDevice = {
  typeKey: string
  driverFileNameKey: string;
  serviceKey: typeof Service;
  variableMappingsKey: VariableMappings;
}
