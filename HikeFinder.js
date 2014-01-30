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

// TODO: zoom-based clustering
// TODO: expand/restore map (independent of DOM?)

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
  Search.initializeTabs();
  Search.initializeFilters();
  Search.initializeSearch(UI);
};

// TODO: Make sure this works in situ, replace with jq
google.maps.event.addDomListener(window, 'load', UI.initApp);

/********************************************/

UI.IMG_NORMAL = 'icon-hiker.png';
UI.IMG_FEATURED = 'icon-hiker-featured.png';
UI.IMG_SELECTED = 'icon-hiker-selected.png';
UI.SIZE8 = new google.maps.Size(8, 8);
UI.SIZE16 = new google.maps.Size(16, 16);
UI.ICON_NORMAL8 = {
  url: UI.IMG_NORMAL,
  scaledSize: UI.SIZE8
};
UI.ICON_FEATURED8 = {
  url: UI.IMG_FEATURED,
  scaledSize: UI.SIZE8
};
UI.ICON_SELECTED16 = {
  url: UI.IMG_SELECTED,
  scaledSize: UI.SIZE16
};

// Washington state
UI.ALLOWED_BOUNDS = new google.maps.LatLngBounds(
  new google.maps.LatLng(45.5, -124.8), 
  new google.maps.LatLng(49.2, -116.8)
);


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
  
  UI.applyUrlParameters();
  
  UI.addPanLimiter(UI.theMap, UI.ALLOWED_BOUNDS);

  UI.hoveredMarker = null;
  UI.theTooltip = new MarkerTooltip(
      UI.theMap,
      function() {return UI.hoveredMarker;},
      function(marker, jqItem) {return UI.fillTooltip(marker.hikes, jqItem);});
  UI.allMarkers = [];
};

UI.applyUrlParameters = function() {
  // Parse out latlngz=-123.4,45.6,7 to set initial viewport
  var r = (new RegExp('[?&]latlngz=([^&#,]+),([^&#,]+),([^&#,]+)')).exec(window.location.href);
  if (r) {
    var lat = Number(r[1]);
    var lng = Number(r[2]);
    var z = Number(r[3]);
    if (lat && lng && z) {
      UI.theMap.setCenter(new google.maps.LatLng(lat, lng));
      UI.theMap.setZoom(z);
    }
  }
  // Parse out id=foo from URL.
  r = (new RegExp('[?&]id=([^&#]*)')).exec(window.location.href);
  if (r) {
    var id = r[1];
    var hike = Data.getHikeById(id);
    if (hike)
      UI.hikeClicked(hike);
  }
};

UI.addPanLimiter = function(map, allowedBounds) {
  // ported from http://stackoverflow.com/questions/3125065/how-do-i-limit-panning-in-google-maps-api-v3
  var lastValidCenter = map.getCenter();
  
  google.maps.event.addListener(map, 'center_changed', function() {
      if (allowedBounds.contains(map.getCenter())) {
	  // still within valid bounds, so save the last valid position
	  lastValidCenter = map.getCenter();
	  return; 
      }
  
      // revisit old location.
      // TODO: convert diagonal move to horizontal/vertical when only
      // out of bounds in one dimension.
      map.panTo(lastValidCenter);
  });  
};

UI.initMarkers = function(hikeList) {
  UI.allMarkers = UI.createMarkersWithNoTolerance(hikeList);
  google.maps.event.addListener(UI.theMap, 'click', function() {UI.theTooltip.hide();});
};

UI.createMarkersWithNoTolerance = function(hikeList) {
  var markers = [], marker, lastLat, lastLng;
  for (var i = 0; i < hikeList.length; ++i) {
    var hike = hikeList[i];
    var lat = hike.lat, lng = hike.lng;
    if (lat && lng) {
      if (lat != lastLat || lng != lastLng) {
        marker = new google.maps.Marker({
	  position: new google.maps.LatLng(lat, lng),
	  map: UI.theMap,
	  icon: Data.isFeatured(hike) ? UI.ICON_FEATURED8 : UI.ICON_NORMAL8
	});
	google.maps.event.addListener(marker, 'mouseover', UI.createMarkerMouseOverListener(marker));
	google.maps.event.addListener(marker, 'click', UI.createMarkerClickListener(marker));
	markers.push(marker);
	marker.hikes = [hike];
	lastLat = lat;
	lastLng = lng;
      } else {
	marker.hikes.push(hike);
      }
      // TODO: change hike->marker mapping to take current zoom into account.
      hike.marker = marker;
    }
  }
  return markers;
};

