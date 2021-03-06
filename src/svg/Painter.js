/**
 * SVG Painter
 * @module zrender/svg/Painter
 */

import {createElement} from './core';
import zrLog from '../core/log';
import Path from '../graphic/Path';
import ZImage from '../graphic/Image';
import ZText from '../graphic/Text';
import arrayDiff from '../core/arrayDiff2';
import GradientManager from './helper/GradientManager';
import ClippathManager from './helper/ClippathManager';
import {each} from '../core/util';
import {
    path as svgPath,
    image as svgImage,
    text as svgText
} from './graphic';

function parseInt10(val) {
    return parseInt(val, 10);
}

function getSvgProxy(el) {
    if (el instanceof Path) {
        return svgPath;
    }
    else if (el instanceof ZImage) {
        return svgImage;
    }
    else if (el instanceof ZText) {
        return svgText;
    }
    else {
        return svgPath;
    }
}

function checkParentAvailable(parent, child) {
    return child && parent && child.parentNode !== parent;
}

function insertAfter(parent, child, prevSibling) {
    if (checkParentAvailable(parent, child) && prevSibling) {
        var nextSibling = prevSibling.nextSibling;
        nextSibling ? parent.insertBefore(child, nextSibling)
            : parent.appendChild(child);
    }
}

function prepend(parent, child) {
    if (checkParentAvailable(parent, child)) {
        var firstChild = parent.firstChild;
        firstChild ? parent.insertBefore(child, firstChild)
            : parent.appendChild(child);
    }
}

function append(parent, child) {
    if (checkParentAvailable(parent, child)) {
        parent.appendChild(child);
    }
}

function remove(parent, child) {
    if (child && parent && child.parentNode === parent) {
        parent.removeChild(child);
    }
}

function getTextSvgElement(displayable) {
    return displayable.__textSvgEl;
}

function getSvgElement(displayable) {
    return displayable.__svgEl;
}

/**
 * @alias module:zrender/svg/Painter
 */
var SVGPainter = function (root, storage) {

    this.root = root;

    this.storage = storage;

    var svgRoot = createElement('svg');
    svgRoot.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgRoot.setAttribute('version', '1.1');
    svgRoot.setAttribute('baseProfile', 'full');
    svgRoot.style['user-select'] = 'none';

    this.gradientManager = new GradientManager(svgRoot);
    this.clipPathManager = new ClippathManager(svgRoot);

    var viewport = document.createElement('div');
    viewport.style.cssText = 'overflow: hidden;';

    this._svgRoot = svgRoot;
    this._viewport = viewport;

    root.appendChild(viewport);
    viewport.appendChild(svgRoot);

    this.resize();

    this._visibleList = [];
};

