const redisPubSub = require('../index');
const test = require('sharedb/test/pubsub');
const redis = require("redis");
test((callback) => {
  const t = redisPubSub({client: redis.createClient({})});
  callback(null, t);
  setTimeout(t._cache.clear, 1_000);
});