'use strict';

const cmaster = require('cron-master');
const log = require('./log')();
const VError = require('verror');
const timestring = require('timestring');
const moment = require('moment');
const getEventHandlers = require('./event-handlers');
const raygunClient = require('./raygun');

/**
 * Grabs the Cron Job config files in the specified directory (cronConfigsDir), initiates and
 * starts them
 * @param {String} cronConfigsDir - complete path to config files for cron-master Cron Jobs
 * @param {String} collection - Name of Collection to store Cron Logs in
 * @param {Object} logCleanUpOpts - Options for Cleaning Up Cron Job Logs
 * @return {Object}
 */
module.exports = function buildCronJobs(cronConfigsDir, collectionName, logCleanUpOpts) {

  logCleanUpOpts =  logCleanUpOpts || {};

  if (!cronConfigsDir || !collectionName) {
    const err = new VError('Error: \'cronConfigsDir\' and \'collectionName\' are required params.');
    raygunClient.send(err);
    throw err;
  }

  const collection = require('rhmap-mongodb').collection(collectionName);

  const instance = {
    /**
     * Loads jobs contained in the specified jobs folder
     * @return {undefined}
     */
    loadJobs: () => {
      cmaster.loadJobs(cronConfigsDir, function (err, jobs) {
        if (err) {
          // Something went wrong when loading jobs
          const loadErr = new VError(err, 'Failed to Load Cron Jobs');
          raygunClient.send(loadErr);
          throw loadErr;
        } else if (jobs.length === 0) {
          // If no files were found
           const jobsErr = new VError('No jobs found in directory: %s', cronConfigsDir);
           raygunClient.send(jobsErr);
           throw jobsErr;
        } else {
          log.info('Initialising Cron jobs in directory: %s', cronConfigsDir);

          var logCleanUpJob = createLogCleanUpJob(logCleanUpOpts.frequency, logCleanUpOpts.retentionPeriod, collection);

          jobs.push(logCleanUpJob);

          // Bind job events etc.
          jobs.forEach((job) => instance.attachEventHandlers(job));

          // Start the cron timers
          cmaster.startJobs();
        }
      });
    },


    /**
     * Attaches handlers to the passed job instance
     * @param  {CronMasterJob} job
     * @return {undefined}
     */
    attachEventHandlers: (job) => {
      const handlers = instance.getHandlers(job);

      job.on(cmaster.EVENTS.TICK_STARTED, handlers.onTickStarted);
      job.on(cmaster.EVENTS.TICK_COMPLETE, handlers.onTickComplete);
      job.on(cmaster.EVENTS.TIME_WARNING, handlers.onTimeWarning);
      job.on(cmaster.EVENTS.OVERLAPPING_CALL, handlers.onOverlappingCall);
    },


    /**
     * Generate a set of handlers for the given job instance
     * @param  {CronMasterJob} job
     * @return {Object}
     */
    getHandlers: (job) => {
      if (!job) {
        const err = new VError('getHandlers must be passed a cron-master job instance');
        raygunClient.send(err);
        throw err;
      }

      return getEventHandlers(job, collection);
    }
  };

  return instance;
};


/**
 * Config for Cron Job that Cleans Up the other Cron Job Logs
 * @param {object} db - Promisified Mongo Connection Generator
 * @param {String} frequency - Frequency of clean up Cron.
 * @param {String} retentionPeriod - Human readable retention period for Logs.
 */
function createLogCleanUpJob(frequency, retentionPeriod, collection) {

  //Default to run every night at midnight
  frequency = frequency || '* * 0 * * *';
  retentionPeriod = retentionPeriod || '7 days';

  const logRetentionPeriod = timestring(retentionPeriod);
  const CronMasterJob = cmaster.CronMasterJob;

  // Cron Configuration
  return new CronMasterJob({
    // Some meta data to assist the job/logging
    meta: {
      name: __filename
    },
    // The usual params that you pass to the "cron" module go here
    cronParams: {
      cronTime: frequency,

      onTick: function (job, done) {
        const logRetentionDate = moment().subtract(logRetentionPeriod, 's').toDate();

        return collection.then((coll) => coll.remove({'finishTime': {$lt: logRetentionDate}}))
          .asCallback(done);
      }
    }
  });
}
