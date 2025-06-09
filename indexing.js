const client = require('./typesenseclient');
const scrapeAndExtract = require('./blogExtracter');

const typesense = require('./typesenseclient');

async function indexBlogs(blogs) {
  for (const blog of blogs) {
    try {
      await typesense.collections('blogs').documents().upsert(blog);
      console.log(`Indexed: ${blog.title}`);
    } catch (error) {
      console.error(`Error indexing ${blog.title}:`, error);
    }
  }
}

async function main() {
  try {
    const blogs = await scrapeAndExtract();
    console.log(`Found ${blogs.length} blogs to index.`);
    await indexBlogs(blogs);
    console.log('All blogs indexed successfully.');
  } catch (error) {
    console.error('Error in indexing blogs:', error);
  }
}
main();