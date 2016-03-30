'use strict';
var Promise = require('bluebird'),
    errors = require('./errors'),
    u = require('./utilities');

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
  if (response === null || response === undefined) return;
  return this._client.createSender(replyTo)
    .then(function(sender) {
      return sender.send(response, {
        properties: { correlationId: correlationId }
      });
    });
};

RpcServer.prototype._processMessage = function(receiver, message) {
  if (!u.assertProperties(message, this._logger, ['properties', 'body']))
    return receiver.modify(message, { undeliverableHere: true });
  if (!u.assertProperties(message.properties, this._logger, ['contentType', 'replyTo', 'correlationId']))
    return receiver.modify(message, { undeliverableHere: true });

  var replyTo = (!!message.properties && message.properties.hasOwnProperty('replyTo')) ?
      message.properties.replyTo : 'amq.topic',
    correlationId = (!!message.properties && message.properties.hasOwnProperty('correlationId')) ?
      message.properties.correlationId : 0;

  // indicate that the message was received, and will now be processed
  receiver.accept(message);

  var controlMessage;
  if (typeof message.body === 'string') {
    try {
      controlMessage = JSON.parse(message.body);
    } catch (err) {
      return this._respond(replyTo, correlationId, {
        error: {
          code: errors.ParseError,
          message: err.message
        }
      });
    }
  } else {
    controlMessage = message.body;
  }

  if (!controlMessage.hasOwnProperty('method')) {
    return this._respond(replyTo, correlationId, {
      error: {
        code: errors.InvalidRequest,
        message: 'Missing required property: method'
      }
    });
  }

  var method = controlMessage.method;
  if (!this._methodHandlers.hasOwnProperty(method)) {
    return this._respond(replyTo, correlationId, {
      error: {
        code: errors.MethodNotFound,
        message: 'No such method: ' + method
      }
    });
  }

  var methodHandler = this._methodHandlers[method];
  var result = methodHandler(message, controlMessage);
  if (!(result instanceof Promise)) result = Promise.resolve(result);

  var self = this;
  return result
    .then(function(result) { return self._respond(replyTo, correlationId, result); })
    .error(function(err) { self._logger.error(err); });
};

module.exports = RpcServer;
