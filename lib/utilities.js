'use strict';
var u = module.exports = {};

/**
 * Asserts that given properties exist on an incoming message
 *
 * @param section     the message section (or message) to check properties against
 * @param log         the logger used for error notification
 * @param properties  the properties to check against the input
 * @return whether the properties exist
 */
u.assertProperties = function(section, log, properties) {
  var result = true;
  for (var i = 0, ii = properties.length; i < ii; ++i) {
    if (!section.hasOwnProperty(properties[i])) {
      log.error('message missing property: ', properties[i]);
      result = false;
    }
  }

  return result;
};

// NOTE: shamelessly ripped from:
//  http://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically-from-javascript.
//  this will have issues with default parameters (as noted in the SO page), filed for "TODO"
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;

/**
 * Extract parameter names from a function
 */
u.extractParameterNames = function(func) {
  var fnStr = func.toString().replace(STRIP_COMMENTS, '');
  var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
  if (result === null) return [];
  return result;
};

/**
 * Determines whether passed value is a plain object
 */
u.isPlainObject = function(obj) {
  return Object.prototype.toString.call(obj) === '[object Object]';
};
