var Search={};
/** @type Array.<String> */
Search.resultHikeIds=[];
// TODO! Change BASE_URL to '' once this is served from wta.org
/** @const */
Search.BASE_URL = 'http://www.wta.org/go-hiking/';
/** @const */
Search.SEARCH_NUM = 20;

Search.initializeSearch = function(UI) {
  jq('#search-button').click(Search.searchButtonHandler_);
  jq('#geocode-button').click(Search.geocodeButtonHandler_);
  // HACK!!! Pass in a proper interface of some kind.
  Search.UI = UI;
};

/** Handle search button click by issuing search ajax request. */
Search.searchButtonHandler_ = function() {
  Search.UI.selectHike(null);

  var query = jq('#search-query').attr('value');
  var fulltext = jq('#search-fulltext').attr('checked');
  jq('#tabc-results').html('Searching hike database for <b id="query-term"></b>...');
  jq('#query-term').text(query); // Use .text to get proper escaping
  Search.showTab('results');
  Search.doSearchFilter(query, fulltext);
  Search.doSearch(query, fulltext, 0);
};

/** Fetch search results from server. */
Search.doSearch = function(query, fulltext, start) {
  var params = {query: query, start: start, num: Search.SEARCH_NUM};
  if (fulltext) params.fulltext = '1';
  jq.ajax({
    url: Search.BASE_URL + '@@trailhead-text-search',
    data: params,
    success: Search.searchResultsHandler,
    jsonp: 'jsonp_callback',
    dataType: 'jsonp' });
};

/** Fetch just the ids of matching hikes with coordinates for filtering purposes. */
Search.doSearchFilter = function(query, fulltext) {
  var params = {query: query, all_mapped: '1'};
  if (fulltext) params.fulltext = '1';
  jq.ajax({
    url: Search.BASE_URL + '@@trailhead-text-search',
    data: params,
    success: Search.searchFilterHandler,
    jsonp: 'jsonp_callback',
    dataType: 'jsonp' });
};

/** Render the search results based on the server response. */
Search.searchResultsHandler = function(json) {
  var total = json.count;
  var start = Number(json.start) || 0;
  var results = json.data;
  var len = results.length;
  var end = Math.min(start + len, total);
  var html = total == 0 ?
    'No results' :
    'Results <b>' + (start+1) + ' - ' + end + '</b> of <b>' + total + '</b><p>';
  jq('#tabc-results').html(html);

  var result;
  for (var i=0; i<len; ++i) {
    result = results[i];
    var link = document.createElement('a');
    link.setAttribute('href', 'javascript:void(0)');
    link.result = result;
    jq(link).text(result.name).click(Search.clickSearchResult);
    jq('#tabc-results').append('' + (1 + start + i) + '. ')
                       .append(link);

    if (result.m) {
      // Display hike icon indicating result has coordinates.
      var hike = Data.getHikeById(result.id);
      if (hike) {
        var img = document.createElement('img');
        img.setAttribute('src', 'icon-hiker.png');
        img.setAttribute('title', 'Center map on this hike');
        img.result = result;
        jq(img).click(Search.clickSearchResultIcon);
        jq('#tabc-results').append('&nbsp;').append(img);
      }
    }

    jq('#tabc-results').append('<p>');
  }

  var query = jq('#search-query').attr('value');
  var fulltext = jq('#search-fulltext').attr('checked');
  if (start > 0) {
    var prevLink = document.createElement('a');
    prevLink.setAttribute('href', 'javascript:void(0)');
    jq(prevLink).html('&laquo; Previous')
                .click(function() {Search.doSearch(query, fulltext, start - Search.SEARCH_NUM)});
    jq('#tabc-results').append(prevLink).append(' ');
  }
  if (end < total) {
    var nextLink = document.createElement('a');
    nextLink.setAttribute('href', 'javascript:void(0)');
    jq(nextLink).html('Next &raquo;')
                .click(function() {Search.doSearch(query, fulltext, start + Search.SEARCH_NUM)});
    jq('#tabc-results').append(nextLink);
  }
  jq('#tabc-results').append('<p>');
  Search.searchResultsBarrier();

  // Exactly 1 result, select it
  if (total == 1 && len == 1) Search.selectHike(result.id, result.name);
}

