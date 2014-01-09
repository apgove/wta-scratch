var nullFunc = function() {};

// Define objects that should be externally visible to other scripts, wrapped
// in a "namespace object".
var WtaTrailheadSearch = {
  // This function should be called first, with an array of hike data
  setHikes: nullFunc,
  // Then this function processes the data and creates the map.
  initializeTrailheadSearch: nullFunc,
  // Change the size of the map
  expandMap: nullFunc, restoreMap: nullFunc
};

// TODO: geocode free text, some hardcoded regions
// TODO: entry point setting particular region
// TODO: constrain panning to washington state
// TODO: expand/restore map (independent of DOM?)
// TODO: hyperlink tooltip hikes
// TODO: zoom-based clustering

// Wrap everything else in an anonymous function to avoid name collisions.
// BEGIN ANONYMOUS NAMESPACE
(function() {

// NOTE: must start chrome with --disable-web-security to avoid CORS errors.
var UI={};
/** @type {google.maps.Map} */
UI.theMap=null;
/** @type {MarkerTooltip} */
UI.theTooltip=null;
/** @type {Array.<google.maps.Marker>} */
UI.allMarkers=[];
/** @type {google.maps.Marker} */
UI.hoveredMarker = null;
/** @type {google.maps.Marker} */
UI.selectedMarker = null;

/********************************************/
// Bootstrap initialization

UI.initApp = function() {
  UI.initMap(document.getElementById("map_canvas"));
  UI.initMarkers(Data.allHikes);
  Search.initializeRegionZooms(UI.theMap);
  //google.maps.event.addListener(UI.theMap, 'zoom_changed', function() {
  //  var map = UI.theMap;
  //  var z = map.getZoom();
  //  var icon = z < 8 ? icon8 : z < 12 ? icon12 : icon16;
  //  var markers = UI.allMarkers;
  //  var n = markers.length;
  //  for (var i=0; i<n; i++) {
  //    var marker = markers[i];
  //    marker.setIcon(icon);
  //  }
  //});
  Search.initializeTabs();
  Search.initializeFilters();
  Search.initializeSearch(UI);
};

// TODO: Make sure this works in situ, replace with jq
google.maps.event.addDomListener(window, 'load', UI.initApp);

/********************************************/

// TODO: modularize, clean this up
var hiker = 'icon-hiker.png';
var featured = 'icon-hiker-featured.png';
var selected = 'icon-hiker-selected.png';
var size8 = new google.maps.Size(8, 8);
var size12 = new google.maps.Size(12, 12);
var size16 = new google.maps.Size(16, 16);
var icon8 = {
  url: hiker,
  scaledSize: size8
};
var icon12 = {
  url: hiker,
  scaledSize: size12
};
var icon16 = {
  url: hiker,
  scaledSize: size16
};
var featured8 = {
  url: featured,
  scaledSize: size8
};
var selected8 = {
  url: selected,
  scaledSize: size8
};
var selected16 = {
  url: selected,
  scaledSize: size16
};


UI.initMap = function(elem) {
  var mapOptions = {
    center: new google.maps.LatLng(47.857403, -120.739746),
    zoom: 7,
    mapTypeId: google.maps.MapTypeId.TERRAIN,

    // Add controls
    mapTypeControl: true,
    scaleControl: false,
    overviewMapControl: true,
    overviewMapControlOptions: {
      opened: true
    },
    streetViewControl: false
  };
  google.maps.visualRefresh = true;
  UI.theMap = new google.maps.Map(elem, mapOptions);
  UI.hoveredMarker = null;
  UI.theTooltip = new MarkerTooltip(
      UI.theMap,
      function() {return UI.hoveredMarker;},
      function(marker) {return Data.getSummaryHtml(marker.hikes);});
  UI.allMarkers = [];
};

UI.initMarkers = function(hikeList) {
  var markers = [], marker, lastLat, lastLng, numDupes = 0;
  for (var i = 0; i < hikeList.length; ++i) {
    var hike = hikeList[i];
    var lat = hike.lat, lng = hike.lng;
    if (lat && lng) {
      if (lat != lastLat || lng != lastLng) {
        marker = new google.maps.Marker({
	  position: new google.maps.LatLng(lat, lng),
	  map: UI.theMap,
	  icon: Data.isFeatured(hike) ? featured8 : icon8
	});
	google.maps.event.addListener(marker, 'mouseover', UI.createMarkerMouseOverListener(marker));
	google.maps.event.addListener(marker, 'click', UI.createMarkerClickListener(marker));
	markers.push(marker);
	marker.hikes = [hike];
	lastLat = lat;
	lastLng = lng;
      } else {
	numDupes++;
	marker.hikes.push(hike);
      }
      hike.marker = marker;
    }
  }
  google.maps.event.addListener(UI.theMap, 'click', function() {UI.theTooltip.hide();});

  UI.allMarkers = markers;
  console.log('numDupes=' + numDupes + ', markers.length=' + markers.length);
};

UI.createMarkerMouseOverListener = function(marker) {
  return function(event) {
    UI.hoveredMarker = marker;
    UI.theTooltip.show();
    // marker.setIcon(icon16);
  };
};

UI.hikeClicked = function(hike) {
  UI.selectHike(hike);
  Search.getHikeDetails(hike.id, hike.name);
  if (hike.kml) {
    var kmlLayer = new google.maps.KmlLayer({
      url: hike.kml,
      clickable: false,
      map: UI.theMap,
      suppressInfoWindows: true,
      screenOverlays: false,
      preserveViewport: true
    });
  }  
};

UI.createMarkerClickListener = function(marker) {
  return function(event) {
    var hike = marker.hikes[0];
    UI.hikeClicked(hike);
  };
};

UI.createHikeIdListener = function(hikeId) {
  return function() {
    var hike = Data.getHikeById(hikeId);
    UI.hikeClicked(hike);
  };
};

/**
 * Set the viewport to minimally encompass all the hikes.
 */
UI.setBounds = function(hikes) {
  if (hikes.length == 0) return;
  var bounds = new google.maps.LatLngBounds();
  for (var i=0; i<hikes.length; ++i) {
    var hike = hikes[i];
    var latlng = new google.maps.LatLng(hike.lat, hike.lng);
    bounds.extend(latlng);
  }
  UI.theMap.fitBounds(bounds);
};

UI.selectHikeById = function(id) {
  UI.selectHike(Data.getHikeById(id));
};

UI.selectHike = function(hike) {
  // Deselect old selection
  if (UI.selectedMarker) {
    // HACK! Fix this, overloading hikes onto 1 marker is getting messy
    var oldHike = UI.selectedMarker.hikes[0];
    UI.selectedMarker.setIcon(Data.isFeatured(oldHike) ? featured8 : icon8);
  }
  if (hike) {
    var marker = hike.marker;
    if (marker) {
      marker.setIcon(selected16);
      UI.selectedMarker = marker;
      
      UI.theMap.panTo(new google.maps.LatLng(hike.lat, hike.lng));
    }
  }
};

/**
 * @param {Array.<Function(hike):boolean>} filters A list of functions that
 * must all return true for the given hike to be visible.
 */
UI.filterMarkers = function(filters) {
  // for each marker in allMarkers
  for (var i=0; i<UI.allMarkers.length; ++i) {
    var marker = UI.allMarkers[i];
    var markerVisible = false;
    // for each hike in marker.hikes
    for (var j=0; j<marker.hikes.length; ++j) {
      var hike = marker.hikes[j];
      var hikeInvisible = false;
      // for each filter
      for (var k=0; k<filters.length; ++k) {
	var filter = filters[k];
        if (!filter(hike)) {
	  hikeInvisible = true;
	  break;
	}
      }
      if (!hikeInvisible) {
	// TODO: figure out how to modify tooltip when some
        // but not all hikes are filtered
	markerVisible = true;
	break;
      }
    }
    marker.setMap(markerVisible ? UI.theMap : null);
  }
};

// EXPORT GLOBALS
WtaTrailheadSearch.initializeTrailheadSearch = UI.initApp;
WtaTrailheadSearch.setHikes = Data.initData;
// WtaTrailheadSearch.expandMap = expandMap;
// WtaTrailheadSearch.restoreMap = restoreMap;

// END ANONYMOUS NAMESPACE
})();
