require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const redis = require('redis');
const { ShlConnection } = require('./shl-connection');
const { ShlClient } = require('./shl-client');
const teamInfo = require('./team-info.json');

const redisClient = redis.createClient(6379);
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const port = process.env.PORT;
const cacheLifespan = process.env.CACHE_LIFESPAN;
const options = {
  cert: fs.readFileSync('./sslcert/fullchain.pem'),
  key: fs.readFileSync('./sslcert/privkey.pem'),
};

const app = express();
const shl = new ShlClient(new ShlConnection(clientId, clientSecret));

app.use(require('helmet')());

app.get('/test', (_, res) => res.send('Hello, World!'));

app.get('/standings', (_, res) => {
  const standingsRedisKey = 'shl:standings';

  return redisClient.get(standingsRedisKey, (err, standings) => {
    if (err) return res.json({ error: err });
    if (standings) {
      console.log('Delivered standings from cache');
      return res.json({ soure: 'cache', data: JSON.parse(standings) });
    }
    return shl.season(2019).statistics.teams.standings()
      .then((apiResponse) => {
        const apiResponseWithTeamInfo = apiResponse.map(team => ({
          ...team,
          logo: teamInfo[team.team.id].logo,
          name: teamInfo[team.team.id].name,
        }));

        redisClient.setex(
          standingsRedisKey,
          cacheLifespan,
          JSON.stringify(apiResponseWithTeamInfo),
        );
        console.log('Delivered standings from api');
        return res.json({ source: 'api', data: apiResponseWithTeamInfo });
      });
  });
});

app.listen(port);
https.createServer(options, app).listen(8443);
