'use strict';
var Promise = require('bluebird'),
    amqp = require('amqp10'),
    rpc = require('../lib'),
    errors = rpc.Errors,
    ErrorCode = errors.ErrorCode,
    config = require('./config'),
    expect = require('chai').expect;

function TestFixture() {}
TestFixture.prototype.setup = function() {
  if (!!this.client) delete this.client;
  this.client = new amqp.Client();

  var self = this;
  return this.client.connect(config.address)
    .then(function() { return self.client.createReceiver('rpc.response'); })
    .then(function(receiver) { self.receiver = receiver; });
};

TestFixture.prototype.teardown = function() {
  var self = this;
  return this.client.disconnect()
    .then(function() {
      delete self.client;
      delete self.receiver;
    });
};

function expectResult(message, correlationId, result) {
  expect(message.properties).to.exist;
  expect(message.properties.correlationId).to.eql(correlationId);
  expect(message.body).to.exist;
  expect(message.body).to.have.key('result');
  expect(message.body.result).to.eql(result);
}

function expectError(message, correlationId, code, errorMessage) {
  expect(message.properties).to.exist;
  expect(message.properties.correlationId).to.eql(correlationId);
  expect(message.body).to.exist;
  expect(message.body).to.have.key('error');
  var error = message.body.error;
  expect(error.code).to.eql(code);
  if (errorMessage instanceof RegExp) {
    expect(error.message).to.match(errorMessage);
  } else {
    expect(error.message).to.eql(errorMessage);
  }
}

var test = new TestFixture();
describe('server', function() {

describe('errors', function() {
  before(function() { amqp.use(rpc()); });
  beforeEach(function() { return test.setup(); });
  afterEach(function() { return test.teardown(); });

  it('should throw an error when trying to bind a duplicate method', function() {
   return test.client.createRpcServer('rpc.request')
      .then(function(server) {
        server.bind('testMethod', function() {});
        expect(function() {
          server.bind('testMethod', function() {});
        }).to.throw(errors.DuplicateMethodError);
      });
  });

  it('should throw an error when trying to bind an anonymous function', function() {
   return test.client.createRpcServer('rpc.request')
      .then(function(server) {
        expect(function() {
          server.bind(function() {});
        }).to.throw(errors.InvalidMethodNameError);
      });
  });

  it('should throw an error when trying to bind a method with no name in definition', function() {
   return test.client.createRpcServer('rpc.request')
      .then(function(server) {
        expect(function() {
          server.bind({ validation: [] }, function() {});
        }).to.throw(errors.InvalidMethodDefinitionError);
      });
  });

  it('should return an error if request body is not an object', function(done) {
    test.receiver.on('message', function(m) {
      expectError(m, 'llama', ErrorCode.ParseError, /Unexpected token i/);
      done();
    });

    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createSender('rpc.request')
    ])
    .spread(function(server, sender) {
      return sender.send('invalid message', {
        properties: { replyTo: 'rpc.response', correlationId: 'llama' }
      });
    });
  });

  it('should return an error if no method was provided', function(done) {
    test.receiver.on('message', function(m) {
      expectError(m, 'llama', ErrorCode.InvalidRequest, 'Missing required property: method');
      done();
    });

    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createSender('rpc.request')
    ])
    .spread(function(server, sender) {
      return sender.send({ mthd: 'testMethod' }, {
        properties: { replyTo: 'rpc.response', correlationId: 'llama' }
      });
    });
  });

  it('should print errors to log if no replyTo or correlationId exist', function(done) {
    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createSender('rpc.request')
    ])
    .spread(function(server, sender) {
      server._logger = {
        error: function(m) {
          expect(m).to.exist;
          done();
        }
      };

      return sender.send({ mthd: 'testMethod' });
    });
  });

  it('should catch operational errors and return them as error responses', function(done) {
    test.receiver.on('message', function(m) {
      expectError(m, 'llama', ErrorCode.InternalError, 'an error occurred');
      done();
    });

    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createSender('rpc.request')
    ])
    .spread(function(server, sender) {
      server.bind('testMethod', function() {
        var err = new Error('an error occurred');
        err.isOperational = true;
        throw err;
      });

      return sender.send({ method: 'testMethod' }, {
        properties: { replyTo: 'rpc.response', correlationId: 'llama' }
      });
    });
  });

}); // errors

