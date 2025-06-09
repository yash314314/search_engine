const puppeteer = require('puppeteer');
const scrapeHN = require('./dynamicScrape.js'); // Your existing HN scraper module

async function extractBlogContent(url) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const data = await page.evaluate(() => {
      const title = document.querySelector('h1')?.innerText || document.title;

      const author = document.querySelector('meta[name="author"]')?.content
                    || document.querySelector('.author')?.innerText
                    || '';

      const contentElem = document.querySelector('article')
                       || document.querySelector('.post-content')
                       || document.body;

      const content = contentElem?.innerText || '';

      const tagsElems = document.querySelectorAll('.tags a, .tag');
      const tags = Array.from(tagsElems).map(el => el.innerText.trim());

      const publishDateStr = document.querySelector('time')?.getAttribute('datetime')
                          || document.querySelector('meta[property="article:published_time"]')?.content
                          || '';

      const created_at = publishDateStr ? Math.floor(new Date(publishDateStr).getTime() / 1000) : Math.floor(Date.now() / 1000);

      return { title, author, content, tags, created_at };
    });

    return data;
  } catch (error) {
    console.error(`Failed to scrape content for URL: ${url}\n`, error.message);
    return null;
  } finally {
    await browser.close();
  }
}

async function scrapeAndExtract() {
  const blogLinks = await scrapeHN();

  const results = [];

  for (const { title, url } of blogLinks) {
    console.log(`⏳ Extracting content from: ${url}`);
    const contentData = await extractBlogContent(url);
    if (contentData) {
      results.push({
        title: contentData.title || title,
        author: contentData.author,
        content: contentData.content,
        tags: contentData.tags,
        created_at: contentData.created_at,
        url,
      });
    }
  }

  return results;
}


module.exports = scrapeAndExtract;