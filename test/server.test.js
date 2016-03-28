'use strict';
var amqp = require('amqp10'),
    rpc = require('../lib'),
    config = require('./config');

var test = {};
describe('server', function() {
  before(function() { amqp.use(rpc()); });
  beforeEach(function() {
    if (!!test.client) delete test.client;
    test.client = new amqp.Client();
    return test.client.connect(config.address);
  });

  afterEach(function() {
    return test.client.disconnect()
      .then(function() { delete test.client; });
  });

  it('should allow binding a method to an rpc server', function(done) {
    test.client.createRpcServer('amq.topic')
      .then(function(server) {
        server.bind('testMethod', function() { done(); });
        return test.client.createSender('amq.topic');
      })
      .then(function(sender) {
        return sender.send({ method: 'testMethod' });
      });
  });
});
