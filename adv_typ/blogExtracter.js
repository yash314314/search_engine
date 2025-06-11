const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require("fs");

class ConcurrencyLimiter {
  constructor(limit) {
    this.limit = limit;
    this.running = 0;
    this.queue = [];
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn,
        resolve,
        reject
      });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.limit || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }
}

const CONFIG = {
  PARALLEL_LIMIT: 5, 
  BATCH_SIZE: 10,    
  RETRY_ATTEMPTS: 2, 
  DELAY_BETWEEN_BATCHES: 2000,
  EXTRACTION_TIMEOUT: 30000, 
  BROWSER_POOL_SIZE: 3 
};


class BrowserPool {
  constructor(size = CONFIG.BROWSER_POOL_SIZE) {
    this.browsers = [];
    this.available = [];
    this.size = size;
  }

  async initialize() {
    console.log(`🌐 Initializing browser pool with ${this.size} instances...`);
    for (let i = 0; i < this.size; i++) {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });
      this.browsers.push(browser);
      this.available.push(browser);
    }
  }

  async getBrowser() {
    while (this.available.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.available.pop();
  }

  returnBrowser(browser) {
    this.available.push(browser);
  }

  async closeAll() {
    console.log('🔄 Closing browser pool...');
    await Promise.all(this.browsers.map(browser => browser.close()));
    this.browsers = [];
    this.available = [];
  }
}

// Enhanced multi-source scraper with additional sources
async function scrapeMultipleSources() {
  console.log('🚀 Starting multi-source blog discovery...');
  
  const results = await Promise.allSettled([
    scrapeHN(),
    scrapeLobsters(),
    scrapeReddit(),
    scrapeIndieHackers(),
    scrapeDevTo(),
    scrapeHashNode()
  ]);
  
  let allBlogs = [];
  const sourceNames = ['HackerNews', 'Lobsters', 'Reddit', 'IndieHackers', 'DevTo', 'HashNode'];
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`✅ ${sourceNames[index]}: ${result.value.length} blogs found`);
      allBlogs.push(...result.value);
    } else {
      console.error(`❌ ${sourceNames[index]} failed:`, result.reason.message);
    }
  });

  const uniqueBlogs = allBlogs.reduce((acc, current) => {
    const exists = acc.find(blog => blog.url === current.url);
    if (!exists) {
      acc.push(current);
    }
    return acc;
  }, []);
  console.log(`📊 Total unique blogs discovered: ${uniqueBlogs.length}`);
  return uniqueBlogs;
}

