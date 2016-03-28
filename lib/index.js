'use strict';
var RpcServer = require('./rpc-server');

module.exports = function(options) {
  options = options || {};
  var logger = options.logger || console;

  return function(Client) {
    Client.prototype.createRpcServer = function(address, options) {
      var server = new RpcServer(this, { logger: logger });
      return server.initialize()
        .then(function() { return server; });
    };
  };
};
