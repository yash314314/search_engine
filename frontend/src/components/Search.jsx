import React, { useEffect, useState, useRef } from "react";
import instantsearch from "instantsearch.js";
import { searchBox, hits } from "instantsearch.js/es/widgets";
import TypesenseInstantSearchAdapter from "typesense-instantsearch-adapter";
import "..//Search.css";

const typesenseInstantsearchAdapter = new TypesenseInstantSearchAdapter({
  server: {
    apiKey: "xyz", // Replace with real search-only API key
    nodes: [{ host: "localhost", port: "8108", protocol: "http" }],
  },
  additionalSearchParameters: {
    query_by: "title,content,tags,author",
  },
});

const searchClient = typesenseInstantsearchAdapter.searchClient;

export default function Search() {
  const [query, setQuery] = useState("");
  const searchInstance = useRef(null);
  const hitsAdded = useRef(false);

  useEffect(() => {
    searchInstance.current = instantsearch({
      indexName: "blogs",
      searchClient,
      insights: false,
    });

    searchInstance.current.addWidgets([
      searchBox({
        container: "#searchbox",
        showReset: true,
        showSubmit: false,
        placeholder: "Search blogs...",
        queryHook(queryFromInput, searchFn) {
          setQuery(queryFromInput);
          searchFn(queryFromInput);
        },
      }),
    ]);

    searchInstance.current.start();
  }, []);

  useEffect(() => {
    // Add hits widget once query is typed and container exists
    if (query.trim() !== "" && !hitsAdded.current && document.querySelector("#hits")) {
      searchInstance.current.addWidgets([
        hits({
          container: "#hits",
          templates: {
            item(hit) {
              return `
                <div class="hit">
                  <h2>${hit.title}</h2>
                  <p>${hit.content?.slice(0, 150)}...</p>
                </div>
              `;
            },
            empty() {
              return `<div class="no-results">😕 No blogs found.</div>`;
            },
          },
        }),
      ]);
      hitsAdded.current = true;
    }
  }, [query]);

  return (
    <div className="search-wrapper">
      <div id="searchbox" />
      {query.trim() !== "" && <div id="hits" className="hits-container" />}
    </div>
  );
}
