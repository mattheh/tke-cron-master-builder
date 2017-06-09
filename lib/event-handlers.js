'use strict';

module.exports = function (job, collection) {
  const log = require('./log')(job.meta.name);
  const later = require('later');

  return {
    onTickStarted: () => {
      log.info('tick started for %s', job.meta.name);

      // get the next run time
      let nextSchedule = later.parse.cron(job._opts.cronParams.cronTime);
      nextSchedule = later.schedule(nextSchedule).next(2);
      nextSchedule = nextSchedule[nextSchedule.length - 1];

      const data = {
        name: job.meta.name,
        startTime: new Date(),
        finishTime: null,
        executionDuration: null,
        lastStatus: 'In Process',
        nextSchedule: nextSchedule
      };

      return collection.then((coll) => coll.insert(data))
        .then((res) => {
          // Storing the mongo in job's meta data for doc update on complete
          job.meta.id = res.ops[0]._id;
          log.info(`meta for job ${job.meta.name} %j`, job.meta);
        })
        .catch((e) => {
          // Delete an older _id if it exists since we don't want the
          // TICK_COMPLETE to potentially update the old/wrong entry
          delete job.meta.id;

          log.error(e, 'failed to write TICK_STARTED data');
        });
    },

    onTickComplete: (err, result, time) => {
      if (err) {
        log.error(err, 'error returned on TICK_COMPLETE after %sms', time);
      } else {
        log.info('completed a tick in %dms', time);
      }

      const data = {
        finishTime: new Date(),
        lastStatus: err ? 'Failed' : 'Success',
        executionDuration: time,
        error: err
      };

      if (job.meta.id) {
        return collection.then((coll) => coll.update({_id: job.meta.id}, {$set: data}))
          .catch((e) => log.error(e, 'failed to write TICK_COMPLETE data'));
      } else {
        return Promise.resolve();
      }
    },

    onTimeWarning: () => {
      log.warn('job is taking longer than expected');
    },

    onOverlappingCall: () => {
      log.warn('received a tick/call before the previous tick completed' +
      ' this tick has been ignored and will not run until the first tick ' +
      'has finished.');
    }
  };

};
