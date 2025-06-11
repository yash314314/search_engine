const express = require('express');
const app = express();
const realtimeFetcher = require('./realtimeFetcher.js');
require('dotenv').config(); 
const cors = require('cors');
app.use(cors());
app.use(realtimeFetcher);

app.listen(3001, () => {
  console.log('Backend listening on port 3001');
});
