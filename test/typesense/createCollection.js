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

async function setupCollection(params) {
    try{
        await client.collections('blogs').delete();
    }catch(err){
        if (err.httpStatus !== 404) {
            console.error('Error deleting collection:', err);
        }
    }

const schema = {
    name: 'blogs',
    fields: [
        { name: 'id', type: 'string', facet: false },
        { name: 'title', type: 'string', facet: false },
        { name: 'content', type: 'string', facet: false },
        { name: 'author', type: 'string', facet: true },
        { name: 'tags', type: 'string[]', facet: true },
        { name: 'created_at', type: 'int64', facet: false }
    ],
    default_sorting_field: 'created_at'
}
const result = await client.collections().create(schema);
console.log('Collection created:', result);
}
setupCollection();
module.exports = setupCollection;