/** Filter which hikes are visible based on the user query, and update the viewport. */
Search.searchFilterHandler = function(json) {
  Search.resultHikeIds = json;
  var hikes = [];
  for (var i=0; i<Search.resultHikeIds.length; ++i) {
    var h = Data.getHikeById(Search.resultHikeIds[i]);
    if (h) hikes.push(h);
  }
  Search.UI.setBounds(hikes);
  Search.searchResultsBarrier();
}

/** We need to perform an action (executing search filters) when both ajax
calls successfully finish, but we don't know what order they'll arrive.
So create a "barrier" that keeps track of where we stand, and do the action
when both handlers have invoked it. */
Search.barrierPending_ = 0;
Search.searchResultsBarrier = function() {
  if (++Search.barrierPending_ >= 2) {
    Search.executeFilters();
    Search.barrierPending_ = 0;
  }
};

/** Float a temporary error message on the map. */
Search.displayError = function(msg) {
  // I tried putting the CSS into the HTML, but jquery manipulations seemed to override them.
  jq('#map_canvas').append(jq('#errorbox'));
  jq('#errorbox').css({
      position: 'absolute',
      padding: '1em',
      border: '1px solid red',
      background: 'white',
      width: '250px',
      right: '2em',
      margin: 'auto'
    })
    .text(msg)
    .show()
    .fadeOut(5000);
};

/** Search result map link event handler.  this == clicked link. */
Search.clickSearchResult = function() {
  var result = this.result;
  if (result.m) {
    // TODO: unused var??
    var hike = Data.getHikeById(result.id);
  } else {
    Search.displayError('Trailhead location not available for this hike');
  }
  Search.selectHike(result.id, result.name);
}

/** Search result icon click event handler.  this == clicked img. */
Search.clickSearchResultIcon = function() {
  var hike = Data.getHikeById(this.result.id);
  if (!hike) return;
  Search.UI.theMap.panTo(new google.maps.LatLng(hike.lat, hike.lng));
};

/** Visually select the hike, center it, and fetch hike details. */
Search.selectHike = function(id, name) {
  Search.UI.selectHikeById(id);
  Search.getHikeDetails(id, name);
};

/**
 * Initiate ajax query to fetch hike details and show them in the details tab.
 */
Search.getHikeDetails = function(id, name) {
  var url = Search.BASE_URL + '@@trailhead-search-hike-details?h=' + id;
  jq('#tabc-details').html('Loading details for <b>' + name + '</b>...');
  Search.showTab('details');
  jq.ajax({
    url: url,
    data: 'html',
    success: function(data) { jq('#tabc-details').html(data); },
    error: function(xhr, status) { jq('#tabc-details').html(status); }
  });
};

/**
 * For each element marked with class=region-zoom, set up a click handler to
 * zoom straight to the lat,lng,z in the element's attributes.
 * @param {google.maps.Map} map
 */
Search.initializeRegionZooms = function(map) {
  jq('.region-zoom').each(function(idx, link) {
    var lat = Number(jq(link).attr('lat'));
    var lng = Number(jq(link).attr('lng'));
    var z = Number(jq(link).attr('z'));
    if (lat && lng && z) {
      google.maps.event.addDomListener(link, 'click', function() {
	map.setZoom(z);
        map.panTo(new google.maps.LatLng(lat, lng));
      });
    }
  });
};

// ====== Search tab functionality; TODO: separate file?

/**
 * Show the given tab, hide other tabs.
 * @param {string} tabname The tab id, not including 'tab-' or 'tabc-' prefix.
 */
Search.showTab = function(tabname) {
  jq('.tab-contents').addClass('tab-hidden');
  jq('#tabc-' + tabname).removeClass('tab-hidden');
  jq('.tab-active').addClass('tab-inactive').removeClass('tab-active');
  jq('#tab-' + tabname).addClass('tab-active').removeClass('tab-inactive');
};

/**
 * Handler for clicking an arbitrary tab.  The specific tab is stored in the event data.
 */
Search.tabClickHandler = function(event) {
  Search.showTab(event.data.tabname);
};

/**
 * Set up handlers for tab clicks.
 */
Search.initializeTabs = function() {
  jq('#tab-details').bind('click', {tabname: 'details'}, Search.tabClickHandler);
  jq('#tab-search').bind('click', {tabname: 'search'}, Search.tabClickHandler);
  jq('#tab-results').bind('click', {tabname: 'results'}, Search.tabClickHandler);
};

// ====== Search form functionality

