const Typesense = require('typesense');

const client = new Typesense.Client({
  nodes: [
    {
      host: 'localhost',
      port: 8108,
      protocol: 'http',
    },
  ],
  apiKey: 'xyz',
  connectionTimeoutSeconds: 2,
});

async function searchBlogs(query) {
  try {
    const searchResults = await client.collections('blogs').documents().search({
      q: query,
      query_by: 'title,content,tags,author',
      sort_by: 'created_at:desc',
    });

    console.log(`🔍 Search results for "${query}":`);
    searchResults.hits.forEach((hit, index) => {
      console.log(`${index + 1}. ${hit.document.title} by ${hit.document.author}`);
    });
  } catch (error) {
    console.error('Search error:', error);
  }
}

searchBlogs('product manager');
