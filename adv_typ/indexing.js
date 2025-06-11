const typesense = require('./typesenseclient');
const scrapeAndExtract = require('./blogExtracter');
const crypto = require('crypto');

// Configuration for indexing
const INDEXING_CONFIG = {
  BATCH_SIZE: 50,           // Number of documents to process in each batch
  RETRY_ATTEMPTS: 3,        // Number of retry attempts for failed operations
  SIMILARITY_THRESHOLD: 0.8, // Content similarity threshold (0-1)
  TITLE_SIMILARITY_THRESHOLD: 0.9, // Title similarity threshold
  MIN_CONTENT_LENGTH: 200   // Minimum content length to consider
};

// Generate content hash for duplicate detection
function generateContentHash(content) {
  return crypto.createHash('sha256').update(content.toLowerCase().trim()).digest('hex');
}

// Generate URL hash for duplicate detection
function generateUrlHash(url) {
  try {
    const normalizedUrl = new URL(url);
    // Remove common tracking parameters
    const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source'];
    paramsToRemove.forEach(param => normalizedUrl.searchParams.delete(param));
    return crypto.createHash('md5').update(normalizedUrl.toString().toLowerCase()).digest('hex');
  } catch (error) {
    // If URL parsing fails, use the original URL
    return crypto.createHash('md5').update(url.toLowerCase()).digest('hex');
  }
}

