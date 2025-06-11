const express = require('express');
const app = express();
require('dotenv').config(); 
const cors = require('cors');
const redditFetcher = require('./redditFetcher.js');
const realtimeFetcher = require('./realtimeFetcher.js');
app.use(cors());
app.use(express.json());
//here i will do the umm.. routing , handle 2 routes for now with different priorities

app.use('/api1', realtimeFetcher);
app.use('/api2', redditFetcher);

app.listen(3001, () => {
  console.log('Backend listening on port 3001');
});
