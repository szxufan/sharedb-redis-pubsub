const redisPubSub = require('../index');
const test = require('sharedb/test/pubsub');
test((callback) => {
  const t = redisPubSub();
  callback(null, t);
  setTimeout(t._cache.clear, 1_000);
});