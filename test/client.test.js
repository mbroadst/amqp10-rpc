'use strict';
var Promise = require('bluebird'),
    amqp = require('amqp10'),
    rpc = require('../lib'),
    errors = rpc.Errors,
    ErrorCode = errors.ErrorCode,
    config = require('./config'),
    chai = require('chai'),
    expect = chai.expect;

chai.use(require('chai-as-promised'));

function TestFixture() {}
TestFixture.prototype.setup = function() {
  if (!!this.client) delete this.client;
  this.client = new amqp.Client();
  return this.client.connect(config.address);
};

TestFixture.prototype.teardown = function() {
  var self = this;
  return this.client.disconnect()
    .then(function() { delete self.client; });
};

var test = new TestFixture();
describe('client', function() {

describe('call', function() {
  before(function() { amqp.use(rpc()); });
  beforeEach(function() { return test.setup(); });
  afterEach(function() { return test.teardown(); });

  it('should support basic requests', function() {
    return Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testMethod', function() {});
      return client.call('testMethod');
    });
  });

  it('should support redirecting responses to predefined address', function(done) {
    Promise.all([
      test.client.createReceiver('rpc.response'),
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request', { responseAddress: 'rpc.response' })
    ])
    .spread(function(responseLink, server, client) {
      responseLink.on('message', function(msg) { done(); });
      server.bind('testMethod', function(one) { expect(one).to.eql(1); });
      return client.call('testMethod', 1);
    });
  });

  it('should support call with a single parameter', function() {
    return Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testMethod', function(one) { expect(one).to.eql(1); });
      return client.call('testMethod', 1);
    });
  });

  it('should support requests with params (array)', function() {
    return Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testMethod', function(one) { return one; });
      return client.call('testMethod', [ 1, 'two', false ]);
    })
    .then(function(result) { expect(result).to.eql([ 1, 'two', false ]); });
  });

  it('should support requests with params (named)', function() {
    return Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testMethod', function(one, two, three) { return [ one, two, three ]; });
      return client.call('testMethod', { two: 'two', three: false, one: 1 });
    })
    .then(function(result) { expect(result).to.eql([ 1, 'two', false ]); });
  });

  it('should support requests with params (spread)', function() {
    return Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testMethod', function(one, two, three) { return [ one, two, three ]; });
      return client.call('testMethod', 1, 'two', false);
    })
    .then(function(result) { expect(result).to.eql([ 1, 'two', false ]); });
  });

  it('should support raw rpc messages as first argument', function() {
    return Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testMethod', function(one, two, three) { return [ one, two, three ]; });
      return client.call({ method: 'testMethod', params: [ 1, 'two', false ]});
    })
    .then(function(result) { expect(result).to.eql([ 1, 'two', false ]); });
  });

  it('should support batch requests', function() {
    return Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testMethod', function(one, two, three) { return [ one, two, three ]; });
      return client.call([
        { method: 'testMethod', params: [ 1, 'two', false ] },
        { method: 'testMethod', params: [ 1, 'two', false ] }
      ]);
    })
    .then(function(result) {
      expect(result).to.eql([ [ 1, 'two', false ], [ 1, 'two', false ] ]);
    });
  });

  it('should support addresses with default subjects', function() {
    return Promise.all([
      test.client.createRpcServer('rpc.request/llama'),
      test.client.createRpcClient('rpc.request/llama')
    ])
    .spread(function(server, client) {
      server.bind('testMethod', function() {});
      return client.call('testMethod');
    });
  });
}); // call

