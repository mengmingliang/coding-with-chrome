/**
 * @fileoverview mbot event definitions.
 *
 * This api allows to read and control the Makeblock mBot kits with
 * bluetooth connection.
 *
 * @license Copyright 2016 Shenzhen Maker Works Co, Ltd. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @author wangyu@makeblock.cc (Yu Wang)
 */
goog.provide('cwc.protocol.makeblock.mBotRanger.Events');

goog.require('cwc.utils.EventData');


/**
 * Custom events.
 * @enum {string}
 */
cwc.protocol.makeblock.mBotRanger.Events.Type = {
  LIGHTNESS_SENSOR: 'CHANGED_LIGHTNESS',
  LINEFOLLOWER_SENSOR: 'CHANGED_LINEFOLLOWER',
  TEMPERATURE_SENSOR: 'CHANGED_TEMPERATURE',
  ULTRASONIC_SENSOR: 'CHANGED_ULTRASONIC',
};


/**
 * @param {Object} data
 * @param {number=} port
 * @return {!cwc.utils.EventData}
 * @final
 */
cwc.protocol.makeblock.mBotRanger.Events.LightnessSensorValue = function(data,
    port) {
  return new cwc.utils.EventData(
      cwc.protocol.makeblock.mBotRanger.Events.Type.LIGHTNESS_SENSOR,
      data, port);
};


/**
 * @param {Object} data
 * @param {number=} port
 * @return {!cwc.utils.EventData}
 * @final
 */
cwc.protocol.makeblock.mBotRanger.Events.LinefollowerSensorValue = function(
    data, port) {
  return new cwc.utils.EventData(
      cwc.protocol.makeblock.mBotRanger.Events.Type.LINEFOLLOWER_SENSOR,
      data, port);
};


/**
 * @param {Object|number} data
 * @param {number=} port
 * @return {!cwc.utils.EventData}
 * @final
 */
cwc.protocol.makeblock.mBotRanger.Events.TemperatureSensorValue = function(
    data, port) {
  return new cwc.utils.EventData(
      cwc.protocol.makeblock.mBotRanger.Events.Type.TEMPERATURE_SENSOR,
      data, port);
};


/**
 * @param {Object|number} data
 * @param {number=} port
 * @return {!cwc.utils.EventData}
 * @final
 */
cwc.protocol.makeblock.mBotRanger.Events.UltrasonicSensorValue = function(data,
    port) {
  return new cwc.utils.EventData(
      cwc.protocol.makeblock.mBotRanger.Events.Type.ULTRASONIC_SENSOR,
      data, port);
};