UI.createMarkersWithTolerance = function(hikeList, tolerance) {
  hikeList = hikeList.slice(0);  // Clone input array so we can modify it
  var markers = [], marker, t2 = tolerance * tolerance;
  var sqr = function(x) {return x*x;};
  while (hikeList.length) {
    var hike = hikeList.shift();
    var lat = hike.lat, lng = hike.lng;
    if (lat && lng) {
      marker = new google.maps.Marker({
        position: new google.maps.LatLng(lat, lng),
	map: UI.theMap,
        icon: Data.isFeatured(hike) ? UI.ICON_FEATURED8 : UI.ICON_NORMAL8
      });
      google.maps.event.addListener(marker, 'mouseover', UI.createMarkerMouseOverListener(marker));
      google.maps.event.addListener(marker, 'click', UI.createMarkerClickListener(marker));
      markers.push(marker);
      marker.hikes = [hike];
      
      for (var i = hikeList.length - 1; i >= 0; --i) {
	var candidate = hikeList[i];
	var d2 = sqr(Math.abs(lat - candidate.lat)) + sqr(Math.abs(lng - candidate.lng));
	if (d2 < t2) {
	  marker.hikes.push(candidate);
	  hikeList.splice(i, 1);
	  candidate.marker = marker;
	}
	// TODO: use sort order to exit early when out of latitude range
      }
      // TODO: change icon based on singular or plural hikes
      // TODO: change position to most central (or centroid) of the hikes
      // TODO: change hike->marker mapping to take current zoom into account.
      hike.marker = marker;
    }
  }
  return markers;
};

UI.createMarkerMouseOverListener = function(marker) {
  return function(event) {
    UI.hoveredMarker = marker;
    UI.theTooltip.show();
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
    // TODO: need a way to get rid of kml overlay
  }  
};

UI.createMarkerClickListener = function(marker) {
  return function(event) {
    var hike = marker.hikes[0];
    // TODO: instead of [0], get first non-filtered hike
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
 * Fill the given jQuery element with a synopsis of a hike or list of hikes,
 * such as for putting in a tooltip.
 */
UI.fillTooltip = function(hikes, jqItem) {
  jqItem.html('');
  if (hikes.length == 1) {
    var hike = hikes[0];
    var link = document.createElement('a');
    link.setAttribute('href', 'javascript:void(0)');
    jq(link).text(hike.name).click(UI.createHikeIdListener(hike.id));
    jqItem.append(link);
    if (hike.length)
      jqItem.append('<br>Length: ' + hike.length + ' mi');
    if (hike.elevGain)
      jqItem.append('<br>Elevation gain: ' + hike.elevGain + ' ft');
    if (hike.elevMax)
      jqItem.append('<br>Peak elevation: ' + hike.elevMax + ' ft');
    if (hike.rating && hike.rating > 0.0001)
      jqItem.append('<br>User rating: ' + Math.round(10*hike.rating)/10);
  } else {
    var first = true;
    for (var i = 0; i < hikes.length; i++) {
      var hike = hikes[i];
      var link = document.createElement('a');
      link.setAttribute('href', 'javascript:void(0)');
      jq(link).text(hike.name).click(UI.createHikeIdListener(hike.id));
      
      jqItem.append(first ? '' : '<br>').append(link);
      if (hike.length) {
        jqItem.append(' (' + hike.length + 'mi)');
      }
      first = false;
      // TODO: remove event listeners?
    }
  }
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

UI.resetBounds = function() {
  UI.setBounds(Data.allHikes);
};

UI.selectHikeById = function(id) {
  UI.selectHike(Data.getHikeById(id));
};

UI.selectHike = function(hike) {
  // Deselect old selection
  if (UI.selectedMarker) {
    // HACK! Fix this, overloading hikes onto 1 marker is getting messy
    var oldHike = UI.selectedMarker.hikes[0];
    UI.selectedMarker.setIcon(Data.isFeatured(oldHike) ? UI.ICON_FEATURED8 : UI.ICON_NORMAL8);
  }
  if (hike) {
    var marker = hike.marker;
    if (marker) {
      marker.setIcon(UI.ICON_SELECTED16);
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
        // but not all hikes are filtered; i.e. add filtering check when tooltip
	// text is generated.
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
