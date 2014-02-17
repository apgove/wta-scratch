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
/** @type {Array.<google.maps.Marker>} */
UI.farMarkers=[];
/** @type {number} */
UI.currentZoom = 7;
/** @type {google.maps.Marker} */
UI.hoveredMarker = null;
/** @type {google.maps.Marker} */
UI.selectedMarker = null;
/** @type {google.maps.KmlLayer} */
UI.displayedKmlLayer = null;

/********************************************/
// Bootstrap initialization

UI.initApp = function() {
  UI.initMap(document.getElementById("map_canvas"));
  UI.initMarkers(Data.getAllHikes());
  Search.initializeRegionZooms(UI.theMap);
  Search.initializeTabs();
  Search.initializeFilters();
  Search.initializeSearch(UI);
};

// TODO! Getting the script load order right is tricky.  Make sure this
// works in situ, maybe replace with the following if Google Maps API can't be
// loaded yet but jquery can:
// jq(document).ready(UI.initApp);
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

/**
 * Create and initialize the map widget.
 * @param {Element} elem Container div.
 */
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
};

/** Check if the URL has any parameters that affect initialization. */
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

/** Prevent the map from being panned out of bounds. */
UI.addPanLimiter = function(map, allowedBounds) {
  if (!allowedBounds) {
    return;
  }
  // ported from http://stackoverflow.com/questions/3125065/how-do-i-limit-panning-in-google-maps-api-v3
  var lastValidCenter = map.getCenter();
  
  google.maps.event.addListener(map, 'center_changed', function() {
    var newCenter = map.getCenter();
    if (allowedBounds.contains(newCenter)) {
      // still within valid bounds, so save the last valid position
      lastValidCenter = newCenter;
      return; 
    }
    // Out of bounds.  Try horizontal or vertical slides instead.
    var slide = new google.maps.LatLng(newCenter.lat(), lastValidCenter.lng());
    if (allowedBounds.contains(slide)) {
      lastValidCenter = slide;
    } else {
      slide = new google.maps.LatLng(lastValidCenter.lat(), newCenter.lng());
      if (allowedBounds.contains(slide)) {
	lastValidCenter = slide;
      }
    }
    map.panTo(lastValidCenter);
  });  
};

/** Test whether the current zoom level is considered "far" or "near". */
UI.isFar = function() {
  return UI.currentZoom < 8;
};

UI.onZoomChanged = function() {
  var oldFar = UI.isFar();
  UI.currentZoom = UI.theMap.getZoom();
  var newFar = UI.isFar();
  if (oldFar != newFar) {
    // switch between visible marker sets
    for (var i=0; i<UI.farMarkers.length; ++i) {
      UI.farMarkers[i].setMap(oldFar ? null : UI.theMap);
    }
    for (var i=0; i<UI.allMarkers.length; ++i) {
      UI.allMarkers[i].setMap(newFar ? null : UI.theMap);
    }
    
    // TODO: apply filters
    // TODO: carry over selected, hovered
  }
};

UI.initMarkers = function(hikeList) {
  UI.currentZoom = UI.theMap.getZoom();
  google.maps.event.addListener(UI.theMap, 'zoom_changed', UI.onZoomChanged);

  var isFar = UI.isFar(UI.currentZoom);
  UI.farMarkers = UI.createMarkersWithTolerance(hikeList, 0.2, isFar);
  UI.allMarkers = UI.createMarkersWithNoTolerance(hikeList, !isFar);
  google.maps.event.addListener(UI.theMap, 'click', function() {UI.theTooltip.hide();});
};

UI.createMarkersWithNoTolerance = function(hikeList, visible) {
  var markers = [], marker, lastLat, lastLng;
  for (var i = 0; i < hikeList.length; ++i) {
    var hike = hikeList[i];
    var lat = hike.lat, lng = hike.lng;
    if (lat && lng) {
      if (lat != lastLat || lng != lastLng) {
        marker = new google.maps.Marker({
	  position: new google.maps.LatLng(lat, lng),
	  map: visible ? UI.theMap : null,
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

      hike.marker = marker;
    }
  }
  return markers;
};

UI.createMarkersWithTolerance = function(hikeList, tolerance, visible) {
  hikeList = hikeList.slice(0);  // Clone input array so we can modify it
  var markers = [], marker, t2 = tolerance * tolerance;
  var sqr = function(x) {return x*x;};
  while (hikeList.length) {
    var hike = hikeList.shift();
    var lat = hike.lat, lng = hike.lng;
    if (lat && lng) {
      marker = new google.maps.Marker({
        position: new google.maps.LatLng(lat, lng),
	map: visible ? UI.theMap : null,
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
	// TODO: [perf] use sort order to exit early when out of latitude range
      }
      // TODO: change icon based on singular or plural hikes
      // TODO: change position to most central (or centroid) of the hikes

      hike.farMarker = marker;
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
  if (UI.displayedKmlLayer) {
    UI.displayedKmlLayer.setMap(null);
    UI.displayedKmlLayer = null;
  }
  if (hike.kml) {
    UI.displayedKmlLayer = new google.maps.KmlLayer({
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
      // TODO: remove event listeners?
      
      jqItem.append(first ? '' : '<br>').append(link);
      if (hike.length) {
        jqItem.append(' (' + hike.length + 'mi)');
      }
      first = false;

      if (i > 10) {
        // max out at ~10 lines
        jqItem.append('<br>...');
	break;
      }
    }
  }
};

/**
 * Set the viewport to minimally encompass all the hikes.
 * @param {Array.<Object>} hikes
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
  UI.setBounds(Data.getAllHikes());
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
    var marker = UI.getMarkerForHike(hike);
    if (marker) {
      marker.setIcon(UI.ICON_SELECTED16);
      UI.selectedMarker = marker;
      
      UI.theMap.panTo(new google.maps.LatLng(hike.lat, hike.lng));
    }
  }
};

/**
 * @param {Object} hike
 * @return {google.maps.marker} The marker for this hike, which may depend on zoom level, etc.
 */
UI.getMarkerForHike = function(hike) {
  return UI.isFar() ? hike.farMarker : hike.marker;
};

/** @return {Array.<google.maps.marker>} */
UI.getAllMarkers = function() {
  return UI.isFar() ? UI.farMarkers : UI.allMarkers;
};

/**
 * @param {Array.<Function(hike):boolean>} filters A list of functions that
 * must all return true for the given hike to be visible.
 */
UI.filterMarkers = function(filters) {
  var allMarkers = UI.getAllMarkers();
  for (var i=0; i<allMarkers.length; ++i) {
    var marker = allMarkers[i];
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
// TODO: implement these
// WtaTrailheadSearch.expandMap = expandMap;
// WtaTrailheadSearch.restoreMap = restoreMap;

// END ANONYMOUS NAMESPACE
})();