async function extractBlogContent(url, browserPool, retryCount = 0) {
  let browser = null;
  let page = null;

  try {
    browser = await browserPool.getBrowser();
    page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
  
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: CONFIG.EXTRACTION_TIMEOUT 
    });

    const data = await page.evaluate(() => {
      // Enhanced title extraction
      const title = document.querySelector('h1')?.innerText?.trim()
                 || document.querySelector('.post-title')?.innerText?.trim()
                 || document.querySelector('article h1')?.innerText?.trim()
                 || document.title?.trim()
                 || '';

      // Enhanced author extraction
      const author = document.querySelector('meta[name="author"]')?.content
                  || document.querySelector('.author')?.innerText?.trim()
                  || document.querySelector('.byline')?.innerText?.trim()
                  || document.querySelector('[rel="author"]')?.innerText?.trim()
                  || '';

      // Enhanced content extraction with fallbacks
      const contentSelectors = [
        'article',
        '.post-content', 
        '.entry-content',
        '.content',
        'main',
        '[role="main"]'
      ];
      
      let contentElem = null;
      for (const selector of contentSelectors) {
        contentElem = document.querySelector(selector);
        if (contentElem) break;
      }
      
      if (!contentElem) {
        contentElem = document.body;
      }
      
      // Clean up content by removing navigation, ads, etc.
      const elementsToRemove = contentElem.querySelectorAll('nav, .nav, .navigation, .ads, .advertisement, script, style');
      elementsToRemove.forEach(el => el.remove());
      
      const content = contentElem?.innerText?.trim() || '';

      // Enhanced tags extraction
      const tagSelectors = ['.tags a', '.tag', '.categories a', '.category', '[rel="tag"]'];
      const tags = [];
      
      tagSelectors.forEach(selector => {
        const tagElems = document.querySelectorAll(selector);
        tagElems.forEach(el => {
          const tag = el.innerText?.trim();
          if (tag && !tags.includes(tag)) {
            tags.push(tag);
          }
        });
      });

      // Enhanced date extraction
      const dateSelectors = [
        'time[datetime]',
        'meta[property="article:published_time"]',
        'meta[name="date"]',
        '.published',
        '.date'
      ];
      
      let publishDateStr = '';
      for (const selector of dateSelectors) {
        const elem = document.querySelector(selector);
        if (elem) {
          publishDateStr = elem.getAttribute('datetime') 
                        || elem.getAttribute('content')
                        || elem.innerText;
          if (publishDateStr) break;
        }
      }

      const created_at = publishDateStr 
        ? Math.floor(new Date(publishDateStr).getTime() / 1000) 
        : Math.floor(Date.now() / 1000);

      // Calculate word count and reading time
      const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
      const readingTime = Math.ceil(wordCount / 200); // Average reading speed

      return { 
        title, 
        author, 
        content, 
        tags, 
        created_at,
        wordCount,
        readingTime
      };
    });

    return data;
  } catch (error) {
    console.error(`❌ Failed to extract content from ${url}: ${error.message}`);
    
    // Retry logic
    if (retryCount < CONFIG.RETRY_ATTEMPTS) {
      console.log(`🔄 Retrying ${url} (attempt ${retryCount + 1}/${CONFIG.RETRY_ATTEMPTS})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return extractBlogContent(url, browserPool, retryCount + 1);
    }
    
    return null;
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      browserPool.returnBrowser(browser);
    }
  }
}

// Parallel extraction with batching and progress tracking
async function extractBlogsInParallel(blogLinks, browserPool) {
  const results = [];
  const failed = [];
  const limiter = new ConcurrencyLimiter(CONFIG.PARALLEL_LIMIT);
  
  // Create batches to manage memory and avoid overwhelming servers
  const batches = [];
  for (let i = 0; i < blogLinks.length; i += CONFIG.BATCH_SIZE) {
    batches.push(blogLinks.slice(i, i + CONFIG.BATCH_SIZE));
  }

  console.log(`📦 Processing ${blogLinks.length} blogs in ${batches.length} batches`);
  console.log(`⚡ Using ${CONFIG.PARALLEL_LIMIT} parallel workers per batch`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchStart = batchIndex * CONFIG.BATCH_SIZE;
    
    console.log(`\n🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);

    // Create extraction tasks for this batch
    const extractionTasks = batch.map((blogLink, index) => 
      limiter.add(async () => {
        const globalIndex = batchStart + index + 1;
        console.log(`⏳ [${globalIndex}/${blogLinks.length}] Extracting: ${blogLink.url}`);
        
        const startTime = Date.now();
        const contentData = await extractBlogContent(blogLink.url, browserPool);
        const extractionTime = Date.now() - startTime;
        
        if (contentData && contentData.content && contentData.wordCount > 200) {
          const result = {
            title: contentData.title || blogLink.title,
            author: contentData.author,
            content: contentData.content,
            tags: contentData.tags,
            created_at: contentData.created_at,
            url: blogLink.url,
            source: blogLink.source,
            score: blogLink.score || 0,
            wordCount: contentData.wordCount,
            readingTime: contentData.readingTime,
            extractionTime: extractionTime
          };
          
          console.log(`✅ [${globalIndex}/${blogLinks.length}] Success: ${contentData.title} (${contentData.wordCount} words, ${extractionTime}ms)`);
          return { success: true, data: result };
        } else {
          console.log(`⚠️  [${globalIndex}/${blogLinks.length}] Skipped: ${blogLink.url} (insufficient content)`);
          return { success: false, url: blogLink.url, reason: 'insufficient_content' };
        }
      })
    );

    // Execute batch in parallel
    const batchResults = await Promise.allSettled(extractionTasks);
    
    // Process batch results
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          results.push(result.value.data);
        } else {
          failed.push(result.value);
        }
      } else {
        const blogLink = batch[index];
        console.error(`💥 [${batchStart + index + 1}/${blogLinks.length}] Promise failed: ${blogLink.url}`);
        failed.push({ url: blogLink.url, reason: 'promise_rejection', error: result.reason.message });
      }
    });

    // Progress update
    const successCount = results.length;
    const failedCount = failed.length;
    console.log(`📊 Batch ${batchIndex + 1} complete: ${successCount} successful, ${failedCount} failed`);

    // Delay between batches to be respectful to servers
    if (batchIndex < batches.length - 1) {
      console.log(`⏱️  Waiting ${CONFIG.DELAY_BETWEEN_BATCHES}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_BATCHES));
    }
  }

  return { results, failed };
}

// Enhanced main function with parallel processing
async function scrapeAndExtract() {
  const browserPool = new BrowserPool();
  
  try {
    console.log('🔍 Discovering blogs from multiple sources...');
    const blogLinks = await scrapeMultipleSources();
    
    if (blogLinks.length === 0) {
      console.log('❌ No blogs discovered. Exiting...');
      return [];
    }

    // Initialize browser pool
    await browserPool.initialize();
    
    console.log(`\n📝 Starting parallel extraction of ${blogLinks.length} blogs...`);
    const startTime = Date.now();
    
    const { results, failed } = await extractBlogsInParallel(blogLinks, browserPool);
    
    const totalTime = Date.now() - startTime;
    const avgTimePerBlog = results.length > 0 ? totalTime / results.length : 0;
    
    // Final statistics
    console.log('\n🎉 EXTRACTION COMPLETE!');
    console.log(`📊 Successfully processed: ${results.length}/${blogLinks.length} blogs`);
    console.log(`❌ Failed extractions: ${failed.length}`);
    console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`📈 Average time per successful blog: ${avgTimePerBlog.toFixed(0)}ms`);
    
    if (results.length > 0) {
      const totalWords = results.reduce((sum, blog) => sum + blog.wordCount, 0);
      const avgWords = totalWords / results.length;
      const totalReadingTime = results.reduce((sum, blog) => sum + blog.readingTime, 0);
      
      console.log(`📚 Total content: ${totalWords.toLocaleString()} words`);
      console.log(`📖 Average article length: ${avgWords.toFixed(0)} words`);
      console.log(`⏰ Total reading time: ${totalReadingTime} minutes`);
    }

    // Log failed extractions for debugging
    if (failed.length > 0) {
      console.log('\n❌ Failed URLs:');
      failed.forEach(({ url, reason }) => {
        console.log(`   - ${url} (${reason})`);
      });
    }

    return results;
    
  } catch (error) {
    console.error('💥 Critical error in scrapeAndExtract:', error);
    return [];
  } finally {
    await browserPool.closeAll();
  }
}

// Your existing scraper functions (keeping them unchanged)
async function scrapeHN() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://news.ycombinator.com', { waitUntil: 'domcontentloaded' });
    
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('.titleline > a'));
      return anchors.map(anchor => ({
        title: anchor.innerText,
        url: anchor.href,
        source: 'hackernews'
      }));
    });
    
    const blogLinks = links.filter(link =>
      !link.url.includes('news.ycombinator.com') &&
      !link.url.includes('github.com') &&
      !link.url.includes('youtube.com') &&
      !link.url.endsWith('.pdf') &&
      !link.url.includes('twitter.com')
    );
    
    return blogLinks;
  } catch (error) {
    console.error('Error scraping HN:', error);
    return [];
  } finally {
    await browser.close();
  }
}

async function scrapeLobsters() {
  try {
    const response = await axios.get('https://lobste.rs/hottest.json', {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlogBot/1.0)' }
    });

    const articles = response.data
      .filter(story => story.url && !story.url.includes('lobste.rs'))
      .map(story => ({
        title: story.title,
        url: story.url,
        source: 'lobsters',
        score: story.score || 0
      }))
      .filter(filterBlogUrls);

    if (articles.length > 0) {
      return articles;
    }

    console.warn('API returned no usable articles. Falling back to web scraping...');
  } catch (apiError) {
    console.warn('Lobsters API failed. Falling back to scraping:', apiError.message);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://lobste.rs/newest', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    const articles = await page.evaluate(() => {
      const stories = Array.from(document.querySelectorAll('.story'));
      return stories.map(story => {
        const titleLink = story.querySelector('.u-url');
        const title = titleLink?.innerText?.trim();
        const url = titleLink?.href;
        if (title && url && !url.includes('lobste.rs')) {
          return { title, url, source: 'lobsters', score: 0 };
        }
        return null;
      }).filter(Boolean);
    });

    return articles.filter(filterBlogUrls);
  } catch (err) {
    console.error('Web scraping failed:', err.message);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function scrapeReddit() {
  const subreddits = [
    { name: 'TrueReddit', minScore: 50 },
    { name: 'DepthHub', minScore: 20 },
    { name: 'programming', minScore: 100 },
    { name: 'MachineLearning', minScore: 30 }
  ];
  
  const allLinks = [];
  
  for (const { name, minScore } of subreddits) {
    try {
      const response = await axios.get(`https://www.reddit.com/r/${name}/hot.json?limit=25`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Blog-Discovery-Bot/1.0' }
      });
      
      if (response.data?.data?.children) {
        const links = response.data.data.children
          .filter(post => 
            post.data.url && 
            !post.data.url.includes('reddit.com') &&
            post.data.score >= minScore
          )
          .map(post => ({
            title: post.data.title,
            url: post.data.url,
            source: `reddit_${name}`,
            score: post.data.score
          }))
          .filter(filterBlogUrls);
        
        allLinks.push(...links);
      }
    } catch (error) {
      console.error(`Error scraping r/${name}:`, error);
    }
  }
  
  return allLinks;
}

