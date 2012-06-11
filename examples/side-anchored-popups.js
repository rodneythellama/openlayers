var map;

function init(){
  map = new OpenLayers.Map('map');
  var wms = new OpenLayers.Layer.WMS(
    "OpenLayers WMS", "http://vmap0.tiles.osgeo.org/wms/vmap0",
    {layers: 'basic'}
  );

  var layer = new OpenLayers.Layer.Vector("POIs", {
    strategies: [new OpenLayers.Strategy.BBOX({resFactor: 1.1})],
    protocol: new OpenLayers.Protocol.HTTP({
      url: "textfile.txt",
      format: new OpenLayers.Format.Text()
    })
  });

  map.addLayers([wms, layer]);
  map.zoomToMaxExtent();

  // Interaction; not needed for initial display.
  selectControl = new OpenLayers.Control.SelectFeature(layer, {
    toggle: true,
    clickOut: true
  });
  map.addControl(selectControl);
  selectControl.activate();
  layer.events.on({
    'featureselected': onFeatureSelect,
    'featureunselected': onFeatureUnselect
  });
}

function getPopupClass(opts) {
    var PopupClass = OpenLayers.Util.getElement("tip-frame").checked ?
        OpenLayers.Popup.TipFrame : OpenLayers.Popup.SideAnchored;
    return OpenLayers.Class(PopupClass, opts);
}

function getPopupOptions() {
    var anchor = OpenLayers.Util.getElement("anchor-side").value.split("-");
    return {
        closeBox: OpenLayers.Util.getElement("show-close-button").checked,
        relativePosition: anchor[0] != "auto" ? anchor[0] : undefined,
        fixedRelativePosition: anchor[0] !== "auto",
        orientation: anchor[1] || "h",
        autoSize: OpenLayers.Util.getElement("autosize").checked
  };
}

// Needed only for interaction, not for the display.
function onPopupClose(evt) {
    // 'this' is the popup.
    var feature = this.feature;
    if (feature.layer) { // The feature is not destroyed
        selectControl.unselect(feature);
    } else { // After "moveend" or "refresh" events on POIs layer all
        //     features have been destroyed by the Strategy.BBOX
        this.destroy();
    }
}
function onFeatureSelect(evt) {
    var opts = getPopupOptions();
    var PopupClass = getPopupClass(opts);
    var size = opts.autoSize ? null : new OpenLayers.Size(300,100);

    feature = evt.feature;
    popup = new PopupClass("featurePopup",
                           feature.geometry.getBounds().getCenterLonLat(),
                           size,
                           "<h2>"+feature.attributes.title + "</h2>" +
                           feature.attributes.description,
                           undefined, opts.closeBox, onPopupClose);
  feature.popup = popup;
  popup.feature = feature;
  map.addPopup(popup, true);
}
function onFeatureUnselect(evt) {
  feature = evt.feature;
  if (feature.popup) {
    popup.feature = null;
    map.removePopup(feature.popup);
    feature.popup.destroy();
    feature.popup = null;
  }
}

/*
 * Normal OpenLayers popups are anchored at the corners. I would
 * prefer them to be anchored on the middle of the side.
 */
