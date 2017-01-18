'use strict';
var Promise = require('bluebird'),
    Ajv = require('ajv'),
    errors = require('./errors'),
    ErrorCode = errors.ErrorCode,
    u = require('./utilities');

function RpcServer(client, options) {
  options = options || {};
  this._client = client;
  this._logger = options.logger;
  this._ignoreUnknownMethods = options.ignoreUnknownMethods || false;
  this._methodHandlers = {};
  this._ajv = new Ajv({
    v5: true,
    allErrors: true,
    coerceTypes: true,
    removeAdditional: true,
    ownProperties: true
  });

  if (options.hasOwnProperty('interceptor') && typeof options.interceptor === 'function') {
    this._interceptor = options.interceptor;
  }

  if (options.hasOwnProperty('completionInterceptor') &&
      typeof options.completionInterceptor === 'function') {
    this._completionInterceptor = options.completionInterceptor;
  }

}

// public API

/**
 * Binds a method to the server with provided method name or definition
 *
 * @param {String|Object|Function| methodNameOrDef the methods name or definition, optionally just a function with an accessible name
 * @param method the method implementation
 */
RpcServer.prototype.bind = function(methodNameOrDef, method) {
  var methodName, methodFunc, methodValidations, interceptor;
  if (typeof methodNameOrDef === 'function') {
    if (methodNameOrDef.name === undefined ||
        methodNameOrDef.name === null || methodNameOrDef.name === '')
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
    if (methodNameOrDef.hasOwnProperty('params')) {
      methodValidations = methodNameOrDef.params;
    }

    if (methodNameOrDef.hasOwnProperty('interceptor')) {
      interceptor = methodNameOrDef.interceptor;
    }
  }

  var parameterNames = u.extractParameterNames(methodFunc);
  var methodDefinition = {
    method: methodFunc,
    parameters: parameterNames
  };

  if (!!interceptor) {
    methodDefinition.interceptor = interceptor;
  }

  if (!!methodValidations) {
    if (!u.isPlainObject(methodValidations)) {
      throw new errors.InvalidValidationDefinitionError('not a plain object');
    }

    if (!methodValidations.hasOwnProperty('properties')) {
      throw new errors.InvalidValidationDefinitionError('missing `properties`');
    }

    // do a basic check to see if we know about all named parameters
    Object.keys(methodValidations.properties).map(function(p) {
      var idx = parameterNames.indexOf(p);
      if (idx === -1)
        throw new errors.InvalidValidationDefinitionError('unknown parameter "' + p + '"');
    });

    methodDefinition.validate = this._ajv.compile(methodValidations);
  }

  if (this._methodHandlers.hasOwnProperty(methodName)) {
    throw new errors.DuplicateMethodError(methodName);
  }

  this._methodHandlers[methodName] = methodDefinition;
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
  if (response === null || response === undefined) return;
  if (response.hasOwnProperty('error') &&
      response.error.code === ErrorCode.MethodNotFound && !!this._ignoreUnknownMethods) {
    return;
  }

  if ((replyTo === null || replyTo === undefined &&
      correlationId === null || correlationId === undefined)) {
    if (response.hasOwnProperty('error')) return this._logger.error(response);
    return;
  }

  var properties = {};
  if (!!correlationId) properties.correlationId = correlationId;
  return this._client.createSender(replyTo)
    .then(function(sender) { return sender.send(response, { properties: properties }); });
};

function formatError(error) {
  error = error || {};

  var errorData = {};
  errorData.code = error.hasOwnProperty('code') ? error.code : ErrorCode.InternalError;
  errorData.message = error.hasOwnProperty('message') ? error.message : 'Internal error';
  errorData.data = error.hasOwnProperty('data') ? error.data : error;
  return { error: errorData };
}

function formatResponse(response) {
  if (response && response.hasOwnProperty('method')) {
    return response;
  }

  return { result: (response === undefined) ? null : response };
}

RpcServer.prototype._processMessage = function(receiver, message) {
  if (!u.assertProperties(message, this._logger, ['body']))
    return receiver.modify(message, { undeliverableHere: true });

  var self = this;
  message.properties = message.properties || {};
  var replyTo = message.properties.replyTo,
      correlationId = message.properties.correlationId;

  var request;
  if (typeof message.body === 'string') {
    try {
      request = JSON.parse(message.body);
    } catch (err) {
      return this._respond(replyTo, correlationId,
        { error: new errors.ParseError(err.message, message.body) });
    }
  } else {
    request = message.body;
  }

  if (!!this._interceptor) {
    var shouldContinue = this._interceptor(receiver, message, request);
    if (shouldContinue === false) return;
  }

  // support for batch requests
  if (Array.isArray(request)) {
    // interceptors are not supported in batch requests, so we always
    // accept the message here
    receiver.accept(message);

    return Promise.reduce(request, function(result, r) {
      return Promise.try(function() {
        var requestData =
          self._processRequest(replyTo, correlationId, r);
        return requestData[0].method.apply(null, requestData[1]);
      })
      .then(function(response) { return formatResponse(response); })
      .error(function(err) { return formatError(err); })
      .then(function(response) {
        result.push(response);
        return result;
      });
    }, [])
    .then(function(response) {
      if (!!self._completionInterceptor) {
        var shouldContinue = self._completionInterceptor(receiver, message, request, response);
        if (shouldContinue === false) return;
      }

      return self._respond(replyTo, correlationId, response);
    });
  }

  // normal requests
  var response =
    Promise.try(function() {
      var requestData =
        self._processRequest(replyTo, correlationId, request);

      if (!!requestData[0].interceptor) {
        var shouldContinue =
          requestData[0].interceptor(receiver, message, requestData[1]);
        if (shouldContinue === false) return;
      }

      // make the actuall request call
      return requestData[0].method.apply(null, requestData[1]);
    });

  return response
    .then(function(response) { return formatResponse(response); })
    .error(function(err) {
      receiver.accept(message);
      return formatError(err);
    })
    .then(function(response) {
      if (!!self._completionInterceptor) {
        var shouldContinue = self._completionInterceptor(receiver, message, request, response);
        if (shouldContinue === false) return;
      }

      // indicate that the message was received, and processed
      receiver.accept(message);

      return self._respond(replyTo, correlationId, response);
    });
};

RpcServer.prototype._processRequest = function(replyTo, correlationId, request) {
  if (!request.hasOwnProperty('method')) {
    throw new errors.InvalidRequestError('Missing required property: method', {
      source: { replyTo: replyTo, request: request }
    });
  }

  var method = request.method,
      params = request.params || [];
  if (!this._methodHandlers.hasOwnProperty(method)) {
    throw new errors.MethodNotFoundError(method, {
      source: { replyTo: replyTo, request: request }
    });
  }

  var methodHandler = this._methodHandlers[method];
  if (Array.isArray(params)) { // convert to named parameters
    params = methodHandler.parameters.reduce(function(obj, p, idx) {
      obj[p] = idx > params.length ? null : params[idx];
      return obj;
    }, {});
  }

  if (!!methodHandler.validate && typeof methodHandler.validate === 'function') {
    var valid = methodHandler.validate(params);
    if (!valid) {
      throw new errors.InvalidParamsError('Validation Error', {
        source: { replyTo: replyTo, request: request },
        messages: methodHandler.validate.errors
      });
    }
  }

  var args = methodHandler.parameters.map(function(p) { return params[p]; });
  return [ methodHandler, args ];
};

module.exports = RpcServer;
