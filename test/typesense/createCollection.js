const Typesense = require('typesense');

const client = new Typesense.Client({
  nodes: [{
    host: 'localhost',
    port: 8108,
    protocol: 'http'
  }],
  apiKey: 'xyz',
  connectionTimeoutSeconds: 2
});

async function setupCollection() {
  try {
    await client.collections('blogs').delete();
  } catch (err) {
    if (err.httpStatus !== 404) {
      console.error('Error deleting collection:', err);
    }
  }

  const schema = {
    name: 'blogs',
    fields: [
      { name: 'id', type: 'string', facet: false },
      { name: 'title', type: 'string', facet: true },
      { name: 'content', type: 'string', facet: false },
      { name: 'author', type: 'string', facet: true },
      { name: 'tags', type: 'string[]', facet: true },
      { name: 'created_at', type: 'int64', facet: true },
      { name: 'url', type: 'string', facet: false }  // <-- Added field
    ],
    default_sorting_field: 'created_at',
    token_separators: ['-'],
    enable_nested_fields: true
  };

  const result = await client.collections().create(schema);
  console.log('Collection created:', result);
}

setupCollection();
module.exports = setupCollection;
