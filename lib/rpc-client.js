'use strict';
var Promise = require('bluebird'),
    uuid = require('uuid'),
    errors = require('./errors'),
    u = require('./utilities');

function RpcClient(client, options) {
  options = options || {};
  this._client = client;
  this._logger = options.logger;
  this._receiver = null;
  this._sender = null;
  this._requests = {};
  this._timeout = options.timeout || 5000;
  this._responseLinkParameters = !!options.responseAddress ?
    [ options.responseAddress ] : [ null, { attach: { source: { dynamic: true } } } ];
}

/**
 * Connect to a broker creating a dynamic link for responses
 */
RpcClient.prototype.connect = function(address, options) {
  options = options || {};
  var self = this;
  return Promise.all([
    self._client.createReceiver.apply(self._client, self._responseLinkParameters),
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

  // add timeout as TTL, if it exists
  if (!!this._timeout) {
    request.header = {};
    request.header.ttl = this._timeout;
  }

  // support call with raw request objects { method: 'method', params: [] }
  if (u.isPlainObject(method) && method.hasOwnProperty('method') ||
      Array.isArray(method)) {
    request.body = method;
    return this._sendRequest(correlator, request);
  }

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
 * @param {String|Object} methodOrRequest the method or raw request to call on the remote endpoint
 * @param {Array|Object}  paramsOrOverrides parameters to call the method with remotely, or link overrides
 */
RpcClient.prototype.notify = function(method, params) {
  // support call with raw request objects { method: 'method', params: [] }
  if (u.isPlainObject(method) && method.hasOwnProperty('method') ||
      Array.isArray(method)) {
    var notification = {};
    if (u.isPlainObject(params)) notification = params;
    notification.body = method;

    if (notification.hasOwnProperty('properties') && !!notification.properties.replyTo) {
      throw new errors.BadRequestError('notify must not have a replyTo');
    }

    return this._sender.send(notification);
  }

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
      .then(function() {
        self._requests[correlator] = { resolve: resolve, reject: reject };
        self._requests[correlator].timeoutId = setTimeout(function() {
          if (self._requests.hasOwnProperty(correlator)) {
            self._requests[correlator].reject(new errors.RequestTimeoutError());
            delete self._requests[correlator];
          }
        }, self._timeout);
      })
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

  var request = this._requests[correlationId];

  // disable timeout check if necessary
  if (request.hasOwnProperty('timeoutId')) {
    clearTimeout(request.timeoutId);
  }

  if (Array.isArray(message.body)) {  // batch response?
    var response = message.body.map(function(r) {
      return r.hasOwnProperty('result') ? r.result :
              r.hasOwnProperty('error') ? r.error : undefined;
    });

    // @todo: what do we do with interleaved errors?
    request.resolve(response);
  } else if (message.body.hasOwnProperty('result')) {
    request.resolve(message.body.result);
  } else if (message.body.hasOwnProperty('error')) {
    request.reject(errors.wrapProtocolError(message.body.error));
  } else {
    // invalid message - maybe should reject with a custom error?
    request.reject(message);
  }

  delete this._requests[correlationId];
};

module.exports = RpcClient;
