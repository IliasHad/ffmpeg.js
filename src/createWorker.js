const createJob = require('./createJob');
const { log } = require('./utils/log');
const getId = require('./utils/getId');
const {
  defaultOptions,
  spawnWorker,
  terminateWorker,
  onMessage,
  loadMedia,
  send,
} = require('./worker/node');

let workerCounter = 0;

module.exports = (_options = {}) => {
  const id = getId('Worker', workerCounter);
  const {
    logger,
    ...options
  } = {
    ...defaultOptions,
    ..._options,
  };
  const resolves = {};
  const rejects = {};
  let worker = spawnWorker(options);

  workerCounter += 1;

  const setResolve = (action, res) => {
    resolves[action] = res;
  };

  const setReject = (action, rej) => {
    rejects[action] = rej;
  };

  const startJob = ({ id: jobId, action, payload }) => (
    new Promise((resolve, reject) => {
      log(`[${id}]: Start ${jobId}, action=${action}`);
      setResolve(action, resolve);
      setReject(action, reject);
      send(worker, {
        workerId: id,
        jobId,
        action,
        payload,
      });
    })
  );

  const load = (jobId) => (
    startJob(createJob({
      id: jobId, action: 'load', payload: { options },
    }))
  );

  const transcode = async (media, outputExt, opts, jobId) => (
    startJob(createJob({
      id: jobId,
      action: 'transcode',
      payload: {
        media: await loadMedia(media),
        outputExt,
        options: opts,
      },
    }))
  );

  const terminate = async (jobId) => {
    if (worker !== null) {
      await startJob(createJob({
        id: jobId,
        action: 'terminate',
      }));
      terminateWorker(worker);
      worker = null;
    }
    return Promise.resolve();
  };

  onMessage(worker, ({
    workerId, jobId, status, action, data,
  }) => {
    if (status === 'resolve') {
      log(`[${workerId}]: Complete ${jobId}`);
      let d = data;
      if (action === 'transcode') {
        d = Uint8Array.from({ ...data, length: Object.keys(data).length });
      }
      resolves[action]({ jobId, data: d });
    } else if (status === 'reject') {
      rejects[action](data);
      throw Error(data);
    } else if (status === 'progress') {
      logger(data);
    }
  });

  return {
    id,
    worker,
    setResolve,
    setReject,
    load,
    transcode,
    terminate,
  };
};