describe('notify', function() {
  before(function() { amqp.use(rpc()); });
  beforeEach(function() { return test.setup(); });
  afterEach(function() { return test.teardown(); });

  it('should support notification', function(done) {
    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testNotification', done);
      return client.notify('testNotification');
    });
  });

  it('should support notification with a single parameter', function(done) {
    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testNotification', function(one) {
        expect(one).to.eql(1);
        done();
      });

      return client.notify('testNotification', 1);
    });
  });

  it('should support notification with params (array)', function(done) {
    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testNotification', function(one) {
        expect(one).to.eql([ 1, 'two', false ]);
        done();
      });

      return client.notify('testNotification', [ 1, 'two', false ]);
    });
  });

  it('should support notification with params (named)', function(done) {
    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testNotification', function(one, two, three) {
        expect(one).to.eql(1);
        expect(two).to.eql('two');
        expect(three).to.eql(false);
        done();
      });

      return client.notify('testNotification', { three: false, one: 1, two: 'two' });
    });
  });

  it('should support notification with params (spread)', function(done) {
    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testNotification', function(one, two, three) {
        expect(one).to.eql(1);
        expect(two).to.eql('two');
        expect(three).to.eql(false);
        done();
      });

      return client.notify('testNotification', 1, 'two', false);
    });
  });

  it('should support raw rpc messages as first argument', function(done) {
    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testNotification', function(one, two, three) {
        expect(one).to.eql(1);
        expect(two).to.eql('two');
        expect(three).to.eql(false);
        done();
      });

      return client.notify({ method: 'testNotification', params: [ 1, 'two', false ]});
    });
  });

  it('should support request overrides when sending a raw request', function(done) {
    Promise.all([
      test.client.createRpcClient('rpc.request'),
      test.client.createReceiver('rpc.request')
    ])
    .spread(function(client, receiver) {
      receiver.on('message', function(m) {
        expect(m.properties.subject).to.eql('donkeys');
        expect(m.body).to.eql({
          method: 'testNotification',
          params: [ 1, 'two', false ]
        });

        done();
      });

      return client.notify(
        { method: 'testNotification', params: [ 1, 'two', false ]},
        { properties: { subject: 'donkeys' } }
      );
    });
  });

  it('should support batch notifications', function(done) {
    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      var called = 0;
      server.bind('testNotification', function(one, two, three) {
        expect(one).to.eql(1);
        expect(two).to.eql('two');
        expect(three).to.eql(false);
        called++;
        if (called === 2) done();
      });

      return client.notify([
        { method: 'testNotification', params: [ 1, 'two', false ] },
        { method: 'testNotification', params: [ 1, 'two', false ] }
      ]);
    });
  });

}); // notify

describe('errors', function() {
  before(function() { amqp.use(rpc()); });
  beforeEach(function() { return test.setup(); });
  afterEach(function() { return test.teardown(); });

  it('should reject a call on error', function() {
    return Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) { return client.call('testMethod'); })
    .then(function() { expect(false).to.equal(true, 'this shouldnt happen'); })
    .catch(function(response) {
      expect(response).to.be.an.instanceOf(errors.MethodNotFoundError);
      expect(response).to.have.keys(['code', 'message', 'data']);
      expect(response.code).to.equal(ErrorCode.MethodNotFound);
      expect(response.message).to.equal('No such method: testMethod');
    });
  });

  it('should reject a call on request timeout', function() {
    return test.client.createRpcClient('rpc.request', { timeout: 50 })
      .then(function(client) {
        return expect(client.call('testMethod'))
          .to.be.rejectedWith(errors.RequestTimeoutError, 'Request timed out');
      });
  });

  it('should allow using RequestTimeoutError as a catch filter', function(done) {
    test.client.createRpcClient('rpc.request', { timeout: 50 })
      .then(function(client) { return client.call('testMethod'); })
      .catch(errors.RequestTimeoutError, function(err) {
        done();
      })
      .catch(function(err) {
        console.log(err);
        done('this should not be called');
      });
  });

  it('should throw an error if notify was used with a provided replyTo address (raw object)', function() {
    return test.client.createRpcClient('rpc.request', { timeout: 50 })
      .then(function(client) {
        expect(function() {
          client.notify({ method: 'testMethod' }, { properties: { replyTo: 'bad.dog' } });
        }).to.throw(errors.BadRequestError, 'notify must not have a replyTo');
      });
  });

}); // errors

describe('interceptor', function() {
  before(function() { amqp.use(rpc()); });
  beforeEach(function() { return test.setup(); });
  afterEach(function() { return test.teardown(); });

  it('should support a defined `interceptor` function for modification of the sent request', function(done) {
    var interceptor = function(client, correlator, request) {
      expect(request.body.params[0]).to.eql('llamas');
      request.body.params[0] = 'donkeys';
      return true;
    };

    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request', { interceptor: interceptor })
    ])
    .spread(function(server, client) {
      server.bind('testMethod', function(data) {
        expect(data).to.eql('donkeys');
        process.nextTick(function() { done(); });
      });

      return client.call('testMethod', 'llamas');
    });
  });

  it('should allow prevention of the sent request via an interceptor', function(done) {
    var interceptor = function(client, correlator, request) {
      process.nextTick(function() { done(); });
      return false;
    };

    Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request', { interceptor: interceptor })
    ])
    .spread(function(server, client) {
      server.bind('testMethod', function(data) { done('should not be called!'); });
      return client.call('testMethod', 'llamas');
    });
  });

});

}); // client
