const typesense = require('./typesenseclient');

(async () => {
  try {
    console.log('📦 Fetching all blogs from Typesense...');

    const allHits = [];
    let page = 1;
    let totalPages = 1;

    // Fetch all documents with pagination
    while (page <= totalPages) {
      const result = await typesense.collections('blogs').documents().search({
        q: '*',
        query_by: 'title',
        per_page: 250,
        page,
      });

      totalPages = result.found / 250 + 1;
      allHits.push(...result.hits.map(h => h.document));
      page++;
    }

    console.log(`🔍 Analyzing ${allHits.length} documents for duplicates...`);

    const seenUrlHashes = new Set();
    const seenContentHashes = new Set();
    const duplicates = [];

    for (const doc of allHits) {
      const isDuplicate =
        seenUrlHashes.has(doc.url_hash) || seenContentHashes.has(doc.content_hash);

      if (isDuplicate) {
        duplicates.push({
          id: doc.id,
          title: doc.title,
          url: doc.url,
        });
      } else {
        seenUrlHashes.add(doc.url_hash);
        seenContentHashes.add(doc.content_hash);
      }
    }

    console.log(`✅ Duplicate check complete. Found ${duplicates.length} duplicates.`);

    if (duplicates.length) {
      console.log('\n🧾 Duplicates:');
      duplicates.forEach((dup, i) =>
        console.log(`${i + 1}. ${dup.title} (${dup.url})`)
      );
    } else {
      console.log('🎉 No duplicates found!');
    }
  } catch (err) {
    console.error('❌ Error checking for duplicates:', err);
  }
})();