describe('basic behavior', function() {
  before(function() { amqp.use(rpc()); });
  beforeEach(function() { return test.setup(); });
  afterEach(function() { return test.teardown(); });

  it('should allow binding a method to an rpc server', function(done) {
    test.receiver.on('message', function(m) { expectResult(m, 'llama', null); done(); });
    test.client.createRpcServer('rpc.request')
      .then(function(server) {
        server.bind('testMethod', function() {});
        return test.client.createSender('rpc.request');
      })
      .then(function(sender) {
        return sender.send({ method: 'testMethod' }, {
          properties: { replyTo: 'rpc.response', correlationId: 'llama' }
        });
      });
  });

  it('should allow binding a named method to an rpc server', function(done) {
    test.receiver.on('message', function(m) { expectResult(m, 'llama', null); done(); });
    test.client.createRpcServer('rpc.request')
      .then(function(server) {
        server.bind(function testMethod() {});
        return test.client.createSender('rpc.request');
      })
      .then(function(sender) {
        return sender.send({ method: 'testMethod' }, {
          properties: { replyTo: 'rpc.response', correlationId: 'llama' }
        });
      });
  });

  it('should allow binding a method to an rpc server using a definition object', function(done) {
    test.receiver.on('message', function(m) { expectResult(m, 'llama', null); done(); });
    test.client.createRpcServer('rpc.request')
      .then(function(server) {
        server.bind({ method: 'testMethod' }, function() {});
        return test.client.createSender('rpc.request');
      })
      .then(function(sender) {
        return sender.send({ method: 'testMethod' }, {
          properties: { replyTo: 'rpc.response', correlationId: 'llama' }
        });
      });
  });

  it('should allow binding a method with parameters', function(done) {
    test.receiver.on('message', function(m) { expectResult(m, 'llama', null); done(); });
    test.client.createRpcServer('rpc.request')
      .then(function(server) {
        server.bind('testMethod', function(one, two, three) {
          expect(one).to.eql(1);
          expect(two).to.eql('two');
          expect(three).to.eql([1, 2, 3]);
        });

        return test.client.createSender('rpc.request');
      })
      .then(function(sender) {
        return sender.send({ method: 'testMethod', params: [1, 'two', [1,2,3]] }, {
          properties: { replyTo: 'rpc.response', correlationId: 'llama' }
        });
      });
  });

  it('should allow binding a method with parameters (by name)', function(done) {
    test.receiver.on('message', function(m) { expectResult(m, 'llama', null); done(); });
    test.client.createRpcServer('rpc.request')
      .then(function(server) {
        server.bind('testMethod', function(one, two, three) {
          expect(one).to.eql(1);
          expect(two).to.eql('two');
          expect(three).to.eql([1, 2, 3]);
        });

        return test.client.createSender('rpc.request');
      })
      .then(function(sender) {
        return sender.send({
          method: 'testMethod',
          params: { three: [1,2,3], two: 'two', one: 1 }
        }, {
          properties: { replyTo: 'rpc.response', correlationId: 'llama' }
        });
      });
  });

  it('should return valid responses for valid requests', function(done) {
    test.receiver.on('message', function(m) {
      expectResult(m, 'llama', 'hello world');
      done();
    });

    test.client.createRpcServer('rpc.request')
      .then(function(server) {
        server.bind('testMethod', function() { return 'hello world'; });
        return test.client.createSender('rpc.request');
      })
      .then(function(sender) {
        return sender.send({ method: 'testMethod' }, {
          properties: { replyTo: 'rpc.response', correlationId: 'llama' }
        });
      });
  });

  it('should support Promises returned from bound method', function(done) {
    test.receiver.on('message', function(m) {
      expectResult(m, 'llama', 'hello world');
      done();
    });

    test.client.createRpcServer('rpc.request')
      .then(function(server) {
        server.bind('testMethod', function() { return Promise.resolve('hello world'); });
        return test.client.createSender('rpc.request');
      })
      .then(function(sender) {
        return sender.send({ method: 'testMethod' }, {
          properties: { replyTo: 'rpc.response', correlationId: 'llama' }
        });
      });
  });

  it('should not return a value for notifications (no replyTo or correlationId)', function(done) {
    test.receiver.on('message', function(m) { expect(m).to.not.exist; });
    test.client.createRpcServer('rpc.request')
      .then(function(server) {
        server.bind('testMethod', function() {
          setTimeout(done, 50);
          return 'hello world';
        });

        return test.client.createSender('rpc.request');
      })
      .then(function(sender) { return sender.send({ method: 'testMethod' }); });
  });

  it('should return value to broadcast request (with replyTo, no correlationId)', function(done) {
    test.receiver.on('message', function(m) {
      expectResult(m, null, 'hello world');
      done();
    });

    test.client.createRpcServer('rpc.request')
      .then(function(server) {
        server.bind('testMethod', function() { return 'hello world'; });
        return test.client.createSender('rpc.request');
      })
      .then(function(sender) {
        return sender.send({ method: 'testMethod' }, {
          properties: { replyTo: 'rpc.response' }
        });
      });
  });

  it('should bypass normal response if result is an rpc request', function(done) {
    var resultRequest = { method: 'anotherMethod', params: [] };
    test.receiver.on('message', function(m) {
      expect(m.properties).to.exist;
      expect(m.properties.correlationId).to.eql('llama');
      expect(m.body).to.exist;
      expect(m.body).to.not.have.key('result');
      expect(m.body).to.eql(resultRequest);
      done();
    });

    test.client.createRpcServer('rpc.request')
      .then(function(server) {
        server.bind('testMethod', function() { return { method: 'anotherMethod', params: [] }; });
        return test.client.createSender('rpc.request');
      })
      .then(function(sender) {
        return sender.send({ method: 'testMethod' }, {
          properties: { replyTo: 'rpc.response', correlationId: 'llama' }
        });
      });
  });

}); // basic behavior

