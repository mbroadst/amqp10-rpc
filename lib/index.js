'use strict';
var RpcServer = require('./rpc-server'),
    RpcClient = require('./rpc-client');

module.exports = function(options) {
  options = options || {};
  var logger = options.logger || console;

  return function(Client) {
    Client.prototype.createRpcServer = function(address, options) {
      var server = new RpcServer(this, { logger: logger });
      return server.listen(address, options)
        .then(function() { return server; });
    };

    Client.prototype.createRpcClient = function(address, options) {
      var client = new RpcClient(this, { logger: logger });
      return client.connect(address, options)
        .then(function() { return client; });
    };
  };
};
