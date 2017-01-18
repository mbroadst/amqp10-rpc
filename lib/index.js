'use strict';
var RpcServer = require('./rpc-server'),
    RpcClient = require('./rpc-client');

module.exports = function(options) {
  options = options || {};
  var logger = options.logger || console;

  return function(Client) {
    Client.prototype.createRpcServer = function(address, options) {
      options = options || {};
      var serverOptions = { logger: logger };
      if (options.hasOwnProperty('interceptor')) {
        serverOptions.interceptor = options.interceptor;
        delete options.interceptor;
      }

      if (options.hasOwnProperty('completionInterceptor')) {
        serverOptions.completionInterceptor = options.completionInterceptor;
        delete options.completionInterceptor;
      }

      if (options.hasOwnProperty('ignoreUnknownMethods')) {
        serverOptions.ignoreUnknownMethods = options.ignoreUnknownMethods;
        delete options.ignoreUnknownMethods;
      }

      var server = new RpcServer(this, serverOptions);
      return server.listen(address, options)
        .then(function() { return server; });
    };

    Client.prototype.createRpcClient = function(address, options) {
      options = options || {};
      var clientOptions = { logger: logger };
      if (!!options.responseAddress) {
        clientOptions.responseAddress = options.responseAddress;
        delete options.responseAddress;
      }

      if (!!options.timeout) {
        clientOptions.timeout = options.timeout;
        delete options.timeout;
      }

      var client = new RpcClient(this, clientOptions);
      return client.connect(address, options)
        .then(function() { return client; });
    };
  };
};

module.exports.Errors = require('./errors');
