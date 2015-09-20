/*
 * MelonJS Game Engine
 * Copyright (C) 2011 - 2015 Olivier Biot, Jason Oster, Aaron McLeod
 * http://www.melonjs.org
 *
 */
(function () {

    /**
     * a WebGL renderer object
     * @extends me.Renderer
     * @namespace me.WebGLRenderer
     * @memberOf me
     * @constructor
     * @param {Canvas} canvas The html canvas tag to draw to on screen.
     * @param {Number} width The width of the canvas without scaling
     * @param {Number} height The height of the canvas without scaling
     * @param {Object} [options] The renderer parameters
     * @param {Boolean} [options.doubleBuffering=false] Whether to enable double buffering
     * @param {Boolean} [options.antiAlias=false] Whether to enable anti-aliasing
     * @param {Boolean} [options.transparent=false] Whether to enable transparency on the canvas (performance hit when enabled)
     * @param {Number} [options.zoomX=width] The actual width of the canvas with scaling applied
     * @param {Number} [options.zoomY=height] The actual height of the canvas with scaling applied
     * @param {me.WebGLRenderer.Compositor} [options.compositor] A class that implements the compositor API
     */
    me.WebGLRenderer = me.Renderer.extend(
    /** @scope me.WebGLRenderer.prototype */
    {
        /**
         * @ignore
         */
        init : function (c, width, height, options) {
            this._super(me.Renderer, "init", [c, width, height, options]);

            /**
             * The WebGL context
             * @name gl
             * @memberOf me.WebGLRenderer
             */
            this.gl = this.getContextGL(c, !this.transparent);
            var gl = this.gl;

            /**
             * @ignore
             */
            this.colorStack = [];

            /**
             * @ignore
             */
            this._matrixStack = [];

            /**
             * @ignore
             */
            this._linePoints = [
                new me.Vector2d(),
                new me.Vector2d(),
                new me.Vector2d(),
                new me.Vector2d()
            ];

            /**
             * The global matrix. Used for transformations on the overall scene
             * @name globalMatrix
             * @type me.Matrix3d
             * @memberOf me.WebGLRenderer
             */
            this.globalMatrix = new me.Matrix2d();

            // Create a compositor
            var Compositor = options.compositor || me.WebGLRenderer.Compositor;
            this.compositor = new Compositor(
                gl,
                this.globalMatrix,
                this.globalColor
            );

            // Create a texture cache
            this.cache = new me.Renderer.TextureCache(
                this.compositor.maxTextures
            );

            // FIXME: Cannot reference me.video.renderer yet
            me.video.renderer = this;

            this.createFillTexture();
            this.createFontTexture();

            // Configure the WebGL viewport
            this.scaleCanvas(1, 1);

            return this;
        },

        /**
         * @ignore
         */
        createFillTexture : function () {
            // Create a 1x1 white texture for fill operations
            var img = new Uint8Array([255, 255, 255, 255]);

            /**
             * @ignore
             */
            this.fillTexture = new this.Texture({
                // FIXME: Create a texture atlas helper function
                "meta" : {
                    "app" : "melonJS",
                    "size" : { "w" : 1, "h" : 1 }
                },
                "frames" : [{
                    "filename" : "default",
                    "frame" : { "x" : 0, "y" : 0, "w" : 1, "h" : 1 }
                }]
            }, img);

            this.cache.put(img, this.fillTexture);
            this.compositor.uploadTexture(
                this.fillTexture,
                1,
                1,
                0
            );
        },

        /**
         * @ignore
         */
        createFontTexture : function () {
            var img = me.video.createCanvas(
                this.backBufferCanvas.width,
                this.backBufferCanvas.height
            );

            /**
             * @ignore
             */
            this.fontContext2D = this.getContext2d(img);

            /**
             * @ignore
             */
            this.fontTexture = new this.Texture({
                // FIXME: Create a texture atlas helper function
                "meta" : {
                    "app" : "melonJS",
                    "size" : {
                        "w" : this.backBufferCanvas.width,
                        "h" : this.backBufferCanvas.height
                    }
                },
                "frames" : [{
                    "filename" : "default",
                    "frame" : {
                        "x" : 0,
                        "y" : 0,
                        "w" : this.backBufferCanvas.width,
                        "h" : this.backBufferCanvas.height
                    }
                }]
            }, img);

            this.cache.put(img, this.fontTexture);
            this.compositor.uploadTexture(this.fontTexture);
        },

        /**
         * Create a pattern with the specified repition
         * @name createPattern
         * @memberOf me.WebGLRenderer
         * @function
         * @param {image} image Source image
         * @param {String} repeat Define how the pattern should be repeated
         * @return {me.video.renderer.Texture}
         * @see me.ImageLayer#repeat
         * @example
         * var tileable   = renderer.createPattern(image, "repeat");
         * var horizontal = renderer.createPattern(image, "repeat-x");
         * var vertical   = renderer.createPattern(image, "repeat-y");
         * var basic      = renderer.createPattern(image, "no-repeat");
         */
        createPattern : function (image, repeat) {
            var texture = new this.Texture({
                // FIXME: Create a texture atlas helper function
                "meta" : {
                    "app" : "melonJS",
                    "size" : { "w" : image.width, "h" : image.height },
                    "repeat" : repeat
                },
                "frames" : [{
                    "filename" : "default",
                    "frame" : { "x" : 0, "y" : 0, "w" : image.width, "h" : image.height }
                }]
            }, image);

            // FIXME: Remove old cache entry and texture when changing the repeat mode
            this.cache.put(image, texture);
            this.compositor.uploadTexture(texture);

            return texture;
        },

        /**
         * Flush the compositor to the frame buffer
         * @name blitSurface
         * @memberOf me.WebGLRenderer
         * @function
         */
        blitSurface : function () {
            this.compositor.flush();
        },

        /**
         * Clears the gl context. Accepts a gl context or defaults to stored gl renderer.
         * @name clearSurface
         * @memberOf me.WebGLRenderer
         * @function
         * @param {WebGLContext} [ctx=null] For compatibility only.
         * @param {me.Color|String} color CSS color.
         * @param {Boolean} [opaque=false] Allow transparency [default] or clear the surface completely [true]
         */
        clearSurface : function (ctx, col, opaque) {
            var color = this.globalColor.clone();
            var matrix = this.globalMatrix.clone();
            this.globalColor.copy(col);
            this.globalMatrix.identity();

            if (opaque) {
                this.compositor.clear();
            }
            else {
                this.fillRect(0, 0, this.canvas.width, this.canvas.height);
            }

            this.globalMatrix.copy(matrix);
            this.globalColor.copy(color);
            me.pool.push(color);
        },

        /**
         * @ignore
         */
        drawFont : function (bounds) {
            // Flush the compositor so we can upload a new texture
            this.compositor.flush();

            // Force-upload the new texture
            this.compositor.uploadTexture(this.fontTexture, 0, 0, 0, true);

            // Add the new quad
            var key = bounds.x + "," + bounds.y + "," + bounds.w + "," + bounds.h;
            this.compositor.addQuad(
                this.fontTexture,
                key,
                bounds.x,
                bounds.y,
                bounds.w,
                bounds.h
            );

            // Clear font context2D
            this.fontContext2D.clearRect(0, 0, this.backBufferCanvas.width, this.backBufferCanvas.height);
        },

        /**
         * Draw an image to the gl context
         * @name drawImage
         * @memberOf me.WebGLRenderer
         * @function
         * @param {Image} image Source image
         * @param {Number} sx Source x-coordinate
         * @param {Number} sy Source y-coordinate
         * @param {Number} sw Source width
         * @param {Number} sh Source height
         * @param {Number} dx Destination x-coordinate
         * @param {Number} dy Destination y-coordinate
         * @param {Number} dw Destination width
         * @param {Number} dh Destination height
         * @example
         * // Can be used in three ways:
         * renderer.drawImage(image, dx, dy);
         * renderer.drawImage(image, dx, dy, dw, dh);
         * renderer.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
         * // dx, dy, dw, dh being the destination target & dimensions. sx, sy, sw, sh being the position & dimensions to take from the image
         */
        drawImage : function (image, sx, sy, sw, sh, dx, dy, dw, dh) {
            // TODO: Replace the function signature with:
            // drawImage(Image|Object, sx, sy, sw, sh, dx, dy, dw, dh)
            if (typeof sw === "undefined") {
                sw = dw = image.width;
                sh = dh = image.height;
                dx = sx;
                dy = sy;
                sx = 0;
                sy = 0;
            }
            else if (typeof dx === "undefined") {
                dx = sx;
                dy = sy;
                dw = sw;
                dh = sh;
                sw = image.width;
                sh = image.height;
                sx = 0;
                sy = 0;
            }

            var key = sx + "," + sy + "," + sw + "," + sh;
            this.compositor.addQuad(this.cache.get(image), key, dx, dy, dw, dh);
        },

        /**
         * Draw a pattern within the given rectangle.
         * @name drawPattern
         * @memberOf me.WebGLRenderer
         * @function
         * @param {me.video.renderer.Texture} pattern Pattern object
         * @param {Number} x
         * @param {Number} y
         * @param {Number} width
         * @param {Number} height
         * @see me.WebGLRenderer#createPattern
         */
        drawPattern : function (pattern, x, y, width, height) {
            var key = "0,0," + width + "," + height;
            this.compositor.addQuad(pattern, key, x, y, width, height);
        },

        /**
         * Draw a filled rectangle at the specified coordinates
         * @name fillRect
         * @memberOf me.WebGLRenderer
         * @function
         * @param {Number} x
         * @param {Number} y
         * @param {Number} width
         * @param {Number} height
         */
        fillRect : function (x, y, width, height) {
            this.compositor.addQuad(this.fillTexture, "default", x, y, width, height);
        },

        /**
         * return a reference to the screen canvas corresponding WebGL Context<br>
         * @name getScreenContext
         * @memberOf me.WebGLRenderer
         * @function
         * @return {WebGLContext}
         */
        getScreenContext : function () {
            return this.gl;
        },

        /**
         * Returns the WebGL Context object of the given Canvas
         * @name getContextGL
         * @memberOf me.WebGLRenderer
         * @function
         * @param {Canvas} canvas
         * @param {Boolean} [opaque=false] Use true to disable transparency
         * @return {WebGLContext}
         */
        getContextGL : function (c, opaque) {
            if (typeof c === "undefined" || c === null) {
                throw new me.video.Error(
                    "You must pass a canvas element in order to create " +
                    "a GL context"
                );
            }

            if (typeof c.getContext === "undefined") {
                throw new me.video.Error(
                    "Your browser does not support WebGL."
                );
            }

            var attr = {
                antialias : this.antiAlias,
                alpha : !opaque,
            };
            return (
                c.getContext("webgl", attr) ||
                c.getContext("experimental-webgl", attr)
            );
        },

        /**
         * Returns the WebGLContext instance for the renderer
         * return a reference to the system 2d Context
         * @name getContext
         * @memberOf me.WebGLRenderer
         * @function
         * @return {WebGLContext}
         */
        getContext : function () {
            return this.gl;
        },

        /**
         * resets the gl transform to identity
         * @name resetTransform
         * @memberOf me.WebGLRenderer
         * @function
         */
        resetTransform : function () {
            this.globalMatrix.identity();
        },

        /**
         * Reset context state
         * @name reset
         * @memberOf me.WebGLRenderer
         * @function
         */
        reset : function () {
            this.globalMatrix.identity();
            this.cache.reset();
            this.compositor.reset();
            this.createFillTexture();
            this.createFontTexture();
        },

        /**
         * scales the canvas & GL Context
         * @name scaleCanvas
         * @memberOf me.WebGLRenderer
         * @function
         */
        scaleCanvas : function (scaleX, scaleY) {
            var w = this.canvas.width * scaleX;
            var h = this.canvas.height * scaleY;

            // adjust CSS style for High-DPI devices
            if (me.device.getPixelRatio() > 1) {
                this.canvas.style.width = (w / me.device.getPixelRatio()) + "px";
                this.canvas.style.height = (h / me.device.getPixelRatio()) + "px";
            }
            else {
                this.canvas.style.width = w + "px";
                this.canvas.style.height = h + "px";
            }

            this.compositor.setProjection(this.canvas.width, this.canvas.height);
        },

        /**
         * restores the canvas context
         * @name restore
         * @memberOf me.WebGLRenderer
         * @function
         */
        restore : function () {
            var color = this.colorStack.pop();
            me.pool.push(color);
            this.globalColor.copy(color);
            this.globalMatrix.copy(this._matrixStack.pop());
        },

        /**
         * rotates the uniform matrix
         * @name rotate
         * @memberOf me.WebGLRenderer
         * @function
         * @param {Number} angle in radians
         */
        rotate : function (angle) {
            this.globalMatrix.rotate(angle);
        },

        /**
         * save the canvas context
         * @name save
         * @memberOf me.WebGLRenderer
         * @function
         */
        save : function () {
            this.colorStack.push(this.globalColor.clone());
            this._matrixStack.push(this.globalMatrix.clone());
        },

        /**
         * scales the uniform matrix
         * @name scale
         * @memberOf me.WebGLRenderer
         * @function
         * @param {Number} x
         * @param {Number} y
         */
        scale : function (x, y) {
            this.globalMatrix.scale(x, y);
        },

        /**
         * not used by this renderer?
         * @ignore
         */
        setAntiAlias : function (context, enable) {
            this._super(me.Renderer, "setAntiAlias", [context, enable]);
            // TODO: perhaps handle GLNEAREST or other options with texture binding
        },

        /**
         * return the current global alpha
         * @name globalAlpha
         * @memberOf me.WebGLRenderer
         * @function
         * @return {Number}
         */
        setGlobalAlpha : function (a) {
            this.globalColor.glArray[3] = a;
        },

        /**
         * Sets the color for further draw calls
         * @name setColor
         * @memberOf me.WebGLRenderer
         * @function
         * @param {me.Color|String} color css color string.
         */
        setColor : function (color) {
            this.globalColor.copy(color);
        },

        /**
         * Set the line width
         * @name setLineWidth
         * @memberOf me.WebGLRenderer
         * @function
         * @param {Number} width Line width
         */
        setLineWidth : function (width) {
            this.compositor.lineWidth(width);
        },

        /**
         * Stroke an arc at the specified coordinates with given radius, start and end points
         * @name strokeArc
         * @memberOf me.WebGLRenderer
         * @function
         * @param {Number} x arc center point x-axis
         * @param {Number} y arc center point y-axis
         * @param {Number} radius
         * @param {Number} start start angle in radians
         * @param {Number} end end angle in radians
         * @param {Boolean} [antiClockwise=false] draw arc anti-clockwise
         */
        strokeArc : function (/*x, y, radius, start, end, antiClockwise*/) {
            // TODO
        },

        /**
         * Stroke an ellipse at the specified coordinates with given radius, start and end points
         * @name strokeEllipse
         * @memberOf me.WebGLRenderer
         * @function
         * @param {Number} x arc center point x-axis
         * @param {Number} y arc center point y-axis
         * @param {Number} w horizontal radius of the ellipse
         * @param {Number} h vertical radius of the ellipse
         */
        strokeEllipse : function (/*x, y, w, h*/) {
            // TODO
        },

        /**
         * Stroke a line of the given two points
         * @name strokeLine
         * @memberOf me.WebGLRenderer
         * @function
         * @param {Number} startX the start x coordinate
         * @param {Number} startY the start y coordinate
         * @param {Number} endX the end x coordinate
         * @param {Number} endY the end y coordinate
         */
        strokeLine : function (startX, startY, endX, endY) {
            var points = this._linePoints.slice(0, 2);
            points[0].x = startX;
            points[0].y = startY;
            points[1].x = endX;
            points[1].y = endY;
            this.compositor.drawLine(points, true);
        },

        /**
         * Strokes a me.Polygon on the screen with a specified color
         * @name strokePolygon
         * @memberOf me.WebGLRenderer
         * @function
         * @param {me.Polygon} poly the shape to draw
         */
        strokePolygon : function (poly) {
            var len = poly.points.length,
                points,
                i;

            // Grow internal points buffer if necessary
            for (i = this._linePoints.length; i < len; i++) {
                this._linePoints.push(new me.Vector2d());
            }

            points = this._linePoints.slice(0, len);
            for (i = 0; i < len; i++) {
                points[i].x = poly.pos.x + poly.points[i].x;
                points[i].y = poly.pos.y + poly.points[i].y;
            }
            this.compositor.drawLine(points);
        },

        /**
         * Draw a stroke rectangle at the specified coordinates
         * @name strokeRect
         * @memberOf me.WebGLRenderer
         * @function
         * @param {Number} x
         * @param {Number} y
         * @param {Number} width
         * @param {Number} height
         */
        strokeRect : function (x, y, width, height) {
            var points = this._linePoints.slice(0, 4);
            points[0].x = x;
            points[0].y = y;
            points[1].x = x + width;
            points[1].y = y;
            points[2].x = x + width;
            points[2].y = y + height;
            points[3].x = x;
            points[3].y = y + height;
            this.compositor.drawLine(points);
        },

        /**
         * draw the given shape
         * @name drawShape
         * @memberOf me.WebGLRenderer
         * @function
         * @param {me.Rect|me.Polygon|me.Line|me.Ellipse} shape a shape object
         */
        drawShape : function (shape) {
            if (shape instanceof me.Rect) {
                this.strokeRect(shape.left, shape.top, shape.width, shape.height);
            } else if (shape instanceof me.Line || shape instanceof me.Polygon) {
                this.save();
                this.strokePolygon(shape);
                this.restore();
            } else if (shape instanceof me.Ellipse) {
                this.save();
                if (shape.radiusV.x === shape.radiusV.y) {
                    // it's a circle
                    this.strokeArc(
                        shape.pos.x - shape.radius,
                        shape.pos.y - shape.radius,
                        shape.radius,
                        0,
                        2 * Math.PI
                    );
                } else {
                    // it's an ellipse
                    this.strokeEllipse(
                        shape.pos.x,
                        shape.pos.y,
                        shape.radiusV.x,
                        shape.radiusV.y
                    );
                }
                this.restore();
            }
        },

        /**
         * Multiply given matrix into the renderer tranformation matrix
         * @name multiplyMatrix
         * @memberOf me.WebGLRenderer
         * @function
         * @param {me.Matrix2d} mat2d Matrix to transform by
         */
        transform : function (mat2d) {
            this.globalMatrix.multiply(mat2d);
        },

        /**
         * Translates the uniform matrix by the given coordinates
         * @name translate
         * @memberOf me.WebGLRenderer
         * @function
         * @param {Number} x
         * @param {Number} y
         */
        translate : function (x, y) {
            this.globalMatrix.translate(x, y);
        }
    });

})();
