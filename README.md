
This repo contains the files used in our current Algolia implementation. 

## 🔍 Search Results Page (`/search/`)

- **File:** [algolia-search-results.html](algolia-search-results.html)  
- **Script:** [algolia-search-results.js](algolia-search-results.js)
- **Page:** [/search/](https://www.rugstudio.com/search/)
- **Description:** This is our dedicated search results page. It uses InstantSearch.js to power the search experience. The JavaScript file handles index configuration, widget initialization, and search rendering logic.

## 📥 Global Initialization

- **File:** [algolia_initialize.js](algolia_initialize.js)
- **Placement:** Included in the footer of all pages  
- **Description:** This script sets up the Algolia search client globally and prepares shared functionality that applies across all pages, such as Insights tracking and user token setup.

## 📄 Landing Pages (Preset Searches)

- **Template:** [blogpost-sitechamp-template.html](blogpost-sitechamp-template.html)
- **Script:** [algolia-landing.js](algolia-landing.js)
- **Examples:** [rugstudio.com/rugs/karastan-perception](https://www.rugstudio.com/rugs/karastan-perception), [rugstudio.com/rugs/loloi-patina-pj-03](https://www.rugstudio.com/rugs/loloi-patina-pj-03)
- **Description:** These are static or semi-static landing pages with predefined queries. There are going to be some weird 

## Notes

- We're using InstantSearch.js, and all pages are `.aspx` pages, each containing a top-level `<form>` element. I've accounted for this structure to avoid nested forms or DOM conflicts with Algolia widgets.
