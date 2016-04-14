'use strict';
var Promise = require('bluebird'),
    errors = require('./errors'),
    ProtocolError = errors.ProtocolError,
    u = require('./utilities');

function RpcServer(client, options) {
  this._client = client;
  this._logger = options.logger;
  this._methodHandlers = {};
}

// public API

/**
 * Binds a method to the server with provided method name or definition
 *
 * @param {String|Object|Function| methodNameOrDef the methods name or definition, optionally just a function with an accessible name
 * @param method the method implementation
 */
RpcServer.prototype.bind = function(methodNameOrDef, method) {
  var methodName, methodFunc;
  if (typeof methodNameOrDef === 'function') {
    if (methodNameOrDef.name === undefined || methodNameOrDef.name === null || methodNameOrDef.name === '')
      throw new errors.InvalidMethodNameError(methodNameOrDef.name);

    methodName = methodNameOrDef.name;
    methodFunc = methodNameOrDef;
  } else if (typeof methodNameOrDef === 'string') {
    methodName = methodNameOrDef;
    methodFunc = method;
  } else {
    // assume definition
    if (!methodNameOrDef.hasOwnProperty('method'))
      throw new errors.InvalidMethodDefinitionError('missing method name');

    methodName = methodNameOrDef.method;
    methodFunc = method;
  }

  if (this._methodHandlers.hasOwnProperty(methodName))
    throw new errors.DuplicateMethodError(methodName);

  this._methodHandlers[methodName] = {
    method: methodFunc,
    parameters: u.extractParameterNames(methodFunc)
  };
};

/**
 * Listens for rpc requests on the given address
 *
 * @param {String} address the address to listen on
 * @param {Object} [options] optional link creation parameters
 */
RpcServer.prototype.listen = function(address, options) {
  options = options || {};
  options.attach = options.attach || {};
  options.attach.receiverSettleMode = 'settle';
  options.creditQuantum = 1;

  var self = this;
  return this._client.createReceiver(address, options)
    .then(function(receiver) {
      self._receiver = receiver;
      receiver.on('message', function(m) { self._processMessage(receiver, m); });
      receiver.on('errorReceived', function(err) { self._logger.error(err); });
    });
};

// private API
RpcServer.prototype._respond = function(replyTo, correlationId, response) {
  if ((replyTo === null || replyTo === undefined &&
      correlationId === null || correlationId === undefined) ||
      response === null || response === undefined) return;

  var properties = {};
  if (!!correlationId) properties.correlationId = correlationId;
  return this._client.createSender(replyTo)
    .then(function(sender) { return sender.send(response, { properties: properties }); });
};

RpcServer.prototype._error = function(replyTo, correlationId, code, message) {
  var error = { error: { code: code, message: message } };
  if (replyTo === null || replyTo === undefined &&
      correlationId === null || correlationId === undefined) {
    return this._logger.error(error);
  }

  return this._respond(replyTo, correlationId, {
    error: { code: code, message: message }
  });
};

RpcServer.prototype._processMessage = function(receiver, message) {
  if (!u.assertProperties(message, this._logger, ['body']))
    return receiver.modify(message, { undeliverableHere: true });

  message.properties = message.properties || {};
  var replyTo = message.properties.replyTo,
      correlationId = message.properties.correlationId;

  // indicate that the message was received, and will now be processed
  receiver.accept(message);

  var controlMessage;
  if (typeof message.body === 'string') {
    try {
      controlMessage = JSON.parse(message.body);
    } catch (err) {
      return this._error(replyTo, correlationId, ProtocolError.ParseError, err.message);
    }
  } else {
    controlMessage = message.body;
  }

  if (!controlMessage.hasOwnProperty('method')) {
    return this._error(replyTo, correlationId, ProtocolError.InvalidRequest, 'Missing required property: method');
  }

  var method = controlMessage.method,
      params = controlMessage.params || [];
  if (!this._methodHandlers.hasOwnProperty(method)) {
    return this._error(replyTo, correlationId, ProtocolError.MethodNotFound, 'No such method: ' + method);
  }

  var methodHandler = this._methodHandlers[method];
  if (!Array.isArray(params) && typeof params === 'object') { // convert to named parameters
    params = methodHandler.parameters.map(function(p) { return params[p]; });
  }

  var result = methodHandler.method.apply(null, params);
  if (!(result instanceof Promise)) result = Promise.resolve(result);

  var self = this;
  return result
    .then(function(result) {
      if (result === undefined) result = null;
      return self._respond(replyTo, correlationId, { result: result });
    })
    .error(function(err) { self._logger.error(err); });
};

module.exports = RpcServer;
