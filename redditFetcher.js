const express = require('express');
const axios = require('axios');
const router = express.Router();
const dotenv = require('dotenv');
dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX_ID = process.env.GOOGLE_CX_ID;

const filterRedditResults = (posts) =>
  posts
    .filter(
      (post) =>
        !post.data.stickied &&
        !post.data.is_self &&
        post.data.url &&
        post.data.title.length > 10 &&
        post.data.score > 5 &&
        !post.data.url.endsWith('.gif') &&
        !post.data.url.endsWith('.mp4') &&
        !post.data.url.includes('redgifs')
    )
    .map((post) => ({
      title: post.data.title,
      url: post.data.url,
      author: post.data.author,
      content: post.data.selftext || '',
      source: `r/${post.data.subreddit}`,
    }));

const fetchFromReddit = async (query) => {
  try {
    const response = await axios.get(`https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance`);
    const posts = response.data.data.children;
    return filterRedditResults(posts);
  } catch (err) {
    console.error('Reddit fetch error:', err.message);
    return [];
  }
};

const fetchFromGoogle = async (query) => {
  try {
    const response = await axios.get(
      `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX_ID}&q=${encodeURIComponent(query)}`
    );
    return (response.data.items || []).map((item) => ({
      title: item.title,
      url: item.link,
      author: item.displayLink || '',
      content: item.snippet,
      source: 'Google CSE',
    }));
  } catch (err) {
    console.error('Google CSE fetch error:', err.message);
    return [];
  }
};

router.get('/realtime-search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter is required' });

  let results = await fetchFromReddit(q);

  if (results.length < 3) {
    const googleResults = await fetchFromGoogle(q);
    results = results.concat(googleResults.slice(0, 5)); // Limit to 5 fallback results
  }

  res.json(results);
});

module.exports = router;
