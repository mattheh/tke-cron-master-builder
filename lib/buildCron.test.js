'use strict';

var proxyquire = require('proxyquire').noCallThru();
var chai = require('chai');
var expect = chai.expect;
var sinon = require('sinon');
var moment = require('moment');
var Promise = require('bluebird');

describe(__filename, function() {

  var _sut; // system under test
  var CRON = 'cron-master';
  var MONGO = 'rhmap-mongodb';
  var LOG = 'tke-logger';
  var requires;
  var mockJob;
  var mockCleanUpJob;

  beforeEach(function() {

    mockJob = {
      on: sinon.stub(),
      meta: {
        name: 'Mock Job',
        id: '123Id'
      },
      _opts: {
        cronParams: {
          cronTime: '* * * * * *'
        }
      }
    };

    mockCleanUpJob = {
      on: sinon.stub(),
      meta: {
        name: 'Mock Clean Up Job',
        id: '456Id'
      }
    };

    requires = {
      'rhmap-mongodb': {
        insertOneStub: sinon.stub(),
        updateOneStub: sinon.stub(),
        removeStub: sinon.stub(),
        collection: function() {
          return Promise.resolve().then(function() {
            return {
              insertOne: requires[MONGO].insertOneStub,
              updateOne: requires[MONGO].updateOneStub,
              remove: requires[MONGO].removeStub
            };
          });
        }
      },
      'cron-master': {
        EVENTS: {
          TICK_STARTED: 'TICK_STARTED',
          TICK_COMPLETE: 'TICK_COMPLETE',
          TIME_WARNING: 'TIME_WARNING',
          OVERLAPPING_CALL: 'OVERLAPPING_CALL'
        },
        loadJobs: sinon.stub(),
        startJobs: sinon.stub(),
        CronMasterJob: sinon.stub()
      },
      'tke-logger': {
        infoStub: sinon.stub(),
        errorStub: sinon.stub(),
        warnStub: sinon.stub(),
        getLogger: function() {
          return {
            info: requires[LOG].infoStub,
            error: requires[LOG].errorStub,
            warn: requires[LOG].warnStub
          };
        }
      }
    };
  });

  beforeEach(function() {
    _sut = proxyquire('./buildCron.js', requires);
  });

  describe('#loadJobs', function() {

    it('should throw error when required params are not provided', function(done) {
      try {
        _sut();
      }
      catch(err) {
        expect(requires[CRON].loadJobs.callCount).to.be.eql(0);

        expect(err).to.exist;
        expect(err.message).to.be.eql('Error: \'cronConfigsDir\' and \'collection\' are required params.');
        done();
      }
    });

    it('should throw error when cron-master fails', function(done) {
      requires[CRON].loadJobs.yields({stuffs: 'broke'}, null);

      try {
        _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'});
      }
      catch(err) {
        expect(requires[CRON].loadJobs.calledOnce).to.be.true;
        expect(requires[CRON].loadJobs.getCall(0).args[0]).to.be.eql('/jobs');

        expect(err).to.exist;
        expect(err.message).to.be.eql('Failed to Load Cron Jobs: { stuffs: \'broke\' }');
        done();
      }
    });

    it('should throw error when there are no jobs in the selected folder', function(done) {
      requires[CRON].loadJobs.yields(null, []);

      try {
        _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'});
      }
      catch(err) {
        expect(requires[CRON].loadJobs.calledOnce).to.be.true;
        expect(requires[CRON].loadJobs.getCall(0).args[0]).to.be.eql('/jobs');

        expect(err).to.exist;
        expect(err.message).to.be.eql('Error: No jobs found in directoy: /jobs');
        done();
      }
    });

    it('Should load jobs from the jobs directory', function(done) {
      requires[CRON].loadJobs.yields(null, [mockJob]);
      requires[CRON].CronMasterJob.returns(mockCleanUpJob);

      _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'});

      expect(requires[CRON].loadJobs.calledOnce).to.be.true;
      expect(requires[CRON].loadJobs.getCall(0).args[0]).to.be.eql('/jobs');

      expect(requires[CRON].CronMasterJob.calledOnce).to.be.true;

      // Initialize Logs
      expect(requires[LOG].infoStub.callCount).to.be.eql(3);
      expect(requires[LOG].infoStub.getCall(0).args[0]).to.be.eql('Initialising Cron jobs in directory: %s');
      expect(requires[LOG].infoStub.getCall(0).args[1]).to.be.eql('/jobs');
      expect(requires[LOG].infoStub.getCall(1).args[0]).to.be.eql('Initialise Job: %s');
      expect(requires[LOG].infoStub.getCall(1).args[1]).to.be.eql(mockJob.meta.name);
      expect(requires[LOG].infoStub.getCall(2).args[0]).to.be.eql('Initialise Job: %s');
      expect(requires[LOG].infoStub.getCall(2).args[1]).to.be.eql(mockCleanUpJob.meta.name);

      expect(requires[CRON].startJobs.calledOnce).to.be.tue;

      done();
    });
  });

  describe('#createLogCleanUpJob', function() {

    it('should set a default value for logCleanUpOpts when no opts are provided', function(done) {
      requires[CRON].loadJobs.yields(null, [mockJob]);
      requires[CRON].CronMasterJob.returns(mockCleanUpJob);
      requires[MONGO].removeStub.returns('blah');

      _sut('/jobs', 'CRON_LOGS');

      expect(requires[CRON].CronMasterJob.calledOnce).to.be.true;
      expect(requires[CRON].CronMasterJob.getCall(0).args[0].cronParams.cronTime).to.be.eql('* * 0 * * *');

      var cleanUpJob = requires[CRON].CronMasterJob.getCall(0).args[0].cronParams.onTick;

      cleanUpJob(null, function(err, res) {
        expect(err).to.not.exist;
        expect(res).to.be.eql('blah');

        expect(requires[MONGO].removeStub.calledOnce).to.be.true;
        //{'startTime': {$lt: logRetentionDate}}
        expect(requires[MONGO].removeStub.getCall(0).args[0].startTime).to.exist;

        // Date object for 10 Days ago
        var oldLogTime = moment().subtract(10 , 'd').toDate();
        // Date created from default retentionPeriod (7 days)
        var retentionDate = requires[MONGO].removeStub.getCall(0).args[0].startTime.$lt;

        expect(oldLogTime).to.be.below(retentionDate);
        done();
      });
    });

    it('should set a default value for logCleanUpOpts when only one opt is provided', function(done) {
      requires[CRON].loadJobs.yields(null, [mockJob]);
      requires[CRON].CronMasterJob.returns(mockCleanUpJob);
      requires[MONGO].removeStub.returns('blah');

      _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *'});

      expect(requires[CRON].CronMasterJob.calledOnce).to.be.true;
      expect(requires[CRON].CronMasterJob.getCall(0).args[0].cronParams.cronTime).to.be.eql('*/15 * * * * *');

      var cleanUpJob = requires[CRON].CronMasterJob.getCall(0).args[0].cronParams.onTick;

      cleanUpJob(null, function(err, res) {
        expect(err).to.not.exist;
        expect(res).to.be.eql('blah');

        expect(requires[MONGO].removeStub.calledOnce).to.be.true;
        //{'startTime': {$lt: logRetentionDate}}
        expect(requires[MONGO].removeStub.getCall(0).args[0].startTime).to.exist;

        // Date object for 10 Days ago
        var oldLogTime = moment().subtract(10 , 'd').toDate();
        // Date created from default retentionPeriod (7 days)
        var retentionDate = requires[MONGO].removeStub.getCall(0).args[0].startTime.$lt;

        expect(oldLogTime).to.be.below(retentionDate);
        done();
      });
    });

    it('should clean logs on provided frequency using startTime field and provided retentionPeriod', function(done) {
      requires[CRON].loadJobs.yields(null, [mockJob]);
      requires[CRON].CronMasterJob.returns(mockCleanUpJob);
      requires[MONGO].removeStub.returns('blah');

      _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'});

      expect(requires[CRON].loadJobs.calledOnce).to.be.true;
      expect(requires[CRON].loadJobs.getCall(0).args[0]).to.be.eql('/jobs');
      expect(requires[CRON].startJobs.calledOnce).to.be.tue;

      expect(requires[CRON].CronMasterJob.calledOnce).to.be.true;
      expect(requires[CRON].CronMasterJob.getCall(0).args[0].cronParams.cronTime).to.be.eql('*/15 * * * * *');

      var cleanUpJob = requires[CRON].CronMasterJob.getCall(0).args[0].cronParams.onTick;

      cleanUpJob(null, function(err, res) {
        expect(err).to.not.exist;
        expect(res).to.be.eql('blah');

        expect(requires[MONGO].removeStub.calledOnce).to.be.true;
        //{'startTime': {$lt: logRetentionDate}}
        expect(requires[MONGO].removeStub.getCall(0).args[0].startTime).to.exist;

        // Date object for 10 min ago
        var oldLogTime = moment().subtract(10 , 'm').toDate();
        // Date created from retentionPeriod
        var retentionDate = requires[MONGO].removeStub.getCall(0).args[0].startTime.$lt;

        expect(oldLogTime).to.be.below(retentionDate);
        done();
      });
    });
  });

  describe('#initialiseJob', function() {

    it('should register listiners for the TICK_STARTED, TICK_COMPLETE, TIME_WARNING, and OVERLAPPING_CALL Cron Events', function(done) {
      mockJob.on.yields({stuff: 'broke'}, null, 'right meow');

      requires[MONGO].insertOneStub.returns({insertedId: '678'});

      requires[CRON].loadJobs.yields(null, [mockJob]);
      requires[CRON].CronMasterJob.returns(mockCleanUpJob);


      _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'});

      expect(mockJob.on.callCount).to.eql(4);
      expect(mockJob.on.getCall(0).args[0]).to.eql(requires[CRON].EVENTS.TICK_STARTED);
      expect(mockJob.on.getCall(1).args[0]).to.eql(requires[CRON].EVENTS.TICK_COMPLETE);
      expect(mockJob.on.getCall(2).args[0]).to.eql(requires[CRON].EVENTS.TIME_WARNING);
      expect(mockJob.on.getCall(3).args[0]).to.eql(requires[CRON].EVENTS.OVERLAPPING_CALL);

      done();
    });

    it('should log error on TICK_STARTED and TICK_COMPLETE if there is an error', function(done) {

      mockJob.on.yields({stuff: 'broke'}, null, 'right meow');

      requires[MONGO].insertOneStub.returns({insertedId: '678'});

      requires[CRON].loadJobs.yields(null, [mockJob]);
      requires[CRON].CronMasterJob.returns(mockCleanUpJob);


      _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'});

      // Error Logs
      expect(requires[LOG].errorStub.callCount).to.be.eql(2);
      expect(requires[LOG].errorStub.getCall(0).args[0]).to.be.eql({stuff: 'broke'});
      expect(requires[LOG].errorStub.getCall(0).args[1]).to.be.eql('Error running the cronJob on TICK_STARTED:');
      expect(requires[LOG].errorStub.getCall(0).args[2]).to.be.eql(mockJob.meta.name);
      expect(requires[LOG].errorStub.getCall(0).args[3]).to.be.eql('right meow');

      expect(requires[LOG].errorStub.getCall(1).args[0]).to.be.eql({stuff: 'broke'});
      expect(requires[LOG].errorStub.getCall(1).args[1]).to.be.eql('Error running the cronJob on TICK_COMPLETE:');
      expect(requires[LOG].errorStub.getCall(1).args[2]).to.be.eql(mockJob.meta.name);
      expect(requires[LOG].errorStub.getCall(1).args[3]).to.be.eql('right meow');

      done();
    });

    it('should insert Cron Job info to DB on TICK_STARTED', function(done) {
      requires[MONGO].insertOneStub.returns({insertedId: '678'});

      requires[CRON].loadJobs.yields(null, [mockJob]);
      requires[CRON].CronMasterJob.returns(mockCleanUpJob);


      _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'});

      expect(mockJob.on.getCall(0).args[0]).to.eql(requires[CRON].EVENTS.TICK_STARTED);
      var tickStartedFunc = mockJob.on.getCall(0).args[1];

      tickStartedFunc().then(function() {
        expect(requires[MONGO].insertOneStub.calledOnce).to.be.true;
        var insertData = requires[MONGO].insertOneStub.getCall(0).args[0];
        expect(insertData.name).to.be.eql(mockJob.meta.name);
        expect(insertData.finishTime).to.be.eql(null);
        expect(insertData.lastStatus).to.be.eql('In Process');
        expect(insertData.error).to.not.exist;

        done();
      });
    });

    it('should update Cron Job info to DB on TICK_COMPLETE', function(done) {
      requires[MONGO].updateOneStub.returns();

      requires[CRON].loadJobs.yields(null, [mockJob]);
      requires[CRON].CronMasterJob.returns(mockCleanUpJob);


      _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'});

      expect(mockJob.on.getCall(1).args[0]).to.eql(requires[CRON].EVENTS.TICK_COMPLETE);
      var tickCompleteFunc = mockJob.on.getCall(1).args[1];

      tickCompleteFunc().then(function() {
        expect(requires[MONGO].updateOneStub.calledOnce).to.be.true;
        var updateCall = requires[MONGO].updateOneStub.getCall(0);
        expect(updateCall.args[0]._id).to.be.eql(mockJob.meta.id);
        expect(updateCall.args[1].$set.lastStatus).to.be.eql('Success');
        expect(updateCall.args[1].$set.error).to.not.exist;
        expect(updateCall.args[2]).to.be.false;
        done();
      });
    });

    it('should update Cron Job info with error to DB on TICK_COMPLETE', function(done) {
      requires[MONGO].updateOneStub.returns();

      requires[CRON].loadJobs.yields(null, [mockJob]);
      requires[CRON].CronMasterJob.returns(mockCleanUpJob);


      _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'});

      expect(mockJob.on.getCall(1).args[0]).to.eql(requires[CRON].EVENTS.TICK_COMPLETE);
      var tickCompleteFunc = mockJob.on.getCall(1).args[1];

      tickCompleteFunc({stuff: 'broke'}).then(function() {
        expect(requires[MONGO].updateOneStub.calledOnce).to.be.true;
        var updateCall = requires[MONGO].updateOneStub.getCall(0).args[1].$set;
        expect(updateCall.lastStatus).to.be.eql('Failed');
        expect(updateCall.error).to.eql({stuff: 'broke'});
        done();
      });
    });

    it('should log a warning on TIME_WARNING', function(done) {
      requires[MONGO].updateOneStub.returns();

      requires[CRON].loadJobs.yields(null, [mockJob]);
      requires[CRON].CronMasterJob.returns(mockCleanUpJob);


      _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'});

      expect(mockJob.on.getCall(2).args[0]).to.eql(requires[CRON].EVENTS.TIME_WARNING);
      var warnFunc = mockJob.on.getCall(2).args[1];

      warnFunc();
      expect(requires[LOG].warnStub.calledOnce).to.be.true;
      expect(requires[LOG].warnStub.getCall(0).args[0]).to.eql('%s is taking longer than expected');
      expect(requires[LOG].warnStub.getCall(0).args[1]).to.eql(mockJob.meta.name);
      done();
    });

    it('should log a warning on OVERLAPPING_CALL', function(done) {
      requires[MONGO].updateOneStub.returns();

      requires[CRON].loadJobs.yields(null, [mockJob]);
      requires[CRON].CronMasterJob.returns(mockCleanUpJob);


      _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'});

      expect(mockJob.on.getCall(3).args[0]).to.eql(requires[CRON].EVENTS.OVERLAPPING_CALL);
      var warnFunc = mockJob.on.getCall(3).args[1];

      warnFunc();
      expect(requires[LOG].warnStub.calledOnce).to.be.true;
      expect(requires[LOG].warnStub.getCall(0).args[0]).to.contain('%s received a tick/call before the previous tick completed');
      expect(requires[LOG].warnStub.getCall(0).args[1]).to.eql(mockJob.meta.name);
      done();
    });
  });

});
