const express = require('express');
const axios = require('axios');
const router = express.Router();
const dotenv = require('dotenv');
dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX_ID = process.env.GOOGLE_CX_ID;

const isMediaUrl = (url = '') => {
  const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.webm', '.pdf'];
  return mediaExtensions.some((ext) => url.toLowerCase().endsWith(ext));
};

const isBlockedDomain = (url = '') => {
  const blocked = ['youtube.com', 'youtu.be', 'vimeo.com', 'giphy.com', 'imgur.com', 'tiktok.com'];
  return blocked.some((domain) => url.includes(domain));
};

const isValidGoogleLink = (item) => {
  return (
    item.link &&
    !isMediaUrl(item.link) &&
    !isBlockedDomain(item.link) &&
    item.snippet &&
    item.snippet.length > 30
  );
};

const fetchFromGoogle = async (query) => {
  try {
    const response = await axios.get(
      `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX_ID}&q=${encodeURIComponent(query)}`
    );

    return (response.data.items || [])
      .filter(isValidGoogleLink)
      .map((item) => ({
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

const filterRedditResults = (posts) =>
  posts
    .filter((post) => {
      const data = post.data;
      return (
        !data.stickied &&
        !data.is_self &&
        data.url &&
        data.title.length > 10 &&
        data.score > 5 &&
        !isMediaUrl(data.url) &&
        !isBlockedDomain(data.url)
      );
    })
    .map((post) => ({
      title: post.data.title,
      url: post.data.url,
      author: post.data.author,
      content: post.data.selftext || '',
      source: `r/${post.data.subreddit}`,
    }));

const fetchFromReddit = async (query) => {
  try {
    const response = await axios.get(`https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new`);
    const posts = response.data.data.children;
    return filterRedditResults(posts);
  } catch (err) {
    console.error('Reddit fetch error:', err.message);
    return [];
  }
};

router.get('/api/realtime-search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter is required' });

  // Try Google first
  let results = await fetchFromGoogle(q);

  // Fallback to Reddit if not enough results
  if (results.length < 5) {
    const redditResults = await fetchFromReddit(q);
    results = results.concat(redditResults.slice(0, 5)); // take top 5 from Reddit
  }

  return res.json(results);
});

module.exports = router;
