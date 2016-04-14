'use strict';
var util = require('util'),
    errors = module.exports = {};

errors.ProtocolError = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603
};

/**
 * The base error all amqp10-rpc Errors inherit from.
 *
 * @constructor
 * @alias Error
 */
errors.BaseError = function() {
  var tmp = Error.apply(this, arguments);
  tmp.name = this.name = 'AmqpRpcError';

  this.message = tmp.message;
  if (Error.captureStackTrace)
    Error.captureStackTrace(this, this.constructor);
};
util.inherits(errors.BaseError, Error);

/**
 * An error thrown when an attempt to bind a duplicate method is made.
 *
 * @param method the method bound to the server
 * @extends BaseError
 * @constructor
 */
errors.DuplicateMethodError = function(method) {
  errors.BaseError.call(this, 'Duplicate method bound: ' + method);
  this.name = 'AmqpRpcDuplicateMethodError';
};
util.inherits(errors.DuplicateMethodError, errors.BaseError);

/**
 * An error thrown when an attempt to bind a method with an invalid name
 *
 * @param method the method bound to the server
 * @extends BaseError
 * @constructor
 */
errors.InvalidMethodNameError = function(name) {
  errors.BaseError.call(this, 'Invalid method name: ' + name);
  this.name = 'AmqpRpcInvalidMethodNameError';
};
util.inherits(errors.InvalidMethodNameError, errors.BaseError);

/**
 * An error thrown when an attempt to bind a method with an invalid definition
 *
 * @param method the method bound to the server
 * @extends BaseError
 * @constructor
 */
errors.InvalidMethodDefinitionError = function(message) {
  errors.BaseError.call(this, 'Invalid method definiton: ' + message);
  this.name = 'AmqpRpcInvalidMethodDefinitionError';
};
util.inherits(errors.InvalidMethodDefinitionError, errors.BaseError);


/**
 * An error thrown when an attempt to bind a method with an invalid validation definition
 *
 * @param method the method bound to the server
 * @extends BaseError
 * @constructor
 */
errors.InvalidValidationDefinitionError = function(message) {
  errors.BaseError.call(this, 'Invalid validation definiton: ' + message);
  this.name = 'AmqpRpcInvalidValidationDefinitionError';
};
util.inherits(errors.InvalidValidationDefinitionError, errors.BaseError);
