const config = require('./config');
const { AppError } = require('./errors');

const hits = new Map();

function consume(visitorId) {
  const now = Date.now();
  const windowStart = now - config.rateLimitWindowMs;
  let timestamps = hits.get(visitorId);

  if (!timestamps) {
    timestamps = [];
    hits.set(visitorId, timestamps);
  } else {
    while (timestamps.length && timestamps[0] <= windowStart) {
      timestamps.shift();
    }
  }

  if (timestamps.length >= config.rateLimitMax) {
    throw new AppError(429, 'TOO_MANY_REQUESTS', 'Too many messages. Please wait a moment and try again.');
  }

  timestamps.push(now);

  if (hits.size > 1000) {
    for (const [id, list] of hits) {
      if (list.length === 0) {
        hits.delete(id);
      }
    }
  }
}

function reset(visitorId) {
  hits.delete(visitorId);
}

module.exports = { consume, reset };