OpenLayers.Popup.SideAnchored =
  OpenLayers.Class(OpenLayers.Popup, {

    /**
     * Property: relativePosition
     * {String} Relative position of the popup ("t", "r", "b" or "l").
     */
    relativePosition: null,

    /**
     * Property: orientation
     * {String} "h", "v" or "b"
     */
    orientation: "h",

    /**
     * APIProperty: keepInMap
     * {Boolean} If panMapIfOutOfView is false, and this property is true,
     *     contrain the popup such that it always fits in the available map
     *     space. By default, this is set. If you are creating popups that are
     *     near map edges and not allowing pannning, and especially if you have
     *     a popup which has a fixedRelativePosition, setting this to false may
     *     be a smart thing to do.
     *
     *     For anchored popups, default is true, since subclasses will
     *     usually want this functionality.
     */
    keepInMap: true,

    /**
     * Property: anchor
     * {Object} Object to which we'll anchor the popup. Must expose a
     *     'size' (<OpenLayers.Size>) and 'offset' (<OpenLayers.Pixel>).
     */
    anchor: null,

    /**
    * Constructor: OpenLayers.Popup.SideAnchored
    *
    * Parameters:
    * id - {String}
    * lonlat - {<OpenLayers.LonLat>}
    * contentSize - {<OpenLayers.Size>}
    * contentHTML - {String}
    * anchor - {Object} Object which must expose a 'size' <OpenLayers.Size>
    *     and 'offset' <OpenLayers.Pixel> (generally an <OpenLayers.Icon>).
    * closeBox - {Boolean}
    * closeBoxCallback - {Function} Function to be called on closeBox click.
    */
    initialize:function(id, lonlat, contentSize, contentHTML, anchor, closeBox,
                        closeBoxCallback) {
        var newArguments = [
            id, lonlat, contentSize, contentHTML, closeBox, closeBoxCallback
        ];
        OpenLayers.Popup.prototype.initialize.apply(this, newArguments);

        this.anchor = (anchor != null) ? anchor
                                       : { size: new OpenLayers.Size(0,0),
                                           offset: new OpenLayers.Pixel(0,0)};
    },

    /**
     * APIMethod: destroy
     */
    destroy: function() {
        this.anchor = null;
        this.relativePosition = null;

        OpenLayers.Popup.prototype.destroy.apply(this, arguments);
    },

    /**
     * APIMethod: show
     * Overridden from Popup since user might hide popup and then show() it
     *     in a new location (meaning we might want to update the relative
     *     position on the show)
     */
    show: function() {
        this.updatePosition();
        OpenLayers.Popup.prototype.show.apply(this, arguments);
    },

    /**
     * Method: moveTo
     * Since the popup is moving to a new px, it might need also to be moved
     *     relative to where the marker is. We first calculate the new
     *     relativePosition, and then we calculate the new px where we will
     *     put the popup, based on the new relative position.
     *
     *     If the relativePosition has changed, we must also call
     *     updateRelativePosition() to make any visual changes to the popup
     *     which are associated with putting it in a new relativePosition.
     *
     * Parameters:
     * px - {<OpenLayers.Pixel>}
     */
    moveTo: function(px) {
        var oldRelativePosition = this.relativePosition;
        this.relativePosition = this.calculateRelativePosition(px);

        var newPx = this.calculateNewPx(px);

        var newArguments = new Array(newPx);
        OpenLayers.Popup.prototype.moveTo.apply(this, newArguments);

        //if this move has caused the popup to change its relative position,
        // we need to make the appropriate cosmetic changes.
        if (this.relativePosition != oldRelativePosition) {
            this.updateRelativePosition();
        }
    },

    /**
     * APIMethod: setSize
     *
     * Parameters:
     * contentSize - {<OpenLayers.Size>} the new size for the popup's
     *     contents div (in pixels).
     */
    setSize:function(contentSize) {
        OpenLayers.Popup.prototype.setSize.apply(this, arguments);

        if ((this.lonlat) && (this.map)) {
            var px = this.map.getLayerPxFromLonLat(this.lonlat);
            this.moveTo(px);
        }
    },

    /**
     * Method: calculateRelativePosition
     *
     * Parameters:
     * px - {<OpenLayers.Pixel>}
     *
     * Returns:
     * {String} The relative position ("t" "r" "b" "l") at which the popup
     *     should be placed.
     */
    calculateRelativePosition:function(px) {
        var determineThird = function(bounds, lonlat) {
            var thirds = ["tmb", "lcr"];
            var x = Math.floor((lonlat.lon - bounds.left) * 3 /
                               (bounds.right - bounds.left));
            var y = Math.floor((lonlat.lat - bounds.top) * 3 /
                               (bounds.top - bounds.bottom));
            return thirds[0].charAt(y) + thirds[1].charAt(x);
        };

        var oppositeThird = function(third) {
            var opp = "";

            opp += (third.charAt(0) === "m" ? "m" :
                    (third.charAt(0) === "t" ? "b" : "t"));
            opp += (third.charAt(1) === "c" ? "c" :
                    (third.charAt(1) === "l" ? "r" : "l"));

            return opp;
        };

        var lonlat = this.map.getLonLatFromLayerPx(px);

        var extent = this.map.getExtent();
        var quadrant = extent.determineQuadrant(lonlat);
        var third = determineThird(extent, lonlat);

        var map = {
            "h": function(q, t) { return q.charAt(0); },
            "v": function(q, t) { return q.charAt(1); },
            "b": function(q, t) {
                if (t === "tc")
                    return "t";
                if (t === "bc")
                    return "b";
                if (t === "ml")
                    return "l";
                if (t === "mr")
                    return "r";

                if (t === "tl")
                    return this.orientation === "h" ? "t" : "l";
                if (t === "bl")
                    return this.orientation === "h" ? "b" : "l";
                if (t === "tr")
                    return this.orientation === "h" ? "t" : "r";
                if (t === "br")
                    return this.orientation === "h" ? "b" : "r";

                return "t";
            }
        };

        quadrant = OpenLayers.Bounds.oppositeQuadrant(quadrant);
        third = oppositeThird(third);

        return map[this.orientation](quadrant, third);
    },

    /**
     * Method: updateRelativePosition
     * The popup has been moved to a new relative location, so we may want to
     *     make some cosmetic adjustments to it.
     *
     *     Note that in the classic SideAnchored popup, there is nothing to do
     *     here, since the popup looks exactly the same in all four positions.
     *     Subclasses such as Framed, however, will want to do something
     *     special here.
     */
    updateRelativePosition: function() {
        //to be overridden by subclasses
    },

    /**
     * Method: calculateNewPx
     *
     * Parameters:
     * px - {<OpenLayers.Pixel>}
     *
     * Returns:
     * {<OpenLayers.Pixel>} The the new px position of the popup on the screen
     *     relative to the passed-in px.
     */
    calculateNewPx:function(px) {
        var newPx = px.offset(this.anchor.offset);

        //use contentSize if size is not already set
        var size = this.size || this.contentSize;

        if (this.relativePosition == "t" || this.relativePosition == "b") {
            newPx.x += (this.anchor.size.w - size.w) / 2.0;

            if (this.relativePosition == "t") {
                newPx.y -= size.h;
            } else {
                newPx.y += this.anchor.size.h;
            }
        } else if (this.relativePosition == "l" || this.relativePosition == "r") {
            newPx.y += (this.anchor.size.h - size.h) / 2.0;

            if (this.relativePosition == "l") {
                newPx.x -= size.w;
            } else {
                newPx.x += this.anchor.size.w;
            }
        }

        return newPx;
    },

    CLASS_NAME: "OpenLayers.Popup.SideAnchored"
});


