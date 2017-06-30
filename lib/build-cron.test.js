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
  var HANDLERS = './event-handlers';
  var requires;
  var mockJob;
  var mockCleanUpJob;
  var handlerStubs;

  beforeEach(function() {
    handlerStubs = {
      onTickStarted: sinon.spy(),
      onTickComplete: sinon.spy(),
      onOverlappingCall: sinon.spy(),
      onTimeWarning: sinon.spy()
    };

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
      [MONGO]: {
        insertStub: sinon.stub(),
        updateStub: sinon.stub(),
        removeStub: sinon.stub(),
        collection: function() {
          return Promise.resolve({
            insert: requires[MONGO].insertStub,
            update: requires[MONGO].updateStub,
            remove: requires[MONGO].removeStub
          });
        }
      },
      [CRON]: {
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
      [HANDLERS]: sinon.stub().returns(handlerStubs)
    };
  });

  beforeEach(function() {
    _sut = proxyquire(__filename.replace('.test', ''), requires);
  });

  describe('#getHandlers', () => {
    it('should throw an error due to not passing a job', () => {
      expect(() => {
        _sut('/jobs', 'CRON_LOGS').getHandlers();
      }).to.throw('getHandlers must be passed a cron-master job instance');
    });

    it('should return an object with handlers', () => {
      expect(_sut('/jobs', 'CRON_LOGS').getHandlers({})).to.deep.equal(handlerStubs);
    });
  });

  describe('#attachEventHandlers', () => {
    it('should attach handlers to the passed "job"', () => {
      const job = {
        on: sinon.spy()
      };

      _sut('/jobs', 'CRON_LOGS').attachEventHandlers(job);

      expect(job.on.callCount).to.equal(4);
      expect(job.on.getCall(0).args[1]).to.equal(handlerStubs.onTickStarted);
      expect(job.on.getCall(1).args[1]).to.equal(handlerStubs.onTickComplete);
      expect(job.on.getCall(2).args[1]).to.equal(handlerStubs.onTimeWarning);
      expect(job.on.getCall(3).args[1]).to.equal(handlerStubs.onOverlappingCall);

      expect(job.on.getCall(0).args[0]).to.equal(requires[CRON].EVENTS.TICK_STARTED);
      expect(job.on.getCall(1).args[0]).to.equal(requires[CRON].EVENTS.TICK_COMPLETE);
      expect(job.on.getCall(2).args[0]).to.equal(requires[CRON].EVENTS.TIME_WARNING);
      expect(job.on.getCall(3).args[0]).to.equal(requires[CRON].EVENTS.OVERLAPPING_CALL);
    });
  });

  describe('#loadJobs', function() {

    it('should throw error when required params are not provided', function(done) {
      try {
        _sut();
      } catch (err) {
        expect(requires[CRON].loadJobs.callCount).to.be.eql(0);

        expect(err).to.exist;
        expect(err.message).to.be.eql('Error: \'cronConfigsDir\' and \'collectionName\' are required params.');
        done();
      }
    });

    it('should throw error when cron-master fails', function(done) {
      requires[CRON].loadJobs.yields({stuffs: 'broke'}, null);

      try {
        _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'}).loadJobs();
      } catch (err) {
        expect(requires[CRON].loadJobs.calledOnce).to.be.true;
        expect(requires[CRON].loadJobs.getCall(0).args[0]).to.be.eql('/jobs');

        expect(err).to.exist;
        expect(err.message).to.be.eql('Failed to Load Cron Jobs');
        done();
      }
    });

    it('should throw error when there are no jobs in the selected folder', function(done) {
      requires[CRON].loadJobs.yields(null, []);

      try {
        _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'}).loadJobs();
      } catch (err) {
        expect(requires[CRON].loadJobs.calledOnce).to.be.true;
        expect(requires[CRON].loadJobs.getCall(0).args[0]).to.be.eql('/jobs');

        expect(err).to.exist;
        expect(err.message).to.be.eql('No jobs found in directory: /jobs');
        done();
      }
    });

    it('Should load jobs from the jobs directory', function(done) {
      requires[CRON].loadJobs.yields(null, [mockJob]);
      requires[CRON].CronMasterJob.returns(mockCleanUpJob);

      _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'}).loadJobs();

      expect(requires[CRON].loadJobs.calledOnce).to.be.true;
      expect(requires[CRON].loadJobs.getCall(0).args[0]).to.be.eql('/jobs');
      expect(requires[CRON].CronMasterJob.calledOnce).to.be.true;
      expect(requires[CRON].startJobs.calledOnce).to.be.true;

      expect(requires[HANDLERS].called).to.be.true;
      expect(handlerStubs.onTickStarted.called).to.be.false;
      expect(handlerStubs.onTickComplete.called).to.be.false;
      expect(handlerStubs.onOverlappingCall.called).to.be.false;
      expect(handlerStubs.onTimeWarning.called).to.be.false;

      done();
    });
  });


  it('should set a default value for logCleanUpOpts when no opts are provided', function(done) {
    requires[CRON].loadJobs.yields(null, [mockJob]);
    requires[CRON].CronMasterJob.returns(mockCleanUpJob);
    requires[MONGO].removeStub.returns('blah');

    _sut('/jobs', 'CRON_LOGS').loadJobs();

    expect(requires[CRON].CronMasterJob.calledOnce).to.be.true;
    expect(requires[CRON].CronMasterJob.getCall(0).args[0].cronParams.cronTime).to.be.eql('* * 0 * * *');

    var cleanUpJob = requires[CRON].CronMasterJob.getCall(0).args[0].cronParams.onTick;

    cleanUpJob(null, function(err, res) {
      expect(err).to.not.exist;
      expect(res).to.be.eql('blah');

      expect(requires[MONGO].removeStub.calledOnce).to.be.true;
      //{'finishTime': {$lt: logRetentionDate}}
      expect(requires[MONGO].removeStub.getCall(0).args[0].finishTime).to.exist;

      // Date object for 10 Days ago
      var oldLogTime = moment().subtract(10, 'd').toDate();
      // Date created from default retentionPeriod (7 days)
      var retentionDate = requires[MONGO].removeStub.getCall(0).args[0].finishTime.$lt;

      expect(oldLogTime).to.be.below(retentionDate);
      done();
    });
  });

  it('should set a default value for logCleanUpOpts when only one opt is provided', function(done) {
    requires[CRON].loadJobs.yields(null, [mockJob]);
    requires[CRON].CronMasterJob.returns(mockCleanUpJob);
    requires[MONGO].removeStub.returns('blah');

    _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *'}).loadJobs();

    expect(requires[CRON].CronMasterJob.calledOnce).to.be.true;
    expect(requires[CRON].CronMasterJob.getCall(0).args[0].cronParams.cronTime).to.be.eql('*/15 * * * * *');

    var cleanUpJob = requires[CRON].CronMasterJob.getCall(0).args[0].cronParams.onTick;

    cleanUpJob(null, function(err, res) {
      expect(err).to.not.exist;
      expect(res).to.be.eql('blah');

      expect(requires[MONGO].removeStub.calledOnce).to.be.true;
      //{'finishTime': {$lt: logRetentionDate}}
      expect(requires[MONGO].removeStub.getCall(0).args[0].finishTime).to.exist;

      // Date object for 10 Days ago
      var oldLogTime = moment().subtract(10, 'd').toDate();
      // Date created from default retentionPeriod (7 days)
      var retentionDate = requires[MONGO].removeStub.getCall(0).args[0].finishTime.$lt;

      expect(oldLogTime).to.be.below(retentionDate);
      done();
    });
  });

  it('should clean logs on provided frequency using finishTime field and provided retentionPeriod', function(done) {
    requires[CRON].loadJobs.yields(null, [mockJob]);
    requires[CRON].CronMasterJob.returns(mockCleanUpJob);
    requires[MONGO].removeStub.returns('blah');

    _sut('/jobs', 'CRON_LOGS', {frequency: '*/15 * * * * *', retentionPeriod: '1 second'}).loadJobs();

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
      //{'finishTime': {$lt: logRetentionDate}}
      expect(requires[MONGO].removeStub.getCall(0).args[0].finishTime).to.exist;

      // Date object for 10 min ago
      var oldLogTime = moment().subtract(10, 'm').toDate();
      // Date created from retentionPeriod
      var retentionDate = requires[MONGO].removeStub.getCall(0).args[0].finishTime.$lt;

      expect(oldLogTime).to.be.below(retentionDate);
      done();
    });
  });

});
