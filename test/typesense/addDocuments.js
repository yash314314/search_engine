const Typesense = require('typesense');

const client = new Typesense.Client({
    nodes: [{
        host: 'localhost',
    port: 8108,
        protocol: 'http'}
    ],
    apiKey: "xyz",
    connectionTimeoutSeconds: 2
})
const blogs = [{
    id: '1',
    title: 'How I became a Product Manager',
    content: 'A detailed post about transitioning into PM role by Manas Saloi...',
    author: 'Manas Saloi',
    tags: ['product management', 'career', 'blogs'],
    created_at: Math.floor(new Date('2018-03-30').getTime() / 1000),
  },
  {
    id: '2',
    title: 'Why Procrastinators Procrastinate',
    content: 'A fun and deep dive into human procrastination by Wait But Why...',
    author: 'Tim Urban',
    tags: ['psychology', 'self-help', 'blogs'],
    created_at: Math.floor(new Date('2013-10-01').getTime() / 1000),
  },
  {
    id: '3',
    title: 'My Experience Learning JavaScript from Scratch',
    content: 'Sharing my beginner journey with JavaScript and projects...',
    author: 'Jane Doe',
    tags: ['javascript', 'web dev', 'learning'],
    created_at: Math.floor(new Date('2020-01-01').getTime() / 1000),
  }]

async function indexBlogs() {
  for (const post of blogs) {
    try {
      const result = await client.collections('blogs').documents().create(post);
      console.log('Indexed:', result.id);
    } catch (error) {
      console.error('Error indexing blog:', error);
    }
  }
}

indexBlogs();