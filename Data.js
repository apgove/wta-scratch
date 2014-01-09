var Data={};
Data.allHikes=[];

// Each hike is an object literal containing:
// rating, length, features, name, lat, lng, elevGain, id, elevMax
// NEW: kml
// 

Data.initData = function(hikeList) {
  Data.allHikes = hikeList;
    // Sort the hikes geographically, so we can detect duplicate locations more easily.
  Data.allHikes.sort(function(a,b) {
    var dLat = b.lat - a.lat;
    if (dLat) return dLat;
    var dLng = b.lng - a.lng;
    if (dLng) return dLng;
    return (Data.isFeatured(b) ? 1 : 0) - (Data.isFeatured(a) ? 1 : 0);
  });
};

Data.isFeatured = function(hike) {
  return hike.features.indexOf('!') != -1;
};

/**
 * Given a string id for a hike, find the hike object it corresponds to.
 * TODO? change allHikes to an associative array for faster lookup.
 */
Data.getHikeById = function(id) {
  for (var i=0; i<Data.allHikes.length; ++i)
    if (Data.allHikes[i].id == id) return Data.allHikes[i];
  return null;
};

/**
 * Return the synopsis of a hike or list of hikes, for putting in a tooltip.
 */
Data.getSummaryHtml = function(hikes) {
  var html;
  if (hikes.length == 1) {
    var hike = hikes[0];
    html = '<b>' + hike.name + '</b>';
    if (hike.rating && hike.rating > 0.0001)
      html += '<br>User rating: ' + Math.round(10*hike.rating)/10;
    if (hike.length)
      html += '<br>Length: ' + hike.length + ' mi';
    if (hike.elevGain)
      html += '<br>Elevation gain: ' + hike.elevGain + ' ft';
    if (hike.elevMax)
      html += '<br>Peak elevation: ' + hike.elevMax + ' ft';
  } else {
    var first = true;
    html = '<b>';
    for (var i = 0; i < hikes.length; i++) {
      var hike = hikes[i];
      //var link = document.createElement('a');
      
      html += (first ? '' : '<br>') + hike.name;
      if (hike.length) {
        html += ' (' + hike.length + 'mi)'
      }
      first = false;
      // TODO: remove event listeners
    }
    html += '</b>';
  }
  return html;
};