// Calculate text similarity using Jaccard similarity
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(word => word.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(word => word.length > 3));
  
  const intersection = new Set([...words1].filter(word => words2.has(word)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

// Check if content is similar to existing documents
function isDuplicateContent(newBlog, existingBlogs) {
  return existingBlogs.some(existing => {
    // Check URL similarity
    if (existing.url_hash === newBlog.url_hash) {
      return true;
    }
    
    // Check content hash
    if (existing.content_hash === newBlog.content_hash) {
      return true;
    }
    
    // Check title similarity
    const titleSimilarity = calculateSimilarity(newBlog.title, existing.title);
    if (titleSimilarity >= INDEXING_CONFIG.TITLE_SIMILARITY_THRESHOLD) {
      return true;
    }
    
    // Check content similarity for shorter articles
    if (newBlog.wordCount < 1000 && existing.wordCount < 1000) {
      const contentSimilarity = calculateSimilarity(
        newBlog.content.substring(0, 500),
        existing.content.substring(0, 500)
      );
      if (contentSimilarity >= INDEXING_CONFIG.SIMILARITY_THRESHOLD) {
        return true;
      }
    }
    
    return false;
  });
}

// Fetch existing documents from Typesense
async function fetchExistingBlogs() {
  try {
    console.log('📊 Fetching existing blogs from Typesense...');
    
    // Get all documents (you might want to paginate for very large collections)
    const searchResults = await typesense.collections('blogs').documents().search({
      q: '*',
      per_page: 1000, // Adjust based on your collection size
      page: 1
    });
    
    const existingBlogs = searchResults.hits?.map(hit => ({
      id: hit.document.id,
      title: hit.document.title || '',
      url: hit.document.url || '',
      url_hash: hit.document.url_hash || '',
      content_hash: hit.document.content_hash || '',
      content: hit.document.content || '',
      wordCount: hit.document.wordCount || 0,
      created_at: hit.document.created_at || 0
    })) || [];
    
    console.log(`📋 Found ${existingBlogs.length} existing blogs in index`);
    return existingBlogs;
    
  } catch (error) {
    if (error.httpStatus === 404) {
      console.log('📝 Collection does not exist yet, will create new one');
      return [];
    }
    console.error('❌ Error fetching existing blogs:', error);
    return [];
  }
}

function prepareBlogDocument(blog, index) {
  const urlHash = generateUrlHash(blog.url);
  const contentHash = generateContentHash(blog.content);
  
  return {
    id: urlHash, // Unique ID based on URL hash and timestamp
    title: blog.title || 'Untitled',
    author: blog.author || 'Unknown',
    content: blog.content,
    tags: Array.isArray(blog.tags) ? blog.tags : [],
    created_at: blog.created_at || Math.floor(Date.now() / 1000),
    url: blog.url,
    source: blog.source || 'unknown',
    score: blog.score || 0,
    wordCount: blog.wordCount || 0,
    readingTime: blog.readingTime || 0,
    extractionTime: blog.extractionTime || 0,
    url_hash: urlHash,
    content_hash: contentHash,
    indexed_at: Math.floor(Date.now() / 1000),
    search_text: `${blog.title} ${blog.content} ${blog.tags?.join(' ') || ''} ${blog.author || ''}`.toLowerCase()
  };
}

// Filter out duplicates and low-quality content
function filterBlogs(newBlogs, existingBlogs) {
  console.log('🔍 Filtering blogs for duplicates and quality...');
  
  const filtered = [];
  const duplicates = [];
  const lowQuality = [];
  
  for (const blog of newBlogs) {
    // Check content length
    if (!blog.content || blog.content.length < INDEXING_CONFIG.MIN_CONTENT_LENGTH) {
      lowQuality.push({ url: blog.url, reason: 'insufficient_content' });
      continue;
    }
    
    // Check for missing essential fields
    if (!blog.title || !blog.url) {
      lowQuality.push({ url: blog.url, reason: 'missing_essential_fields' });
      continue;
    }
    
    // Prepare document for duplicate checking
    const preparedBlog = prepareBlogDocument(blog);
    
    // Check for duplicates
    if (isDuplicateContent(preparedBlog, existingBlogs) || 
        isDuplicateContent(preparedBlog, filtered)) {
      duplicates.push({ url: blog.url, title: blog.title });
      continue;
    }
    
    filtered.push(preparedBlog);
  }
  
  console.log(`✅ Filtered results:`);
  console.log(`   - New blogs to index: ${filtered.length}`);
  console.log(`   - Duplicates found: ${duplicates.length}`);
  console.log(`   - Low quality filtered: ${lowQuality.length}`);
  
  if (duplicates.length > 0) {
    console.log('\n📋 Duplicate blogs (skipped):');
    duplicates.forEach(dup => console.log(`   - ${dup.title} (${dup.url})`));
  }
  
  if (lowQuality.length > 0) {
    console.log('\n🗑️  Low quality blogs (skipped):');
    lowQuality.forEach(lq => console.log(`   - ${lq.url} (${lq.reason})`));
  }
  
  return { filtered, duplicates, lowQuality };
}

// Index blogs in batches with retry logic
async function indexBlogsInBatches(blogs) {
  if (blogs.length === 0) {
    console.log('📭 No blogs to index');
    return { success: 0, failed: 0 };
  }
  
  console.log(`📦 Indexing ${blogs.length} blogs in batches of ${INDEXING_CONFIG.BATCH_SIZE}...`);
  
  const batches = [];
  for (let i = 0; i < blogs.length; i += INDEXING_CONFIG.BATCH_SIZE) {
    batches.push(blogs.slice(i, i + INDEXING_CONFIG.BATCH_SIZE));
  }
  
  let totalSuccess = 0;
  let totalFailed = 0;
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`\n🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} documents)`);
    
    const { success, failed } = await indexBatchWithRetry(batch, batchIndex + 1);
    totalSuccess += success;
    totalFailed += failed;
    
    // Small delay between batches to avoid overwhelming Typesense
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return { success: totalSuccess, failed: totalFailed };
}

// Index a single batch with retry logic
async function indexBatchWithRetry(batch, batchNumber, attempt = 1) {
  try {
    console.log(`⏳ Indexing batch ${batchNumber} (attempt ${attempt}/${INDEXING_CONFIG.RETRY_ATTEMPTS})`);
    
    // Use Typesense's import API for batch operations
    const results = await typesense.collections('blogs').documents().import(batch, {
      action: 'upsert' // Use upsert to handle potential duplicates gracefully
    });
    
    // Parse results
    let successCount = 0;
    let failedCount = 0;
    const failures = [];
    
    results.forEach((result, index) => {
      try {
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        if (parsed.success === true) {
          successCount++;
        } else {
          failedCount++;
          failures.push({
            document: batch[index],
            error: parsed.error || 'Unknown error'
          });
        }
      } catch (parseError) {
        failedCount++;
        failures.push({
          document: batch[index],
          error: 'Failed to parse result'
        });
      }
    });
    
    console.log(`✅ Batch ${batchNumber}: ${successCount} successful, ${failedCount} failed`);
    
    if (failures.length > 0 && attempt < INDEXING_CONFIG.RETRY_ATTEMPTS) {
      console.log(`🔄 Retrying ${failures.length} failed documents...`);
      const retryBatch = failures.map(f => f.document);
      const retryResult = await indexBatchWithRetry(retryBatch, batchNumber, attempt + 1);
      return {
        success: successCount + retryResult.success,
        failed: failedCount - retryResult.success + retryResult.failed
      };
    }
    
    if (failures.length > 0) {
      console.error(`❌ Final failures in batch ${batchNumber}:`);
      failures.forEach(f => console.error(`   - ${f.document.title}: ${f.error}`));
    }
    
    return { success: successCount, failed: failedCount };
    
  } catch (error) {
    console.error(`💥 Batch ${batchNumber} failed (attempt ${attempt}):`, error.message);
    
    if (attempt < INDEXING_CONFIG.RETRY_ATTEMPTS) {
      console.log(`🔄 Retrying batch ${batchNumber} in 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return indexBatchWithRetry(batch, batchNumber, attempt + 1);
    }
    
    return { success: 0, failed: batch.length };
  }
}

// Main indexing function
async function indexBlogs(blogs) {
  const startTime = Date.now();
  
  try {
    // Fetch existing blogs to check for duplicates
    const existingBlogs = await fetchExistingBlogs();
    
    // Filter out duplicates and low-quality content
    const { filtered: newBlogs, duplicates, lowQuality } = filterBlogs(blogs, existingBlogs);
    
    if (newBlogs.length === 0) {
      console.log('🎯 No new blogs to index after filtering');
      return {
        success: 0,
        failed: 0,
        duplicates: duplicates.length,
        lowQuality: lowQuality.length,
        totalProcessed: blogs.length
      };
    }
    
    // Index new blogs in batches
    const { success, failed } = await indexBlogsInBatches(newBlogs);
    
    const totalTime = Date.now() - startTime;
    
    // Final statistics
    console.log('\n🎉 INDEXING COMPLETE!');
    console.log(`📊 Results:`);
    console.log(`   - Successfully indexed: ${success}/${newBlogs.length}`);
    console.log(`   - Failed to index: ${failed}`);
    console.log(`   - Duplicates skipped: ${duplicates.length}`);
    console.log(`   - Low quality skipped: ${lowQuality.length}`);
    console.log(`   - Total processed: ${blogs.length}`);
    console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(2)}s`);
    
    return {
      success,
      failed,
      duplicates: duplicates.length,
      lowQuality: lowQuality.length,
      totalProcessed: blogs.length,
      processingTime: totalTime
    };
    
  } catch (error) {
    console.error('💥 Critical error in indexing:', error);
    throw error;
  }
}

// Enhanced main function with better error handling
async function main() {
  console.log('🚀 Starting blog scraping and indexing process...\n');
  
  try {
    // Scrape blogs
    console.log('📡 Scraping blogs from multiple sources...');
    const blogs = await scrapeAndExtract();
    
    if (!blogs || blogs.length === 0) {
      console.log('❌ No blogs found during scraping process');
      return;
    }
    
    console.log(`\n📚 Found ${blogs.length} blogs from scraping`);
    
    // Index blogs with duplicate prevention
    const results = await indexBlogs(blogs);
    
    // Summary
    console.log('\n📋 FINAL SUMMARY:');
    console.log(`✅ Successfully indexed: ${results.success} new blogs`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`🔄 Duplicates prevented: ${results.duplicates}`);
    console.log(`🗑️  Low quality filtered: ${results.lowQuality}`);
    console.log(`📈 Success rate: ${((results.success / results.totalProcessed) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('💥 Error in main process:', error);
    process.exit(1);
  }
}

// Export for use in other modules
module.exports = {
  indexBlogs,
  main
};

// Run if called directly
if (require.main === module) {
  main();
}