var map;
var selector, hoverer, dragger;

function init() {
  map = new OpenLayers.Map("map",{projection:"EPSG:3857"});

  var osm = new OpenLayers.Layer.OSM();
  var toMercator = OpenLayers.Projection.transforms['EPSG:4326']['EPSG:3857'];
  var center = toMercator({x:-0.05,y:51.5});

  /**
   * Create 5 random vector features.  Your features would typically be fetched
   * from the server. The features are given an attribute named "foo".
   * The value of this attribute is an integer that ranges from 0 to 100.
   */
  var features = [];
  for(var i = 0; i < 5; i++) {
    features[i] = new OpenLayers.Feature.Vector(
      toMercator(new OpenLayers.Geometry.Point(
          -0.040 - 0.05*Math.random(),
        51.49 + 0.02*Math.random())),
      {
        foo : 100 * Math.random() | 0
      });
  }

  var style = new OpenLayers.Style({
    fillColor: "#ee9900",
    fillOpacity: 0.4,
    strokeColor: "#ee9900",
    pointRadius: 6,
    label: "${label}",
    //label: "default",
    labelOutlineColor: "white",
    labelOutlineWidth: 3,
    labelYOffset: -8,
    labelAlign: "ct"
  }, {
    context: {
      label: function(feature) {
        return feature.attributes.foo;
      }
    }
  });

  var vector = new OpenLayers.Layer.Vector("Points",{
    // http://docs.openlayers.org/library/feature_styling.html
    styleMap: new OpenLayers.StyleMap({
      "default": style,
      "select": {
        fillColor: "#8aeeef",
        strokeColor: "#32a8a9",
        pointRadius: 6,
        //label: "select"
      },
      "hover": {
        fillColor: "#FF0000",
        fillOpacity: 0.8,
        strokeColor: "#800000",
        pointRadius: 6,
        label: "hover"
      }
    })
  });
  vector.addFeatures(features);

  var remove_hover_popup = function(evt){
    var feature = evt.feature;
    if (feature.popup) {
      map.removePopup(feature.popup);
      feature.popup.destroy();
      feature.popup = null;
    }
  };

  var create_hover_popup = function(evt){
    var feature = evt.feature;
    var Popup = OpenLayers.Class(OpenLayers.Popup.Anchored, { autoSize: true });
    var anchor = { size: new OpenLayers.Size(8, 8),
                   offset: new OpenLayers.Pixel(-4, -4) };
    var pos = OpenLayers.LonLat.fromString(feature.geometry.toShortString());
    var content = "<div style='font-size:.8em'>Feature: " + feature.id +"<br>Foo: " + feature.attributes.foo+"</div>";
    var popup = new Popup("popup", pos, null, content, anchor, false);
    feature.popup = popup;
    map.addPopup(popup);
  };

  // create the select feature control
  hoverer = new OpenLayers.Control.SelectFeature(vector,{
    hover:true,
    autoActivate:true,
    highlightOnly: true,
    renderIntent: "hover",
    eventListeners: {
      featurehighlighted: create_hover_popup,
      featureunhighlighted: remove_hover_popup
    }
  });

  var remove_edit_popup = function(feature){
    // reactivate select controls
    hoverer.activate();
    selector.deactivate();
    selector.activate();

    if (feature.editPopup) {
      map.removePopup(feature.editPopup);
      feature.editPopup.destroy();
      feature.editPopup = null;
    }
  };

  var create_edit_popup = function(feature){
    // deactivate select controls to stop them interfering
    hoverer.deactivate();
    selector.deactivate();

    var close_button_clicked = function() {
      selector.activate();
      selector.unselectAll();
      dragger.deactivate();
    };

    var Popup = OpenLayers.Class(OpenLayers.Popup.Anchored, { autoSize: true });
    var anchor = { size: new OpenLayers.Size(8, 8),
                   offset: new OpenLayers.Pixel(-4, -4) };
    var pos = OpenLayers.LonLat.fromString(feature.geometry.toShortString());
    var content = "<div style='font-size:.8em'>Feature: " + feature.id +"<br>Foo:  <input type='text' id='edit_foo' size=8 value='" + feature.attributes.foo+"'/><br><label><input type='checkbox' id='move_feature'/> Move feature</label></div>";
    var popup = new Popup("popup", pos, null, content, anchor, true,
                          close_button_clicked);
    feature.editPopup = popup;
    map.addPopup(popup);

    // Edit event handling. Normally I would use jquery for this.
    hookup_event("edit_foo", {
      keydown: function(evt) {
        feature.attributes.foo = this.value + String.fromCharCode(evt.which || evt.keyCode);
      }
    });
    hookup_event("move_feature", {
      click: function(evt) {
        if (this.checked) {
          dragger.feature = feature;
          dragger.activate();
        } else {
          dragger.deactivate();
        }
      }
    });
  };

  var hookup_event = function(id, evts) {
    // These event handlers are never unregistered, which causes a memory leak.
    var el = OpenLayers.Util.getElement(id);
    var events = new OpenLayers.Events(null, el,
                                       OpenLayers.Events.BROWSER_EVENTS, true);
    evts.scope = el;
    events.on(evts);
    return events;
  };

  selector = new OpenLayers.Control.SelectFeature(vector, {
    hover: false,
    autoActivate: true,
    clickout: false, toggle: false, // workaround to prevent unselect
    // http://osgeo-org.1560.n6.nabble.com/quot-beforefeatureunselected-quot-Vector-layer-event-td3891727.html
    eventListeners: {
      featurehighlighted: function(evt) {
        remove_hover_popup(evt);
        create_edit_popup(evt.feature);
      },
      featureunhighlighted: function(evt) {
        remove_edit_popup(evt.feature);
      }
    }
  });

  dragger = new OpenLayers.Control.DragFeature(vector, {
    autoActivate: false,
    onComplete: function(vertex) {
      var popup = vertex.editPopup;
      if (popup) {
        popup.lonlat = vertex.geometry.getBounds().getCenterLonLat();
        popup.updatePosition();
      }
    }
  });
  
  map.addLayers([osm, vector]);
  map.addControl(hoverer);
  map.addControl(selector);
  map.addControl(dragger);
  map.setCenter(new OpenLayers.LonLat(center.x,center.y), 13);
}
