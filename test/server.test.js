'use strict';
var Promise = require('bluebird'),
    amqp = require('amqp10'),
    rpc = require('../lib'),
    errors = require('../lib/errors'),
    ProtocolError = errors.ProtocolError,
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
  expect(error.message).to.eql(errorMessage);
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
        }).to.throw('Duplicate method bound: testMethod');
      });
  });

  it('should return an error if request body is not an object', function(done) {
    test.receiver.on('message', function(m) {
      expectError(m, 'llama', ProtocolError.ParseError, 'Unexpected token i');
      done();
    });

    return Promise.all([
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
      expectError(m, 'llama', ProtocolError.InvalidRequest, 'Missing required property: method');
      done();
    });

    return Promise.all([
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
    return Promise.all([
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

}); // errors

describe('basic behavior', function() {
  before(function() { amqp.use(rpc()); });
  beforeEach(function() { return test.setup(); });
  afterEach(function() { return test.teardown(); });

  it('should allow binding a method to an rpc server', function(done) {
    test.receiver.on('message', function(m) { expectResult(m, 'llama', null); done(); });
    return test.client.createRpcServer('rpc.request')
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

  it('should allow binding a method with parameters', function(done) {
    test.receiver.on('message', function(m) { expectResult(m, 'llama', null); done(); });
    return test.client.createRpcServer('rpc.request')
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
    return test.client.createRpcServer('rpc.request')
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

    return test.client.createRpcServer('rpc.request')
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

  it('should not return a value for notifications (no replyTo or correlationId)', function(done) {
    test.receiver.on('message', function(m) { expect(m).to.not.exist; });
    return test.client.createRpcServer('rpc.request')
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

    return test.client.createRpcServer('rpc.request')
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

}); // basic behavior

}); // server
