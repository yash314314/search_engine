const scrapeHN = require("./dynamicScrape.js");

async function main() {
  try {
    const blogLinks = await scrapeHN();
    console.log('Scraped Blog Links:');
    blogLinks.forEach((link, index) => {
      console.log(`${index + 1}: ${link.title} - ${link.url}`);
    });
  } catch (error) {
    console.error('Error scraping Hacker News:', error);
  }
}
main();