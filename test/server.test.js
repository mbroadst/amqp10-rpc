'use strict';
var amqp = require('amqp10'),
    rpc = require('../lib'),
    expect = require('chai').expect;

var test = {};
describe('server', function() {
  before(function() { amqp.use(rpc()); });
  beforeEach(function() {
    if (!!test.client) delete test.client;
    test.client = new amqp.Client();
  });

  afterEach(function() {
    return test.client.disconnect()
      .then(function() { delete test.client; });
  });

  it('should put the lotion on', function() {
    expect('this').to.eql('that');
  });

});
