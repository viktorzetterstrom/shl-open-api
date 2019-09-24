require('dotenv').config();
const express = require('express');
const redis = require('redis');
const { ShlConnection } = require('./shl-connection');
const { ShlClient } = require('./shl-client');

const redisClient = redis.createClient(6379);
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

const app = express();
const shl = new ShlClient(new ShlConnection(clientId, clientSecret));

app.get('/standings', (req, res) => {
  const standingsRedisKey = 'shl:standings';

  return redisClient.get(standingsRedisKey, async (err, standings) => {
    if (standings) {
      return res.json({ soure: 'cache', data: JSON.parse(standings) });
    }

    const standingsFromDb = await shl.season(2019).statistics.teams.standings();
    redisClient.setex(standingsRedisKey, 1800, JSON.stringify(standingsFromDb));
    return res.json({ source: 'db', data: standingsFromDb });
  });
});

app.listen(4000, () => {
  console.log('SHL-api listening on port 4000');
});