SVGPainter.prototype = {

    constructor: SVGPainter,

    getType: function () {
        return 'svg';
    },

    getViewportRoot: function () {
        return this._viewport;
    },

    getViewportRootOffset: function () {
        var viewportRoot = this.getViewportRoot();
        if (viewportRoot) {
            return {
                offsetLeft: viewportRoot.offsetLeft || 0,
                offsetTop: viewportRoot.offsetTop || 0
            };
        }
    },

    refresh: function () {

        var list = this.storage.getDisplayList(true);

        this._paintList(list);
    },

    _paintList: function (list) {
        this.gradientManager.markAllUnused();
        this.clipPathManager.markAllUnused();

        var svgRoot = this._svgRoot;
        var visibleList = this._visibleList;
        var listLen = list.length;

        var newVisibleList = [];
        var i;
        for (i = 0; i < listLen; i++) {
            var displayable = list[i];
            var svgProxy = getSvgProxy(displayable);
            if (!displayable.invisible) {
                if (displayable.__dirty) {
                    svgProxy && svgProxy.brush(displayable);
                    var el = getSvgElement(displayable)
                        || getTextSvgElement(displayable);

                    // Update clipPath
                    this.clipPathManager.update(displayable, el);

                    // Update gradient
                    if (displayable.style) {
                        this.gradientManager
                            .update(displayable.style.fill);
                        this.gradientManager
                            .update(displayable.style.stroke);
                    }

                    displayable.__dirty = false;
                }
                newVisibleList.push(displayable);
            }
        }

        var diff = arrayDiff(visibleList, newVisibleList);
        var prevSvgElement;

        // First do remove, in case element moved to the head and do remove
        // after add
        for (i = 0; i < diff.length; i++) {
            var item = diff[i];
            if (item.removed) {
                for (var k = 0; k < item.count; k++) {
                    var displayable = visibleList[item.indices[k]];
                    var svgElement = getSvgElement(displayable);
                    var textSvgElement = getTextSvgElement(displayable);
                    remove(svgRoot, svgElement);
                    remove(svgRoot, textSvgElement);
                }
            }
        }
        for (i = 0; i < diff.length; i++) {
            var item = diff[i];
            if (item.added) {
                for (var k = 0; k < item.count; k++) {
                    var displayable = newVisibleList[item.indices[k]];
                    var svgElement = getSvgElement(displayable);
                    var textSvgElement = getTextSvgElement(displayable);
                    prevSvgElement
                        ? insertAfter(svgRoot, svgElement, prevSvgElement)
                        : prepend(svgRoot, svgElement);
                    if (svgElement) {
                        insertAfter(svgRoot, textSvgElement, svgElement);
                    }
                    else if (prevSvgElement) {
                        insertAfter(
                            svgRoot, textSvgElement, prevSvgElement
                        );
                    }
                    else {
                        prepend(svgRoot, textSvgElement);
                    }
                    // Insert text
                    insertAfter(svgRoot, textSvgElement, svgElement);
                    prevSvgElement = textSvgElement || svgElement
                        || prevSvgElement;

                    this.gradientManager
                        .addWithoutUpdate(svgElement, displayable);
                    this.clipPathManager.markUsed(displayable);
                }
            }
            else if (!item.removed) {
                for (var k = 0; k < item.count; k++) {
                    var displayable = newVisibleList[item.indices[k]];
                    prevSvgElement
                        = svgElement
                        = getTextSvgElement(displayable)
                        || getSvgElement(displayable)
                        || prevSvgElement;

                    this.gradientManager.markUsed(displayable);
                    this.gradientManager
                        .addWithoutUpdate(svgElement, displayable);

                    this.clipPathManager.markUsed(displayable);
                }
            }
        }

        this.gradientManager.removeUnused();
        this.clipPathManager.removeUnused();

        this._visibleList = newVisibleList;
    },

    _getDefs: function (isForceCreating) {
        var svgRoot = this._svgRoot;
        var defs = this._svgRoot.getElementsByTagName('defs');
        if (defs.length === 0) {
            // Not exist
            if (isForceCreating) {
                var defs = svgRoot.insertBefore(
                    createElement('defs'), // Create new tag
                    svgRoot.firstChild // Insert in the front of svg
                );
                if (!defs.contains) {
                    // IE doesn't support contains method
                    defs.contains = function (el) {
                        var children = defs.children;
                        if (!children) {
                            return false;
                        }
                        for (var i = children.length - 1; i >= 0; --i) {
                            if (children[i] === el) {
                                return true;
                            }
                        }
                        return false;
                    };
                }
                return defs;
            }
            else {
                return null;
            }
        }
        else {
            return defs[0];
        }
    },

    resize: function () {
        var width = this._getWidth();
        var height = this._getHeight();

        if (this._width !== width && this._height !== height) {
            this._width = width;
            this._height = height;

            var viewportStyle = this._viewport.style;
            viewportStyle.width = width + 'px';
            viewportStyle.height = height + 'px';

            var svgRoot = this._svgRoot;
            // Set width by 'svgRoot.width = width' is invalid
            svgRoot.setAttribute('width', width);
            svgRoot.setAttribute('height', height);
        }
    },

    getWidth: function () {
        return this._getWidth();
    },

    getHeight: function () {
        return this._getHeight();
    },

    _getWidth: function () {
        var root = this.root;
        var stl = document.defaultView.getComputedStyle(root);

        return ((root.clientWidth || parseInt10(stl.width))
                - parseInt10(stl.paddingLeft)
                - parseInt10(stl.paddingRight)) | 0;
    },

    _getHeight: function () {
        var root = this.root;
        var stl = document.defaultView.getComputedStyle(root);

        return ((root.clientHeight || parseInt10(stl.height))
                - parseInt10(stl.paddingTop)
                - parseInt10(stl.paddingBottom)) | 0;
    },

    dispose: function () {
        this.root.innerHTML = '';

        this._svgRoot
            = this._viewport
            = this.storage
            = null;
    },

    clear: function () {
        if (this._viewport) {
            this.root.removeChild(this._viewport);
        }
    },

    pathToSvg: function () {
        this.refresh();
        var html = this._svgRoot.outerHTML;
        return 'data:img/svg+xml;utf-8,' + unescape(html);
    }
};

// Not supported methods
function createMethodNotSupport(method) {
    return function () {
        zrLog('In SVG mode painter not support method "' + method + '"');
    };
}

// Unsuppoted methods
each([
    'getLayer', 'insertLayer', 'eachLayer', 'eachBuiltinLayer',
    'eachOtherLayer', 'getLayers', 'modLayer', 'delLayer', 'clearLayer',
    'toDataURL', 'pathToImage'
], function (name) {
    SVGPainter.prototype[name] = createMethodNotSupport(name);
});

export default SVGPainter;