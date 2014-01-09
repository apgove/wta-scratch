// Based on article by Mohamed Elbou at
// http://medelbou.wordpress.com/2012/02/03/creating-a-tooltip-for-google-maps-javascript-api-v3/

/**
 * Simple tooltip positioned SE of a marker.
 * @param {google.maps.Map} map The map.
 * @param {Function(void):google.maps.Marker} getMarkerFn
 * @param {Function(google.maps.Marker):String} getInnferHtmlFn
 */
function MarkerTooltip(map, getMarkerFn, getInnerHtmlFn) {
  var div = document.createElement('DIV');
  div.style.position = "relative";
  div.style.display = "inline-block";
  div.style.visibility = "hidden";
  div.className = "map-tooltip";
  div.innerHTML = "Loading...";
  /** @type Element */
  this.div_ = div;
  /** @type Function(void):google.maps.Marker */
  this.getMarkerFn_ = getMarkerFn;
  /** @type Function(google.maps.Marker):String */
  this.getInnerHtmlFn_ = getInnerHtmlFn;
  this.setMap(map);
}
MarkerTooltip.prototype = new google.maps.OverlayView();

MarkerTooltip.prototype.onAdd = function() {
  this.getPanes().floatPane.appendChild(this.div_);
};
MarkerTooltip.prototype.draw = function() {
  this.updatePosition();
};
MarkerTooltip.prototype.updatePosition = function() {
  var marker = this.getMarkerFn_();
  if (marker) {
    var overlayProjection = this.getProjection();
    var ne = overlayProjection.fromLatLngToDivPixel(marker.getPosition());
    var div = this.div_;
    div.style.left = (ne.x + 8) + 'px'; // adjust for blockage by mouse pointer
    div.style.top = ne.y + 'px';
  }
};
MarkerTooltip.prototype.onRemove = function() {
  this.div_.parentNode.removeChild(this.div_);
};
MarkerTooltip.prototype.hide = function() {
  if (this.div_) {
    this.div_.style.visibility = "hidden";
  }
};
MarkerTooltip.prototype.show = function() {
  if (this.div_) {
    var marker = this.getMarkerFn_();
    if (marker) {
      this.div_.innerHTML = this.getInnerHtmlFn_(marker);
    }
    this.div_.style.visibility = "visible";
    this.updatePosition();
  }
};
