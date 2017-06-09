'use strict';

const sinon = require('sinon');
const expect = require('chai').expect;

require('sinon-as-promised')(Promise);

describe('event-handlers', () => {
  let mockJob, mongo, _sut;

  beforeEach(() => {
    mockJob = {
      meta: {
        name: 'rm -rf all-the-things'
      },
      _opts: {
        cronParams: {
          cronTime: '* * * * * *'
        }
      }
    };

    mongo = {
      insertStub: sinon.stub(),
      updateStub: sinon.stub(),
      removeStub: sinon.stub(),
      collection: function() {
        return Promise.resolve({
          insert: mongo.insertStub,
          update: mongo.updateStub,
          remove: mongo.removeStub
        });
      }
    };

    _sut = require(__filename.replace('.test', ''));
  });

  it('should return an object containing event handlers', () => {
    const handlers = _sut(mockJob, mongo.collection());

    expect(handlers.onTickStarted).to.be.a('function');
    expect(handlers.onTimeWarning).to.be.a('function');
    expect(handlers.onTickComplete).to.be.a('function');
    expect(handlers.onOverlappingCall).to.be.a('function');
  });

  describe('#onTickStarted', () => {
    it('should write the job to mongo and attach _id', () => {
      const handlers = _sut(mockJob, mongo.collection());

      mongo.insertStub.returns({ops: [{_id: '678'}]});

      return handlers.onTickStarted()
        .then(() => {
          // should attach the _id to the job
          expect(mockJob.meta.id).to.equal('678');

          const data = mongo.insertStub.getCall(0).args[0];

          expect(data.name).to.equal('rm -rf all-the-things');
          expect(data.finishTime).to.equal(null);
          expect(data.startTime).to.be.a('date');
          expect(data.nextSchedule).to.be.a('date');
          expect(data.executionDuration).to.equal(null);
          expect(data.lastStatus).to.equal('In Process');
        });
    });

    it('should fail to write the job to mongo and remove an existing _id', () => {
      mockJob.meta.id = '656789';

      const handlers = _sut(mockJob, mongo.collection());

      mongo.insertStub.rejects(new Error('failed to do insert'));

      return handlers.onTickStarted()
        .then(() => {
          expect(mockJob.meta.id).to.equal(undefined);
        });
    });
  });

  describe('#onTickComplete', () => {
    it('should write the update for our job to mongo', () => {
      mockJob.meta.id = '656789';
      mongo.updateStub.resolves();

      const handlers = _sut(mockJob, mongo.collection());

      return handlers.onTickComplete(null, null, 1050)
        .then(() => {
          expect(mongo.updateStub.called).to.be.true;

          const args = mongo.updateStub.getCall(0).args;
          expect(args[0]).to.deep.equal({_id: mockJob.meta.id});
          expect(args[1].$set.finishTime).to.be.a('date');
          expect(args[1].$set.lastStatus).to.equal('Success');
          expect(args[1].$set.executionDuration).to.equal(1050);
          expect(args[1].$set.error).to.equal(null);
        });
    });

    it('should not write an update since no meta.id exists', () => {
      const handlers = _sut(mockJob, mongo.collection());

      return handlers.onTickComplete(null, null, 1050)
        .then(() => {
          expect(mongo.updateStub.called).to.be.false;
        });
    });

    it('should write an update with error info', () => {
      mockJob.meta.id = '656789';
      const handlers = _sut(mockJob, mongo.collection());

      return handlers.onTickComplete(new Error('ooops!'), null, 1050)
        .then(() => {
          expect(mongo.updateStub.called).to.be.true;

          const args = mongo.updateStub.getCall(0).args;
          expect(args[0]).to.deep.equal({_id: mockJob.meta.id});
          expect(args[1].$set.finishTime).to.be.a('date');
          expect(args[1].$set.lastStatus).to.equal('Failed');
          expect(args[1].$set.executionDuration).to.equal(1050);
          expect(args[1].$set.error).to.be.an('error');
        });
    });
  });

  describe('#onTimeWarning', () => {
    it('should exec successfully', () => {
      const handlers = _sut(mockJob, mongo.collection());

      handlers.onTimeWarning();
    });
  });

  describe('#onOverlappingCall', () => {
    it('should exec successfully', () => {
      const handlers = _sut(mockJob, mongo.collection());

      handlers.onOverlappingCall();
    });
  });

});
