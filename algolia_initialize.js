var ALGOLIA_INSIGHTS_SRC = "https://cdn.jsdelivr.net/npm/search-insights@2.17.3/dist/search-insights.min.js";
!function(e,a,t,n,s,i,c){e.AlgoliaAnalyticsObject=s,e[s]=e[s]||function(){
  (e[s].queue=e[s].queue||[]).push(arguments)},e[s].version=(n.match(/@([^\/]+)\/?/)||[])[1],
  i=a.createElement(t),c=a.getElementsByTagName(t)[0],i.async=1,i.src=n,c.parentNode.insertBefore(i,c)
}(window,document,"script",ALGOLIA_INSIGHTS_SRC,"aa");

/* initialise right away */
aa('init', {
  appId:  '6Z7PXO4P9V',
  apiKey: 'e65463194a13249bb897c0fcc1bbbed3',  // any key with the `search` ACL :contentReference[oaicite:1]{index=1}
  useCookie: true,
});

aa('onUserTokenChange',
(token) => {
  console.log('Insights userToken →', token);
  localStorage.alg_user = token;          // now it’s defined
},
{ immediate: true }
);