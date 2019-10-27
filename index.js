require('dotenv').config();
const express = require('express');
const https = require('https');
const cors = require('cors');
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

const whitelist = ['https://shl.zetterstrom.dev'];

const corsOptions = {
  origin: (origin, cb) => {
    if (whitelist.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
};

const app = express();
const shl = new ShlClient(new ShlConnection(clientId, clientSecret));

app.use(require('helmet')());

app.get('/standings', cors(corsOptions), (_, res) => {
  const standingsRedisKey = 'shl:standings';

  return redisClient.get(standingsRedisKey, (err, standings) => {
    if (err) return res.json({ error: err });
    if (standings) {
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
        return res.json({ source: 'api', data: apiResponseWithTeamInfo });
      });
  });
});

app.get('/games', cors(corsOptions), (_, res) => {
  const standingsRedisKey = 'shl:games';

  return redisClient.get(standingsRedisKey, (err, standings) => {
    if (err) return res.json({ error: err });
    if (standings) {
      return res.json({ soure: 'cache', data: JSON.parse(standings) });
    }
    return shl.season(2019).games()
      .then((apiResponse) => {
        const apiResponseWithTeamInfo = apiResponse.map(game => ({
          ...game,
          home_team_logo: teamInfo[game.home_team_code].logo,
          away_team_logo: teamInfo[game.away_team_code].logo,
          home_team_name: teamInfo[game.home_team_code].name,
          away_team_name: teamInfo[game.away_team_code].name,
        }));

        redisClient.setex(
          standingsRedisKey,
          cacheLifespan,
          JSON.stringify(apiResponseWithTeamInfo),
        );
        return res.json({ source: 'api', data: apiResponseWithTeamInfo });
      });
  });
});

app.listen(port);
if (process.env.NODE_ENV !== 'development') {
  const options = {
    cert: fs.readFileSync('./sslcert/fullchain.pem'),
    key: fs.readFileSync('./sslcert/privkey.pem'),
  };
  https.createServer(options, app).listen(8443);
}
