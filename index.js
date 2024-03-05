const MemoryCache = require('memory-cache').Cache;
const redis = require('redis');
const crypto = require("crypto");
const PubSub = require('sharedb').PubSub;

function md5(a, encoding = 'hex') {
  const hash = crypto.createHash('md5');
  hash.update(a);
  return hash.digest(encoding);
}

// Redis pubsub driver for ShareDB.
//
// The redis driver requires two redis clients (a single redis client can't do
// both pubsub and normal messaging). These clients will be created
// automatically if you don't provide them.
function RedisPubSub(options = {}, timeout = 3600_000) {
  if (!(this instanceof RedisPubSub)) return new RedisPubSub(options);
  PubSub.call(this, options);
  this._timeout = timeout;
  this.client = options.client ? (Array.isArray(options.client) ? options.client : [options.client]) : [redis.createClient(options)];

  // Redis doesn't allow the same connection to both listen to channels and do
  // operations. Make an extra redis connection for subscribing with the same
  // options if not provided
  this.observer = options.observer ? (Array.isArray(options.observer) ? options.observer : [options.observer]) : this.client.map(client => redis.createClient(client.options));

  this._cache = new MemoryCache();
  for (const observer of this.observer) {
    observer.on('message', (channel, message) => {
      const key = `all/${md5(message)}`;
      if (this._cache.get(key)) return;
      this._cache.put(key, 1, this._timeout);
      const data = JSON.parse(message);
      this._emit(channel, data);
    });
  }
}

module.exports = RedisPubSub;

RedisPubSub.prototype = Object.create(PubSub.prototype);

RedisPubSub.prototype.close = function (callback) {
  if (!callback) {
    callback = function (err) {
      if (err) throw err;
    };
  }
  PubSub.prototype.close.call(this, (err) => {
    if (err) return callback(err);
    let c = this.client.length + this.observer.length;
    for (const client of this.client) {
      client.quit((err, data) => {
        if ((--c) === 0) {
          callback(err, data);
        }
      });
    }
    for (const observer of this.observer) {
      observer.quit((err, data) => {
        if ((--c) === 0) {
          callback(err, data);
        }
      })
    }
  });
};

RedisPubSub.prototype._subscribe = function (channel, callback) {
  const cb = callback && this.observer.length > 1 ? (channel, message) => {
    const key = `${channel}/${md5(message)}`;
    if (this._cache.get(key)) return;
    this._cache.put(key, 1, this._timeout);
    callback(channel, message);
  } : callback;
  for (const observer of this.observer) {
    observer.subscribe(channel, cb);
  }
};

RedisPubSub.prototype._unsubscribe = function (channel, callback) {
  for (const observer of this.observer) {
    observer.unsubscribe(channel, callback);
  }
};

RedisPubSub.prototype._publish = function (channels, data, callback) {
  const message = JSON.stringify(data);
  const args = [PUBLISH_SCRIPT, 0, message].concat(channels);
  let c = this.client.length;
  const cb = callback && c > 1 ? (err, data) => {
    if ((--c) === 0) {
      callback(err, data);
    }
  } : callback;
  for (const client of this.client) {
    client.eval(args, cb);
  }
};

const PUBLISH_SCRIPT =
  'for i = 2, #ARGV do ' +
  'redis.call("publish", ARGV[i], ARGV[1]) ' +
  'end';