/** Set up event handlers for the map filter inputs on the page. */
Search.initializeFilters = function() {
  jq('.feature-filter').each(function(idx, filterElem) {
    google.maps.event.addDomListener(filterElem, 'change', Search.executeFilters);
  });
  jq('#clear-form').click(Search.clearForm);
  jq('#clear-filters').click(Search.clearFilters);
};

/**
 * Examine the DOM to determine what filters are active.
 * @return {Array.<Function(Hike):boolean>} List of filter functions.
 */
Search.getFiltersFromDom = function() {
  var filters = [];

  // For each checked checkbox, add filter based on its "feature" attribute
  jq('input[type=checkbox].feature-filter').each(function(idx, checkbox) {
    if (checkbox.checked) {
      var feature = jq(checkbox).attr('feature');
      filters.push(function(hike) {
        return hike.features.indexOf(feature) != -1;
      });
    }
  })

  var mileage = jq('#filter-mileage-select')[0];
  switch (mileage.selectedIndex) {
    case 1: filters.push(function(hike) {return hike.length && hike.length < 3;}); break;
    case 2: filters.push(function(hike) {return hike.length >= 3 && hike.length < 8;}); break;
    case 3: filters.push(function(hike) {return hike.length >= 8 && hike.length < 12;}); break;
    case 4: filters.push(function(hike) {return hike.length >= 12;}); break;
  }
  var elevationgain = jq('#filter-elevationgain-select')[0];
  switch (elevationgain.selectedIndex) {
    case 1: filters.push(function(hike) {return hike.elevGain && hike.elevGain < 500;}); break;
    case 2: filters.push(function(hike) {return hike.elevGain >= 500 && hike.elevGain < 1500;}); break;
    case 3: filters.push(function(hike) {return hike.elevGain >= 1500 && hike.elevGain < 3000;}); break;
    case 4: filters.push(function(hike) {return hike.elevGain >= 3000;}); break;
  }
  
  return filters;
};

Search.clearFilters = function() {
  jq('input[type=checkbox].feature-filter').attr('checked', false);
  jq('select.feature-filter').attr('selectedIndex', 0);
  jq('#search-query').attr('value', '');
  jq('#search-fulltext').attr('checked', false);
  Search.resultHikeIds = [];
  Search.executeFilters();
};

Search.clearForm = function() {
  Search.clearFilters();
  Search.UI.selectHike(null);
  Search.UI.resetBounds();
};

/**
 * Show or hide every hike marker based on whether it matches current filters.
 */
Search.executeFilters = function() {
  var filters = Search.getFiltersFromDom();
  if (Search.resultHikeIds.length > 0) {
    filters.push(function(hike) {
      for (var k=0; k<Search.resultHikeIds.length; ++k)
        if (hike.id == Search.resultHikeIds[k]) return true;
      return false;
    });
  }
  Search.UI.filterMarkers(filters);
};

/**
 * Initiate ajax query to fetch hike details and show them in the details tab.
 */
Search.getHikeDetails = function(id, name) {
  var url = Search.BASE_URL + '@@trailhead-search-hike-details?h=' + id;
  jq('#tabc-details').html('Loading details for <b>' + name + '</b>...');
  Search.showTab('details');
  jq.ajax({
    url: url,
    data: 'html',
    success: function(data) { jq('#tabc-details').html(data); },
    error: function(xhr, status) { jq('#tabc-details').html(status); }
  });
};

Search.geocodeButtonHandler_ = function() {
  var query = jq('#geocode-text').attr('value');
  if (query) {
    if (!Search.geocoder_) {
      Search.geocoder_ = new google.maps.Geocoder();
    }
    // TODO: add bounds hint, maybe viewport hint
    Search.geocoder_.geocode({
      address: query,
      bounds: Search.UI.ALLOWED_BOUNDS,
      componentRestrictions: {
	administrativeArea: 'WA'
      },
      region: 'us'
    }, Search.geocodeQueryHandler_);
  }
};

/**
 * @param {Array.<google.maps.GeocoderResults>} results
 * @param {google.maps.GeocoderStatus} status
 */
Search.geocodeQueryHandler_ = function(results, status) {
  // TODO: error handling
  if (status == google.maps.GeocoderStatus.OK && results.length > 0) {
    var result = results[0];
    if (result && result.geometry.viewport) {
      Search.UI.theMap.fitBounds(result.geometry.viewport);
    }
  }
};
