'use strict';
var Promise = require('bluebird');

function RpcServer(client, options) {
  this._client = client;
  this._logger = options.logger;
  this._methodHandlers = {};
}

// public API
RpcServer.prototype.bind = function(methodName, method) {
  if (typeof methodName === 'function') {
    method = methodName;
    methodName = method.name;
  }

  if (this._methodHandlers.hasOwnProperty(methodName))
    throw new Error('Duplicate method bound: ' + methodName);
  this._methodHandlers[methodName] = method;
};

RpcServer.prototype.initialize = function(context) {
  var self = this;
  return this._client.createReceiver('amq.topic', {
      attach: {
        receiverSettleMode: 'settle',
        subject: 'brawbs'
      },
      creditQuantum: 1
    })
    .then(function(receiver) {
      self._receiver = receiver;
      receiver.on('message', function(m) { self._processMessage(receiver, m); });
      receiver.on('errorReceived', function(err) { self._logger.error(err); });
    });
};

// private API
RpcServer.prototype._respond = function(replyTo, correlationId, response) {
  if (response === null || response === undefined) return;
  return this._client.createSender(replyTo)
    .then(function(sender) {
      return sender.send(response, {
        properties: { correlationId: correlationId }
      });
    });
};

RpcServer.prototype._processMessage = function(receiver, message) {
  message.properties = message.properties || {};
  var controlMessage =
        (typeof message.body === 'string') ? JSON.parse(message.body) : message.body,
      method = controlMessage.method,
      replyTo = message.properties.replyTo || 'amq.topic',
      correlationId = message.properties.correlationId || 0;

  if (!this._methodHandlers.hasOwnProperty(method)) {
    this._logger.error('invalid action requested: ' + method);
    receiver.reject(message);
    return;
  }

  // indicate that the message was received, and will now be processed
  receiver.accept(message);

  var methodHandler = this._methodHandlers[method];
  var result = methodHandler(message, controlMessage);
  if (!(result instanceof Promise)) result = Promise.resolve(result);

  var self = this;
  return result
    .then(function(result) { return self._respond(replyTo, correlationId, result); })
    .error(function(err) { self._logger.error(err); });
};

module.exports = RpcServer;