describe('batch messages', function() {
  before(function() { amqp.use(rpc()); });
  afterEach(function() { return test.teardown(); });
  beforeEach(function() {
    return test.setup()
      .then(function() { return test.client.createRpcServer('rpc.request'); })
      .then(function(server) {
        server.bind('firstMethod', function() { return 1; });
        server.bind('secondMethod', function() { return 'two'; });
        server.bind('thirdMethod', function() { return true; });
      });
  });

  it('should support batch messages', function(done) {
    test.receiver.on('message', function(m) {
      expect(m.properties).to.exist;
      expect(m.properties.correlationId).to.eql('llama');
      expect(m.body).to.exist;
      expect(m.body).to.be.instanceof(Array);
      expect(m.body[0].result).to.eql(1);
      expect(m.body[1].result).to.eql('two');
      expect(m.body[2].result).to.eql(true);
      done();
    });

    test.client.createSender('rpc.request')
      .then(function(sender) {
        return sender.send([
          { method: 'firstMethod' },
          { method: 'secondMethod' },
          { method: 'thirdMethod' },
        ], {
          properties: { replyTo: 'rpc.response', correlationId: 'llama' }
        });
      });
  });

  it('should support errors within batch messages', function(done) {
    test.receiver.on('message', function(m) {
      expect(m.properties).to.exist;
      expect(m.properties.correlationId).to.eql('llama');
      expect(m.body).to.exist;
      expect(m.body).to.be.instanceof(Array);
      expect(m.body[0].result).to.eql(1);
      expect(m.body[1]).to.have.key('error');
      expect(m.body[2].result).to.eql(true);
      done();
    });

    test.client.createSender('rpc.request')
      .then(function(sender) {
        return sender.send([
          { method: 'firstMethod' },
          { method: 'zecondMerthad' },
          { method: 'thirdMethod' },
        ], {
          properties: { replyTo: 'rpc.response', correlationId: 'llama' }
        });
      });
  });

}); // batch messages