/*
 * This popup is supposed to look like the popup from Cloudmade's
 * Leaflet mapping library -- i.e. better than the openlayers
 * popups. It only just barely works.
 */
OpenLayers.Popup.TipFrame =
  OpenLayers.Class(OpenLayers.Popup.SideAnchored, {

    /**
     * Property: positionBlocks
     * {Object} Hash of different position blocks (Object/Hashs). Each block
     *     will be keyed by a two-character 'relativePosition'
     *     code string (ie "tl", "tr", "bl", "br"). Block properties are
     *     'offset', 'padding' (self-explanatory), and finally the 'blocks'
     *     parameter, which is an array of the block objects.
     *
     *     Each block object must have 'size', 'anchor', and 'position'
     *     properties.
     *
     *     Note that positionBlocks should never be modified at runtime.
     */
    positionBlocks: {
        "t": {
            offset: new OpenLayers.Pixel(0, -16),
            padding: new OpenLayers.Bounds(0, 0, 0, 0)
        },
        "r": {
            offset: new OpenLayers.Pixel(16, 0),
            padding: new OpenLayers.Bounds(0, 0, 0, 0)
        },
        "b": {
            offset: new OpenLayers.Pixel(0, 0),
            padding: new OpenLayers.Bounds(0, 0, 0, 0)
        },
        "l": {
            offset: new OpenLayers.Pixel(-16, 0),
            padding: new OpenLayers.Bounds(0, 0, 0, 0)
        }
    },

    /**
     * Property: blocks
     * {Array[Object]} Array of objects, each of which is one "block" of the
     *     popup. Each block has a 'div' and an 'image' property, both of
     *     which are DOMElements, and the latter of which is appended to the
     *     former. These are reused as the popup goes changing positions for
     *     great economy and elegance.
     */
    blocks: null,

    /**
     * APIProperty: fixedRelativePosition
     * {Boolean} We want the framed popup to work dynamically placed relative
     *     to its anchor but also in just one fixed position. A well designed
     *     framed popup will have the pixels and logic to display itself in
     *     any of the four relative positions, but (understandably), this will
     *     not be the case for all of them. By setting this property to 'true',
     *     framed popup will not recalculate for the best placement each time
     *     it's open, but will always open the same way.
     *     Note that if this is set to true, it is generally advisable to also
     *     set the 'panIntoView' property to true so that the popup can be
     *     scrolled into view (since it will often be offscreen on open)
     *     Default is false.
     */
    fixedRelativePosition: false, // true matches Leaflet.Popup behaviour
    //panIntoView: true,
    //relativePosition: "t",

    displayClass: "olTipFrame",
    contentDisplayClass: "olTipFrameContent",
    tipDisplayClass: "olTipFrameTip",
    tipContainerDisplayClass: "olTipFrameTipContainer",

    /**
     * Constructor: OpenLayers.Popup.TipFrame
     *
     * Parameters:
     * id - {String}
     * lonlat - {<OpenLayers.LonLat>}
     * contentSize - {<OpenLayers.Size>}
     * contentHTML - {String}
     * anchor - {Object} Object to which we'll anchor the popup. Must expose
     *     a 'size' (<OpenLayers.Size>) and 'offset' (<OpenLayers.Pixel>)
     *     (Note that this is generally an <OpenLayers.Icon>).
     * closeBox - {Boolean}
     * closeBoxCallback - {Function} Function to be called on closeBox click.
     */
    initialize:function(id, lonlat, contentSize, contentHTML, anchor, closeBox,
                        closeBoxCallback, position) {

        OpenLayers.Popup.SideAnchored.prototype.initialize.apply(this, arguments);

        if (position) {
            this.fixedRelativePosition = true;
            this.relativePosition = position;
        }

        if (this.fixedRelativePosition) {
            //based on our decided relativePostion, set the current padding
            // this keeps us from getting into trouble
            this.updateRelativePosition();

            //make calculateRelativePosition always return the specified
            // fixed position.
            this.calculateRelativePosition = function(px) {
                return this.relativePosition;
            };
        }

        this.contentDivWrapper = this.contentDiv;
        this.contentDivWrapper.className = this.contentDisplayClass + "Wrapper";
        this.contentDivWrapper.style.overflow = "hidden"; // fixme: css?

        if (closeBox) {
            this.closeDiv.style.zIndex = 1;
        }

        this.groupDiv.style.position = "absolute";
        this.groupDiv.style.top = "0px";
        this.groupDiv.style.left = "0px";
        this.groupDiv.style.height = "100%";
        this.groupDiv.style.width = "100%";
        // undo overflow setting from OpenLayers.Popup
        this.groupDiv.style.overflow = "";

        this.contentDiv = OpenLayers.Util.createDiv(this.id + "_contentDivInside", null, null, null, "relative");
        this.contentDiv.className = this.contentDisplayClass;
        this.contentDivWrapper.appendChild(this.contentDiv);
    },

    /**
     * APIMethod: destroy
     */
    destroy: function() {
        this.imageSrc = null;
        this.imageSize = null;
        this.isAlphaImage = null;

        this.fixedRelativePosition = false;
        this.positionBlocks = null;

        //remove our blocks
        for(var i = 0; i < this.blocks.length; i++) {
            var block = this.blocks[i];

            if (block.image) {
                block.div.removeChild(block.image);
            }
            block.image = null;

            if (block.div) {
                this.groupDiv.removeChild(block.div);
            }
            block.div = null;
        }
        this.blocks = null;

        OpenLayers.Popup.SideAnchored.prototype.destroy.apply(this, arguments);
    },

    draw: function(px) {
        div = OpenLayers.Popup.SideAnchored.prototype.draw.apply(this, arguments);

        // undo overflow: hidden hacking
        // fixme: should just make div big enough for everything?
        div.style.overflow = "";

        return div;
    },

    /**
     * APIMethod: setBackgroundColor
     */
    setBackgroundColor:function(color) {
        if (color != undefined) {
            this.backgroundColor = color;
        }

        if (this.contentDivWrapper != null) {
            this.contentDivWrapper.style.backgroundColor = this.backgroundColor;
        }
    },

    /**
     * APIMethod: setBorder
     */
    setBorder:function(border) {
        if (border != undefined) {
            this.border = border;
        }

        if (this.contentDivWrapper != null) {
            this.contentDivWrapper.style.border = this.border;
        }
        if (this.tipDiv != null) {
            this.tipDiv.style.border = this.border;
        }
    },

    /**
     * APIMethod: setSize
     * Overridden here, because we need to update the blocks whenever the size
     *     of the popup has changed.
     *
     * Parameters:
     * contentSize - {<OpenLayers.Size>} the new size for the popup's
     *     contents div (in pixels).
     */
    setSize:function(contentSize) {
        OpenLayers.Popup.SideAnchored.prototype.setSize.apply(this, arguments);

        this.updateBlocks();
    },

    /**
     * Method: updateRelativePosition
     * When the relative position changes, we need to set the new padding
     *     BBOX on the popup, reposition the close div, and update the blocks.
     */
    updateRelativePosition: function() {
        //update the padding
        this.padding = this.positionBlocks[this.relativePosition].padding;

        //update the position of our close box to new padding
        if (this.closeDiv) {
            // use the content div's css padding to determine if we should
            //  padd the close div
            var contentDivPadding = this.getContentDivPadding();

            this.closeDiv.style.right = contentDivPadding.right +
                                        this.padding.right + "px";
            this.closeDiv.style.top = contentDivPadding.top +
                                      this.padding.top + "px";
        }

        this.updateBlocks();
    },

    /**
     * Method: calculateNewPx
     * Besides the standard offset as determined by the Anchored class, our
     *     TipFrame popups have a special 'offset' property for each of their
     *     positions, which is used to offset the popup relative to its anchor.
     *
     * Parameters:
     * px - {<OpenLayers.Pixel>}
     *
     * Returns:
     * {<OpenLayers.Pixel>} The the new px position of the popup on the screen
     *     relative to the passed-in px.
     */
    calculateNewPx:function(px) {
        var newPx = OpenLayers.Popup.SideAnchored.prototype.calculateNewPx.apply(
            this, arguments
        );

        newPx = newPx.offset(this.positionBlocks[this.relativePosition].offset);

        return newPx;
    },

    /**
     * Method: createBlocks
     */
    createBlocks: function() {
        this.blocks = [];

        //since all positions contain the same number of blocks, we can
        // just pick the first position and use its blocks array to create
        // our blocks array
        var firstPosition = null;
        for(var key in this.positionBlocks) {
            firstPosition = key;
            break;
        }

        var posmap = { "t": "Top", "b": "Bottom", "l": "Left", "r": "Right" };
        var orientmap = { "h": "H", "v": "V" };

        this.tipDivContainer = OpenLayers.Util.createDiv(this.id + "_tipDivContainer", null, new OpenLayers.Size("auto", 16), null, "relative");
        this.tipDivContainer.className = this.tipContainerDisplayClass + orientmap[this.orientation];
        this.groupDiv.appendChild(this.tipDivContainer);

        var tipDivId = this.id + "_TipDiv";

      this.tipDiv = OpenLayers.Util.createDiv(this.id + "_tipDiv", null, null, null, "relative");
      this.tipDiv.className = this.tipDisplayClass + posmap[this.relativePosition];
      this.tipDivContainer.appendChild(this.tipDiv);
    },

    /**
     * Method: updateBlocks
     * Internal method, called on initialize and when the popup's relative
     *     position has changed. This function takes care of re-positioning
     *     the popup's blocks in their appropropriate places.
     */
    updateBlocks: function() {
        if (!this.blocks) {
            this.createBlocks();
        }

        if (this.size && this.relativePosition) {
            var position = this.positionBlocks[this.relativePosition];
/*

            for (var i = 0; i < position.blocks.length; i++) {

                var positionBlock = position.blocks[i];
                var block = this.blocks[i];

                // adjust sizes
                var l = positionBlock.anchor.left;
                var b = positionBlock.anchor.bottom;
                var r = positionBlock.anchor.right;
                var t = positionBlock.anchor.top;

                //note that we use the isNaN() test here because if the
                // size object is initialized with a "auto" parameter, the
                // size constructor calls parseFloat() on the string,
                // which will turn it into NaN
                //
                var w = (isNaN(positionBlock.size.w)) ? this.size.w - (r + l)
                                                      : positionBlock.size.w;

                var h = (isNaN(positionBlock.size.h)) ? this.size.h - (b + t)
                                                      : positionBlock.size.h;

                block.div.style.width = (w < 0 ? 0 : w) + 'px';
                block.div.style.height = (h < 0 ? 0 : h) + 'px';

                block.div.style.left = (l != null) ? l + 'px' : '';
                block.div.style.bottom = (b != null) ? b + 'px' : '';
                block.div.style.right = (r != null) ? r + 'px' : '';
                block.div.style.top = (t != null) ? t + 'px' : '';

                block.image.style.left = positionBlock.position.x + 'px';
                block.image.style.top = positionBlock.position.y + 'px';
            }

*/

            this.contentDiv.style.left = this.padding.left + "px";
            this.contentDiv.style.top = this.padding.top + "px";

            if (this.relativePosition == "t" || this.relativePosition == "r") {
                // already in right order
            } else {
                this.groupDiv.removeChild(this.tipDivContainer);
                this.groupDiv.insertBefore(this.tipDivContainer, this.contentDivWrapper);
            }

            // fixme: depending on position, but tipcontainer before or after content
            //var tmp = this.groupDiv.removeChild(this.tipDivContainer);

            //this.tipDivContainer.style.left = 0;
            //this.tipDivContainer.style.width = this.size.w;
            //this.tipDivContainer
        }
    },

    CLASS_NAME: "OpenLayers.Popup.TipFrame"
});
