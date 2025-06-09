const Typesense = require('typesense');

const client = new Typesense.Client({
  nodes: [
    {
      host: 'localhost',   
      port: '8108',        
      protocol: 'http',    
    },
  ],
  apiKey: 'xyz',          
  connectionTimeoutSeconds: 2,
});

module.exports = client;