describe('validation', function() {
  before(function() { amqp.use(rpc()); });
  beforeEach(function() {
    return test.setup()
      .then(function() { return test.client.createRpcServer('rpc.request'); })
      .then(function(server) {
        test.server = server;
        test.server.bind({
          method: 'testMethod',
          params: {
            type: 'object',
            properties: {
              one: { type: 'integer', minimum: 1900, maximum: 2013, exclusiveMaximum: true },
              two: { type: 'string' },
              three: { type: 'boolean' }
            },
            required: [ 'two', 'three' ]
          }
        }, function(one, two, three) {
          return true;
        });
      });
  });

  afterEach(function() {
    return test.teardown()
      .then(function() { delete test.server; });
  });

  describe('errors', function() {
    it('should throw an error when defining validations for unknown parameters', function() {
      expect(function() {
        test.server.bind({
          method: 'invalid',
          params: {
            type: 'object',
            properties: {
              one: { type: 'string' }
            },
            required: [ 'one' ]
          }
        }, function(first) {});
      }).to.throw(errors.InvalidValidationDefinitionError);
    });
  });

  it('should allow validating parameters based on schema', function(done) {
    test.receiver.on('message', function(m) {
      expect(m.body).to.have.key('result');
      expect(m.body.result).to.equal(true);
      done();
    });

    test.client.createSender('rpc.request')
      .then(function(sender) {
        return sender.send({ method: 'testMethod', params: [ 1901, 'two', false ] }, {
          properties: { replyTo: 'rpc.response', correlationId: 'llama' }
        });
      });
  });

  it('should return an error if validation fails', function(done) {
    test.receiver.on('message', function(m) {
      expect(m.body).to.have.key('error');
      done();
    });

    test.client.createSender('rpc.request')
      .then(function(sender) {
        return sender.send({ method: 'testMethod', params: [ 'notANumber', -1, 'notABoolean' ] }, {
          properties: { replyTo: 'rpc.response', correlationId: 'llama' }
        });
      });
  });

}); // validation

describe('interceptor', function() {
  before(function() { amqp.use(rpc()); });
  beforeEach(function() { return test.setup(); });
  afterEach(function() { return test.teardown(); });

  it('should allow users to intercept the request process (for custom disposition)', function(done) {
    var received = 0;
    test.receiver.on('message', function(m) { done('this should not happen'); });
    var interceptor = function(receiver, message, request) {
      if (received === 0) {
        receiver.release(message);
        received++;
        return false;
      }

      receiver.accept(message);
      process.nextTick(function() { done(); });
      return false;
    };

    Promise.all([
      test.client.createRpcServer('rpc.request.queue', { interceptor: interceptor }),
      test.client.createSender('rpc.request.queue')
    ])
    .spread(function(server, sender) {
      server.bind({
        method: 'testInterceptor'
      }, function() { return true; });

      return sender.send({ method: 'testInterceptor', params: [ 'notANumber' ] }, {
        properties: { replyTo: 'rpc.response', correlationId: 'llama' }
      });
    });
  });

  it('should allow method-level interceptors', function(done) {
    var received = 0;
    test.receiver.on('message', function(m) { done('this should not happen'); });
    var interceptor = function(receiver, message, request) {
      if (received === 0) {
        receiver.release(message);
        received++;
        return false;
      }

      receiver.accept(message);
      process.nextTick(function() { done(); });
      return false;
    };

    Promise.all([
      test.client.createRpcServer('rpc.request.queue'),
      test.client.createSender('rpc.request.queue')
    ])
    .spread(function(server, sender) {
      server.bind({
        method: 'testInterceptor',
        interceptor: interceptor
      }, function() { return true; });

      return sender.send({ method: 'testInterceptor', params: [ 'notANumber' ] }, {
        properties: { replyTo: 'rpc.response', correlationId: 'llama' }
      });
    });
  });

}); // interceptor

}); // server
