'use strict';
var Promise = require('bluebird'),
    amqp = require('amqp10'),
    rpc = require('../lib'),
    errors = require('../lib/errors'),
    ErrorCode = errors.ErrorCode,
    config = require('./config'),
    expect = require('chai').expect;

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

}); // call

describe('notify', function() {
  before(function() { amqp.use(rpc()); });
  beforeEach(function() { return test.setup(); });
  afterEach(function() { return test.teardown(); });

  it('should support notification', function(done) {
    return Promise.all([
      test.client.createRpcServer('rpc.request'),
      test.client.createRpcClient('rpc.request')
    ])
    .spread(function(server, client) {
      server.bind('testNotification', done);
      return client.notify('testNotification');
    });
  });

  it('should support notification with a single parameter', function(done) {
    return Promise.all([
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
    return Promise.all([
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
    return Promise.all([
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
    return Promise.all([
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
    return Promise.all([
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

  it('should support batch notifications', function(done) {
    return Promise.all([
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

}); // errors

}); // client