async function scrapeDevTo() {
  try {
    const response = await axios.get('https://dev.to/api/articles?per_page=30&top=7', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlogBot/1.0)' }
    });
    
    return response.data
      .filter(article => article.canonical_url && !article.canonical_url.includes('dev.to'))
      .map(article => ({
        title: article.title,
        url: article.canonical_url,
        source: 'devto',
        score: article.public_reactions_count || 0
      }))
      .filter(filterBlogUrls);
      
  } catch (error) {
    console.error('Error scraping Dev.to:', error.message);
    return [];
  }
}

async function scrapeHashNode() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://hashnode.com/featured', { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });
    
    await page.waitForSelector('article', { timeout: 5000 });
    
    const links = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('article'));
      return articles.map(article => {
        const titleLink = article.querySelector('h1 a, h2 a, h3 a');
        const title = titleLink?.innerText?.trim();
        const url = titleLink?.href;
        
        if (title && url && !url.includes('hashnode.com')) {
          return { title, url, source: 'hashnode', score: 0 };
        }
        return null;
      }).filter(Boolean);
    });
    
    await browser.close();
    return links.filter(filterBlogUrls);
    
  } catch (error) {
    console.error('Error scraping HashNode:', error.message);
    await browser.close();
    return [];
  }
}

async function scrapeIndieHackers() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://www.indiehackers.com/posts', { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });
    
    await page.waitForSelector('h3 a, h2 a', { timeout: 5000 });
    
    const links = await page.evaluate(() => {
      const titleLinks = Array.from(document.querySelectorAll('h3 a, h2 a'));
      return titleLinks
        .filter(link => link.href && !link.href.includes('indiehackers.com'))
        .map(link => ({
          title: link.innerText.trim(),
          url: link.href,
          source: 'indiehackers'
        }));
    });
    
    return links.filter(filterBlogUrls);
  } catch (error) {
    console.error('Error scraping IndieHackers:', error);
    return [];
  } finally {
    await browser.close();
  }
}

function filterBlogUrls(link) {
  if (!link.url) return false;
  
  const url = link.url.toLowerCase();
  
  const excludeDomains = [
    'github.com', 'youtube.com', 'facebook.com',
    'linkedin.com', 'instagram.com',  
    'amazon.com', 'wikipedia.org', 'docs.google.com'
  ];
  
  const excludeExtensions = ['.pdf', '.doc', '.docx', '.zip', '.png', '.jpg', '.mp4'];
  
  if (excludeDomains.some(domain => url.includes(domain))) {
    return false;
  }
  
  if (excludeExtensions.some(ext => url.endsWith(ext))) {
    return false;
  }
  
  return true;
}

module.exports = scrapeAndExtract;

// Run if called directly
if (require.main === module) {
  scrapeAndExtract().then(results => {
    console.log(`\n🏁 Final results: ${results.length} blogs successfully extracted`);
    process.exit(0);
  }).catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}
