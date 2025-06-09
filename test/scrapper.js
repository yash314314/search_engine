const puppeteer = require('puppeteer');
const urls = require('./blogUrls.json');
const fs = require('fs');

async function scrapeBlog(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  try {
    const data = await page.evaluate(() => {
      const titleEl = document.querySelector('h1');
      const contentEls = document.querySelectorAll('article p, .post-content p, .post p');

      const title = titleEl ? titleEl.innerText.trim() : 'Untitled';
      const date = document.querySelector('time')?.innerText.trim() || '';
      const content = Array.from(contentEls).map(p => p.innerText.trim()).join('\n\n');

      return {
        title,
        author: document.querySelector('meta[name="author"]')?.content || 'Unknown',
        date,
        content,
        url: window.location.href
      };
    });

    await browser.close();
    return data;

  } catch (error) {
    console.error(`Error scraping ${url}:`, error.message);
    await browser.close();
    return null;
  }
}

(async () => {
  const results = [];

  for (const url of urls) {
    console.log(`Scraping: ${url}`);
    const blogData = await scrapeBlog(url);
    if (blogData) results.push(blogData);
  }

  fs.writeFileSync('scrapedBlogs.json', JSON.stringify(results, null, 2));
  console.log('✅ All blogs scraped and saved to scrapedBlogs.json');
})();
