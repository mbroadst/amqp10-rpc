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
