var Data={};

Data.allHikes=[];

/** Each hike is an object literal in the form: {{
 * rating: number?,  // user rating 1-5, if present
 * length: number?,  // in miles, if present
 * features: string, // see feature-filter checkboxes in HTML page
 * name: string,     // Human friendly name
 * lat: number?,     // latitude, in degrees
 * lng: number?,     // longitude, in degrees
 * elevGain: number?,// elevation gain, in feet
 * id: string!,      // database key
 * elevMax: number?, // max altitude, in feet
 * kml: string?      // URL to trail geometry KML or KMZ file
 * }}
*/ 

Data.initData = function(hikeList) {
  Data.allHikes = hikeList;
    // Sort the hikes geographically, so we can detect duplicate locations more easily.
  Data.allHikes.sort(function(a,b) {
    var dLat = b.lat - a.lat;
    if (dLat) return dLat;
    var dLng = b.lng - a.lng;
    if (dLng) return dLng;
    var dFeatured = (Data.isFeatured(b) ? 1 : 0) - (Data.isFeatured(a) ? 1 : 0);
    if (dFeatured) return dFeatured;
    var dLength = (a.length || 0) - (b.length || 0);
    return dLength;
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
