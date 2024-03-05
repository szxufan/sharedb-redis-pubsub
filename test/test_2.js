const redisPubSub = require('../index');
const redis = require("redis");
const test = require('sharedb/test/pubsub');

test((callback) => {
  const t = redisPubSub({client: [redis.createClient({}), redis.createClient({})]});
  callback(null, t);
  setTimeout(t._cache.clear, 1_000);
})
