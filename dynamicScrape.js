const puppeteer = require('puppeteer');

async function scrapeHN() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://news.ycombinator.com', { waitUntil: 'domcontentloaded' });
  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('.titleline > a'));
    return anchors.map(anchor => ({
      title: anchor.innerText,
      url: anchor.href
    }));
  });


  const blogLinks = links.filter(link =>
    !link.url.includes('news.ycombinator.com') &&
    !link.url.includes('github.com') &&
    !link.url.includes('youtube.com') &&
    !link.url.endsWith('.pdf') &&
    !link.url.includes('twitter.com')
  );

  await browser.close();

  return blogLinks;
}

module.exports = scrapeHN;