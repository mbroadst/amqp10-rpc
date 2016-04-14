'use strict';
var Promise = require('bluebird'),
    uuid = require('uuid'),
    u = require('./utilities');

function RpcClient(client, options) {
  this._client = client;
  this._logger = options.logger;
  this._receiver = null;
  this._sender = null;
  this._requests = {};
}

/**
 * Connect to a broker creating a dynamic link for responses
 */
RpcClient.prototype.connect = function(address, options) {
  options = options || {};
  var self = this;
  return Promise.all([
    self._client.createReceiver(null, { attach: { source: { dynamic: true } } }),
    self._client.createSender(address, options)
  ])
  .spread(function(receiver, sender) {
    self._receiver = receiver;
    self._sender = sender;

    receiver.on('message', self._processMessage.bind(self));
    receiver.on('errorReceived', function(err) {
      var _keys = Object.keys(self.requests), _len = _keys.length;
      for (var i = 0; i < _len; ++i) {
        self._requests[_keys[i]].reject(err);
        delete self._requests[_keys[i]];
      }
    });
  });
};

/**
 * Make an rpc call to a remote endpoint
 *
 * @params method   the method to call on the remote endpoint
 * @param params    parameters to call the method with remotely
 */
RpcClient.prototype.call = function(method, params) {
  var correlator = uuid.v4().replace(/-/g, '');
  var request = {
    properties: {
      replyTo: this._receiver.remote.attach.source.address,
      correlationId: correlator
    },
    body: {
      method: method
    }
  };

  if (arguments.length > 2) {
    var args = new Array(arguments.length);
    for (var i = 0, ii = args.length; i < ii; ++i) args[i] = arguments[i];
    request.body.params = args.slice(1);
  } else if (!!params) {
    request.body.params = u.isPlainObject(params) ? params : [ params ];
  }

  return this._sendRequest(correlator, request);
};

/**
 * Make an rpc call without a correlation id
 *
 * @param method    the method to call on the remote endpoint
 * @param params    parameters to call the method with remotely
 */
RpcClient.prototype.notify = function(method, params) {
  var request = { body: { method: method } };
  if (arguments.length > 2) {
    var args = new Array(arguments.length);
    for (var i = 0, ii = args.length; i < ii; ++i) args[i] = arguments[i];
    request.body.params = args.slice(1);
  } else if (!!params) {
    request.body.params = u.isPlainObject(params) ? params : [ params ];
  }

  return this._sender.send(request);
};

// private api
RpcClient.prototype._sendRequest = function(correlator, request) {
  var self = this;
  return new Promise(function(resolve, reject) {
    self._sender.send(request)
      .then(function() { self._requests[correlator] = { resolve: resolve, reject: reject }; })
      .catch(function(err) { reject(err); });
  });
};

RpcClient.prototype._processMessage = function(message) {
  var correlationId = message.properties.correlationId;
  if (correlationId === undefined || correlationId === null) {
    this._logger.error('message lacks correlation-id');
    return;
  }

  if (!this._requests.hasOwnProperty(correlationId)) {
    this._logger.error('invalid correlation-id: ', correlationId);
    return;
  }

  if (message.body.hasOwnProperty('result')) {
    this._requests[correlationId].resolve(message.body.result);
  } else if (message.body.hasOwnProperty('error')) {
    this._requests[correlationId].reject(message.body.error);
  } else {
    // invalid message - maybe should reject with a custom error?
    this._requests[correlationId].reject(message);
  }

  delete this._requests[correlationId];
};

module.exports = RpcClient;
