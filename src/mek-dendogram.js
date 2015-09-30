/*globals define, console*/
define( [
	'jquery',
	'qvangular',
	'translator',
	'./properties',
	'./locales',
	'objects.extension/controller',
	'objects.extension/default-view',
	'objects.extension/object-conversion',
	'objects.extension/default-selection-toolbar',
	'objects.backend-api/pivot-api',
	'objects.utils/event-utils',
	'./selection',
	'extensions.qliktech/pivot-table/properties/pivot-sorting/pivot-sorting',
	'client.property-panel/components/components',
	'./tooltip',
	'./data-processor',
	'text!./defs.html',
	'text!./style.css',

	'./d3',
	'objects.views/charts/tooltip/chart-tooltip-service'
],
function(
	$,
	qvangular,
	translator,
	properties,
	locales,
	Controller,
	DefaultView,
	objectConversion,
	DefaultSelectionToolbar,
	PivotApi,
	EventUtils,
	selections,
	pivotSorting,
	components,
	tooltip,
	dataProcessor,
	defs,
	style
) {

	var embedStyle = "/* <![CDATA[ */ " + style + " /* ]]> */";
	var duration = 500;
	var namespace = ".mekDendrogram";
	
	translator.append( locales[translator.language] || locales["en-US"] );
	
	/*
	function select ( node ) {
		if ( node.elemNo < 0 && node.elemNo !== -3 ) {
			return;
		}

		if ( node.isLocked ) {
			EventUtils.showLockedFeedback( [this._layout.qHyperCube.qDimensionInfo[node.col]] );
			return;
		}

		if ( !this._selectedElemNo ) {
			this._selectedElemNo = {};
		}

		if ( this.mySelections.active ) {
			if ( node.col !== this.mySelections.col ) {
				return;
			}
		}
		else {
			this.mySelections.active = true;
			this._root.attr( "class", "root inSelections" );
			this.mySelections.col = node.col;
		}

		var selected = !(node.elemNo in this._selectedElemNo);

		if ( !selected ) {
			delete this._selectedElemNo[node.elemNo];
		}
		else {
			this._selectedElemNo[node.elemNo] = node.row;
		}

		var selectedRows = [];
		for ( var e in this._selectedElemNo ) {
			selectedRows.push( this._selectedElemNo[e] );
		}

		this.selectValues( node.col, selectedRows );
	}
	*/

	/*
	function clearSelections ( endSelections ) {
		this._selectedElemNo = {};

		if ( endSelections ) {
			this.mySelections.active = false;
			this._root.attr( "class", "root" );
		}
	}
	*/

	function onNodeMouseOver ( d, el, event, isRadial ) {
		tooltip.current.d = d;
		tooltip.current.el = el;
		tooltip.current.isRadial = isRadial;

		tooltip.activate();
	}

	function onNodeMouseLeave () {
		tooltip.inactivate();
	}

	var linearDiagonal = d3.svg.diagonal()
		.projection( function ( d ) {
			return [d.y, d.x];
		} );

	var radialDiagonal = d3.svg.diagonal.radial()
		.projection( function ( d ) {
			return [d.y, d.x / 180 * Math.PI]
		} );

	var radialTransformFn = function ( d ) {
		return "rotate(" + (d.x - 90) + ") translate(" + d.y + ")";
	};

	var linearTransformFn = function ( d ) {
		return "translate(" + d.y + "," + d.x + ")";
	};

	var radialTextAnchorFn = function ( d ) {
		return d.x < 180 ? "start" : "end";
	};

	var linearTextAnchorFn = function ( d ) {
		return d.canCollapse || d.canExpand || d.children ? "end" : "start";
	};

	var colorFn = function ( d ) {
		return ( d.target ? d.target.color : d.color ) || 'rgb(100, 150, 150)';
	};

	var strokeColorFn = function ( d ) {
		return d.canCollapse || d.canExpand ? d3.rgb( colorFn( d ) ).darker().toString() : '';
	};
	
	function toggle( d ) {
		
		if ( d.canExpand ) {
			this.backendApi.expandLeft( d.row, d.col, false );
			this._toggledNode = d;
		}
		else if( d.canCollapse ) {
			this.backendApi.collapseLeft( d.row, d.col, false );
			this._toggledNode = d;
		}
	}

	/*function toggle(d) {
		if ( d.children ) {
			d._children = d.children;
			d.children = null;
		}
		else if( d._children ) {
			d.children = d._children;
			d._children = null;
		}
	}*/

	function getMinMax ( node, prop ) {

		var max = -Number.MIN_VALUE,
			min = Number.MAX_VALUE;

		if ( node.children ) {
			node.children.forEach( function ( c ) {
				var m = getMinMax( c, prop );
				max = Math.max( max, m.max );
				min = Math.min( min, m.min );
			} );
		}

		max = Math.max( max, node[prop] );
		min = Math.min( min, node[prop] );

		if ( isNaN( max ) ) {
			max = min = 1;
		}

		return {
			max: max,
			min: min
		};
	}

	function _update( source ) {
		clearTimeout( this._rotationTimer );
		var self = this,
			radius = this._radius,
			levels = this._levels,
			maxNumLevels = levels.length,//this._layout.qHyperCube.qDimensionInfo.length,
			temp,
			isRadial = this._isRadial;

		var maxLevelNodes = Math.max.apply( null, levels );

		var minPointSize = 40 * (self._layout.dataPoint && self._layout.dataPoint.size ? self._layout.dataPoint.size[0] : 1);
		var maxPointSize = 40 * ( self._layout.dataPoint && self._layout.dataPoint.size ? self._layout.dataPoint.size[1] : 1);

		if ( isRadial ) {
			var maxArcLength = 0.5 * Math.PI * radius / maxLevelNodes;
			if( maxPointSize > maxArcLength ) {
				minPointSize = Math.max( 2, minPointSize * maxArcLength / maxPointSize );
				maxPointSize = Math.max( minPointSize, maxArcLength );
			}
			//maxPointSize = Math.min( maxPointSize, Math.max( maxArcLength / 2, minPointSize * 4 ) );
			//minPointSize = Math.max( minPointSize, Math.min( maxPointSize / 4, maxArcLength / 8 ) );
		}
		else {
			var boo = 0.5 * Math.min( self._width / maxLevelNodes, self._height / levels.length );
			if( maxPointSize > boo ) {
				minPointSize = Math.max( 2, minPointSize * boo / maxPointSize );
				maxPointSize = Math.max( minPointSize, boo );
			}
			//minPointSize = Math.max( minPointSize, boo / 8 );
			//maxPointSize = Math.max( minPointSize, Math.min( maxPointSize, Math.max( boo / 2, 2 ) ) );
		}

		self._pointSize = {min: minPointSize, max: maxPointSize};
		self._sizing = d3.scale.linear().domain( [self._minMax.min, self._minMax.max] ).rangeRound( [minPointSize, maxPointSize] ).clamp( true );

		temp = maxLevelNodes * maxPointSize / Math.PI;

		var arcSize = 360;

		levels = levels.map( function ( n ) {
			return {
				showLabels: isRadial ? (radius * 2 * Math.PI) / n > 16 : self._width / n > 8,
				nodes: n
			};
		} );

		var treeWidth = self._height;
		var textWidths = [];
		var maxW;
		if ( !isRadial ) {
			self._padding.left = maxPointSize + maxPointSize / 6;
			self._padding.right = maxPointSize + maxPointSize / 6;
			
			// if more than one level and level one visible -> add padding to left
			if ( maxNumLevels > 1 && levels[0].showLabels ) {
				maxW = this._layout.qHyperCube.qDimensionInfo[0].qApprMaxGlyphCount * 12;
				temp = Math.min( (this._w - (maxPointSize * 2 + 8) * levels.length) * (1 / levels.length), maxW );
				if ( temp > 64 || temp >= 12 && temp/maxW >= 0.2 ) {
					self._padding.left += temp + 8;
					levels[0].spacingAdded = temp + 8;
				}
				else {
					levels[0].showLabels = false;
				}
			}
			if ( maxNumLevels === levels.length && levels[levels.length - 1] && levels[levels.length - 1].showLabels ) {
				maxW = this._layout.qHyperCube.qDimensionInfo.slice( -1 )[0].qApprMaxGlyphCount * 12;
				temp = Math.min( (this._w - (maxPointSize * 2 + 8) * levels.length) * (1 / levels.length), maxW );
				if ( temp > 64 || temp >=12 && temp/maxW >= 0.2 ) {
					self._padding.right += temp + 8;
					levels[levels.length - 1].spacingAdded = temp + 8;
				}
				else {
					levels[levels.length - 1].showLabels = false;
				}
			}
			treeWidth -= (self._padding.left + self._padding.right);

			textWidths = levels.map( function ( ) {
				return (treeWidth / (levels.length - 1 || 1)) - 8 - maxPointSize * 2;
			} );

			if ( maxNumLevels > 1 && levels[0].showLabels ) {
				textWidths[0] = self._padding.left - 8 - maxPointSize;
			}
			if ( maxNumLevels === levels.length && levels[levels.length - 1] && levels[levels.length - 1].showLabels ) {
				textWidths[levels.length - 1] = self._padding.right - 8 - maxPointSize;
			}

			textWidths.forEach( function ( w, i ) {
				if ( !levels[0].showLabels || w < 12 || w/(this._layout.qHyperCube.qDimensionInfo[i].qApprMaxGlyphCount * 12 ) < 0.2 ) {
					levels[i].showLabels = false;
				}
			}, this );
		}
		else {
			radius -= maxPointSize;
			maxW = this._layout.qHyperCube.qDimensionInfo.slice( -1 )[0].qApprMaxGlyphCount * 12;
			temp = Math.min( (radius - (maxPointSize * 2 + 8) * levels.length) * Math.min( 0.5, 1 / levels.length ), maxW );
			if ( levels[levels.length - 1].showLabels && ( temp >= 12 || (temp > 64 && temp/maxW > 0.2) ) ) {
				radius -= temp;
			}
			levels.forEach( function ( level, i ) {
				textWidths.push( radius / ( levels.length ) - maxPointSize * 2 - 16 );
				maxW = maxW = self._layout.qHyperCube.qDimensionInfo[i].qApprMaxGlyphCount * 12;
				if ( i < levels.length - 1 && ( textWidths[i] < 12 || textWidths < 64 && textWidths[i]/maxW < 0.2) ) {
					level.showLabels = false;
				}
			} );
			textWidths[levels.length - 1] = temp;
			levels[levels.length - 1].showLabels = levels[levels.length - 1].showLabels && temp >= 24;
		}

		var linearTree = d3.layout.tree().size( [self._width, treeWidth] ).separation( function ( a, b ) {
			return self._sizing( a.size ) + self._sizing( b.size );
		} );

		var radialTree = d3.layout.tree().size( [arcSize, radius] )
			.separation( function ( a, b ) {
				return ( self._sizing( a.size ) + self._sizing( b.size ) ) * ( (a.parent === b.parent ? 1 : 2) / (a.depth || 1) );
				//return (sizing(a.size) + sizing( b.size )) / a.depth;
			} );

		var sizeFn = function ( d ) {
			d.nodeSize = d.target ? self._layout.adaptiveStrokeWidth ? self._sizing( d.target.size ) : 1 : // d.target exists for node links
				self._sizing( d.size );
			return d.nodeSize;
		};

		var radialTextTransformFn = function ( d ) {
			return d.x < 180 ? "translate(" + (8 + self._pointSize.max) + ")" : "rotate(180) translate(-" + (8 + self._pointSize.max) + ")";
		};

		var linearTextTransform = function ( d ) {
			return "translate(" + (d.canExpand || d.children ? -1 : 1) * (8 + self._pointSize.max) + ")";
		};

		var diagonal = isRadial ? radialDiagonal : linearDiagonal;
		var transformFn = isRadial ? radialTransformFn : linearTransformFn;
		var tree = isRadial ? radialTree : linearTree;
		var textTransformFn = isRadial ? radialTextTransformFn : linearTextTransform;
		var textAnchorFn = isRadial ? radialTextAnchorFn : linearTextAnchorFn;

		var nodes = tree.nodes( self._data ).reverse();
		var levelNodes = [];
		nodes.forEach( function ( n ) {
			if ( !levelNodes[n.depth] ) {
				levelNodes[n.depth] = [];
			}
			levelNodes[n.depth].push( n );
		} );
		
		this.levelNodes = levelNodes;

		if ( tree === radialTree ) {
			nodes.forEach( function ( d ) {
				d.x = (((d.x + (arcSize === 360 ? self._rotation : 0) ) % 360) + 360 ) % 360;
				//if ( arcSize <= 180 ) {
				//	d.y = ( d.y - radius/levels.length ) / ( radius - radius/levels.length);
				//	d.y *= radius;
				//}
			} );
		}
		else {
			levelNodes.filter( function ( level ) {
				return !!level;
			} ).forEach( function ( level ) {
				level.forEach( function ( n, i, arr ) {

					var dx = 0;
					if ( i < arr.length - 1 ) {
						dx = Math.abs( n.x - arr[i + 1].x );
					}
					else {
						dx = n.x * 2.4;
					}

					if ( i > 0 ) {
						dx = Math.min( dx, Math.abs( n.x - arr[i - 1].x ) );
					}
					else {
						dx = Math.min( dx, (self._width - n.x) * 2.4 );
					}

					if ( dx < 10 ) {
						n.showLabel = false;
					}
					else if ( n.depth > 0 ) {
						n.showLabel = true;
						levels[n.depth - 1].hasVisibleLabels = true;
					}
				} );
			} );
			levels.forEach( function( l, i ) {
				if ( !l.hasVisibleLabels ) {
					l.showLabels = false;
					if ( l.spacingAdded ) {
						treeWidth += l.spacingAdded;
						if ( i === 0 ) {
							self._padding.left -= l.spacingAdded;
						}
						else if( i === levels.length - 1) {
							self._padding.right -= l.spacingAdded;
						}
					}
				}
			} );
		}
		
		
		

		var spacing = 200;
		if ( self._data.name === '_root' ) {
			nodes.pop();

			if ( tree === linearTree ) {
				spacing = levels.length > 1 ? treeWidth / (levels.length - 1) : treeWidth / 2;
				nodes.forEach( function ( d ) {
					d.y = ( d.depth - 1) * spacing;
				} );
			}
			else if ( tree === radialTree ) {
				//spacing = (radius - self._pointSize.max * 2 - 16) / levels.length;
				//levels.forEach( function ( level, i ) {
				//	level.showLabels = level.showLabels && i < levels.length - 1 ? spacing > 40 : level.showLabels;
				//} );
			}
		}

		var rdx = this._w / 2 - radius;
		var rdy = this._h / 2 - radius;

		var wrap = function ( d ) {
			var self = d3.select( this ),
				dx, dy,
				width = d.depth === levels.length ? 100 : spacing,
				padding = 0,
				approxFit,
				textLength,
				text;
			dx = rdx * Math.cos( (d.x + 90) * Math.PI / 180 );
			dy = rdy * Math.sin( (d.x + 90) * Math.PI / 180 );
			width = isRadial && d.depth === levels.length ?
			Math.sqrt( dx * dx + dy * dy ) - maxPointSize - 8 :
				textWidths[d.depth - 1];
			self.text( d.name );
			textLength = self.node().getComputedTextLength();
			text = self.text();
			if ( textLength > width && text.length > 0 ) {
				approxFit = Math.ceil( width / (textLength / text.length) );
				text = text.slice( 0, approxFit );
			}
			while ( textLength > (width - 2 * padding) && text.length > 0 ) {
				text = text.slice( 0, -1 );
				self.text( text + '…' );
				textLength = self.node().getComputedTextLength();
			}
		};

		var checkTextNode = function ( d ) {
			if ( d.showLabel === false || ( d.depth > 0 && levels[d.depth - 1].showLabels === false ) ) {
				d3.select( this ).select( "text" ).remove();
				return;
			}

			var t = this.querySelector( "text" );
			if ( !t ) { // enter
				d3.select( this ).append( "text" )
					.text( d.name )
					.attr( "dy", ".35em" )
					.style( "fill-opacity", 1e-6 );
			}

			// update
			d3.select( this ).select( "text" )
				.text( d.name )
				.each( wrap )
				.attr( "text-anchor", textAnchorFn )
				.attr( 'transform', textTransformFn )
				.transition()
				.duration( duration )
				.style( "fill-opacity", 1 );
		};

		var checkEmoticonNode = function ( d ) {

			if ( !d.emoticon || d.nodeSize < 8 ) {
				d3.select( this ).select( "use" ).remove();
				return;
			}

			var t = this.querySelector( "use" );
			if ( !t ) { // enter
				d3.select( this ).append( "use" )
					.attr( "xlink:href", '#' + d.emoticon )
					.attr( "transform", "scale(0.001, 0.001) translate(-370, -540)" );
			}
			else {
				t.setAttribute( "href", '#' + d.emoticon );
			}
		};

		var enteringTransform = isRadial ?
		"rotate(" + (source._x - 90) + ") translate(" + source._y + ")" :
		"translate(" + source._y + "," + source._x + ")";

		var exitingTransform = isRadial ?
		"rotate(" + (source.x - 90) + ") translate(" + source.y + ")" :
		"translate(" + source.y + "," + source.x + ")";

		//nodes.forEach(function( d ) {
		//	d.y = d.depth * 240;
		//});

		// update existing nodes
		var node = self._root.selectAll( "g.node" )
			.data( nodes, function ( d, i ) {
				return d.id || (d.id = ++i);
			} );
		
		// attach new nodes to parent's previous position (position to transition from) 
		var nodeEnter = node.enter().append( "g" )
			.attr( "class", function ( d ) {
				return "node " + ((d.children || d._children) ? 'branch' : "leaf");
			} )
			.attr( "transform", enteringTransform )
			//.on( 'click', onTap )
			.on( "mouseenter", function ( d ) {
				onNodeMouseOver( d, this, d3.event, isRadial );
			} )
			.on( "mouseleave", function ( d ) {
				onNodeMouseLeave( d, null, d3.event );
			} );

		nodeEnter.append( "circle" )
			.style( "fill", colorFn )
			.style( "stroke", strokeColorFn )
			.attr( "r", 1e-6 );

		/*
		nodeEnter.append("use")
			.attr("xlink:href", function( d ) {
				return "#" + d.emoticon;
			})
			.attr("transform", "scale(0.001, 0.001) translate(-370, -540)");
		*/

		//nodeEnter.append("text")
		//	.attr("dy", ".35em")
		//	.text(function( d ) {
		//		return d.name;
		//	})
		//	.each(wrap)
		//.style("fill-opacity", 1e-6);

		var nodeUpdate = node.transition()
			.duration( duration )
			.attr( "transform", transformFn );
			//.style( 'stroke-width', function ( d ) {
			//	return Math.sqrt( d.size ) / 150;
			//} );

		nodeUpdate.attr( "class", function ( d ) {
			var classes = ['node'],
				cellId = d.col + ";" + d.row;
			classes.push( (d.children || d._children) ? 'branch' : 'leaf' );
			if ( d.canExpand || d.canCollapse ) {
				classes.push( 'node-expandable' );
			}
			if ( !d.isLocked && (!self.mySelections.active || self.mySelections.active && self.mySelections.col === d.col) ) {
				classes.push( "node-selectable" );
			}
			if ( self.mySelections.active ) {
				if( !self._isPathSelectActive ) {
					if ( d.col in self._selectedElemNo && d.elemNo in self._selectedElemNo[d.col] ) {
						classes.push( 'node-selected' );
					}
					else if ( self.mySelections.col !== d.col ) {
						classes.push( 'unselectable' );
					}
				}
				else if( self._selectedCells && (cellId in self._selectedCells) ) {
					classes.push( 'node-selected' );
				}
				else if( self._pathSelected && self._pathSelected[cellId] ) {
					classes.push( 'node-semi-selected' );
				}
				else if ( self.mySelections.col !== d.col ) {
					classes.push( 'unselectable' );
				}
			}

			return classes.join( " " );
		} );

		nodeUpdate.select( "circle" )
			.style( "stroke", strokeColorFn )
			.style( "fill", colorFn )
			.style( "stroke-width", function ( d ) {
				return d.canCollapse || d.canExpand ? sizeFn( d ) / 6 : 0;
			} )
			.attr( "r", sizeFn )
			.attr( "class", function ( d ) {
				return (d.children || d._children) ? 'branch' : "leaf";
			} );

		nodeUpdate.each( checkTextNode );
		nodeUpdate.each( checkEmoticonNode );

		nodeUpdate.select( "use" )
			.attr( "transform", function ( d ) {
				var size = sizeFn( d );
				var scale = size / 20;
				return "scale(" + scale + "," + scale + ")" + (isRadial ? "rotate(" + (-d.x + 90) + ")" : "");
			} );

		var nodeExit = node.exit().transition()
			.duration( duration )
			.attr( "transform", exitingTransform )
			.remove();

		nodeExit.select( "circle" )
			.attr( "r", 1e-6 );

		nodeExit.select( "text" )
			.style( 'fill-opacity', 1e-6 );

		var links = tree.links( nodes );

		// Update the links…
		var link = self._root.selectAll( "path.link" )
			.data( links, function ( d ) {
				return d.target.id;
			} );

		// Enter any new links at the parent's previous position.
		link.enter().insert( "path", "g" )
			.attr( "class", "link" )
			.attr( "d", function () {
				var o = {x: source._x, y: source._y};
				return diagonal( {source: o, target: o} );
			} )
			//.style("stroke", colorFn )
			.style( 'stroke-width', 1e-6 )
			.transition()
			.duration( duration )
			.attr( "d", diagonal );

		// Transition links to their new position.
		var linkUpdate = link.transition()
			.duration( duration )
			.style( 'stroke-width', sizeFn )
			.attr( "d", diagonal );
		
		linkUpdate.attr( "class", function( d ) {
			var s = "link",
				cellId = d.target.col + ";" + d.target.row;
			if( self._isPathSelectActive && (cellId in self._selectedCells || self._pathSelected[cellId]) ) {
				s += " semi-selected";
			}
			return s;
		} );
		
		// Transition exiting nodes to the parent's new position.
		link.exit().transition()
			.duration( duration )
			.attr( "d", function () {
				var o = {x: source.x, y: source.y};
				return diagonal( {source: o, target: o} );
			} )
			.remove();

		nodes.forEach( function ( n ) {
			n._x = n.x;
			n._y = n.y;
		} );
	}

	function _updateSize () {
		var w = this.$element.width(),
			h = this.$element.height();

		this._w = w;
		this._h = h;
		this._width = h; // width to height due to projection
		this._height = w;

		this._radius = Math.min( w, h ) / 2;

		var minPointSize = Math.max( 1, this._radius / 100 );
		var maxPointSize = Math.min( 40, Math.max( this._radius / 20, 2 ) );

		this._pointSize = {min: minPointSize, max: maxPointSize};
		this._sizing = d3.scale.linear().domain( [this._minMax.min, this._minMax.max] ).rangeRound( [minPointSize, maxPointSize] ).clamp( true );

		this._padding = {
			left: 0,//maxPointSize,//Math.min( w * 0.2, this._layout.qHyperCube.qDimensionInfo[0].qApprMaxGlyphCount * 12 ),
			right: 0//maxPointSize//Math.min( w * 0.2, this._layout.qHyperCube.qDimensionInfo.slice( -1 )[0].qApprMaxGlyphCount * 12 )
		};

		//var levelSpacing = layout.radial ? this._radius / maxLevel : this._height / maxLevel;
	}

	/*
	var DendrogramController = Controller.extend( "DendogramController", {
		init: function( scope, element, timeout, selectionService ) {
			this.$scope = scope;
			this.$element = element;
			this.$timeout = timeout;

			this._super.apply( this, arguments );
		}
		//onPaint: function() {
		//	this.paint( this.$element, this.$scope.layout );
		//},
		//onResize: function() {
		//	this.resize();
		//},
		
	});
	*/

	var DendrogramView = DefaultView.extend( {
		init: function () {
			this._super.apply( this, arguments );

			d3.select( this.$element[0] ).append( "svg" )
				.attr( {
					xmlns: "http://www.w3.org/2000/svg",
					xlink: "http://www.w3.org/1999/xlink"
				} ).style( 'display', 'none' );
			
			
			var svg = d3.select( this.$element[0] ).append( "svg" )
				.attr( {
					xmlns: "http://www.w3.org/2000/svg",
					xlink: "http://www.w3.org/1999/xlink"
				} );

			this.$element.find( "svg" ).eq(0 ).html( defs );

			svg.append( "style" ).text( embedStyle );

			this._rotation = 0;
			
			this._svg = svg;
			this._root = svg.append( "g" )
				.attr( "class", "root" );

			$timeout = qvangular.getService( "$timeout" );

		},
		resize: function () {
			_updateSize.call( this );

			var w = this._w;
			var h = this._h;

			var svg = this._svg;

			_update.call( this, this._data );

			var rootTransform = this._isRadial ? "translate(" + w / 2 + "," + h / 2 + ")" :
			"translate(" + this._padding.left + ", 0)";

			svg.attr( "width", w )
				.attr( "height", h )
				.select( ".root" )
				.transition()
				.duration( duration )
				.attr( "transform", rootTransform );
		},
		on: function () {
			this._super();

			this.$element.on( "mousewheel DOMMouseScroll", function ( e ) {
				e = e.originalEvent;
				e.preventDefault();
				var direction = (e.detail < 0 || e.wheelDelta > 0) ? 1 : -1;
				this._rotation += 10 * direction;
				clearTimeout( this._rotationTimer );
				this._rotationTimer = setTimeout( function () {
					_update.call( this, this._data );
				}.bind( this ), 30 )

			}.bind( this ) );
			
			var self = this,
				dataPoint;

			$( document ).on( "keyup" + namespace, function ( e ) {
				if ( !self.backendApi.inSelections() ) {
					return;
				}
				if ( e.which === 27 ) {
					self.$scope.selectionsApi.cancel();
				}
				else if ( e.which === 13 ) {
					self.$scope.selectionsApi.confirm();
				}
			} );
			

			function onTap( e, d ) {
				if ( !self.mySelections.active && e && e.shiftKey ) {
					toggle.call( self, d );
					return;
				}

				if ( !self.selectionsEnabled ) {
					return;
				}

				selections.select.call( self, d );
				_update.call( self, d );
			}

			Touche( this.$element[0] ).swipe( {
				id: namespace,
				options: {
					touches: 1,
					threshold: 10
				},
				start: function ( e, data ) {
					if ( self.mySelections.active || self._layout.qHyperCube.qAlwaysFullyExpanded ) {
						return;
					}
					dataPoint = d3.select( data.relatedTarget ).data();
				},
				update: function () {
					Touche.preventGestures( this.gestureHandler );
				},
				end: function ( e, data ) {
					var dir = data.swipe.direction,
						angle,
						d;

					if ( !dataPoint || !dataPoint[0] ) {
						return;
					}
					Touche.preventGestures( this.gestureHandler );
					var d = dataPoint[0];

					if ( !self._isRadial ) {
						if ( dir === 'left' && d.canExpand || dir === 'right' && d.canCollapse ) {
							toggle.call( self, d );
						}
					}
					else {
						angle = Math.abs( data.swipe.angle - ( d.x + 90 ) % 360 );
						if ( d.canExpand && angle < 30 || d.canCollapse && Math.abs( angle - 180 ) < 30 ) {
							toggle.call( self, d );
						}
					}
				}
			} )
				.tap( {
					id: namespace,
					end: function ( e, data ) {
						var s = data.relatedTarget && data.relatedTarget.parentElement ? data.relatedTarget.parentElement.className : '';
						s = s.baseVal || s;
						if ( s.match(/node-selectable/) ) {
							onTap( e, d3.select(data.relatedTarget ).data()[0] )
						}
					}
				} );
		},
		off: function () {
			clearTimeout( this._rotationTimer );
			this._super();
			this.$element.off( "mousewheel DOMMouseScroll" );
			$( document ).off( "keyup" + namespace );
			Touche( this.$element[0] ).off( "*", namespace );
		},
		paint: function ( $element, layout ) {

			if ( !this.mySelections ) {
				this.mySelections = {
					active: false
				};
			}

			this.mySelections.active = false;
			this.mySelections.col = -1;

			var data = dataProcessor.process( layout ),
				w, h;

			this._levels = data.levels;
			this._maxLevelNodes = Math.max.apply( null, this._levels );
			this._isRadial = this._maxLevelNodes < 10 ? false : layout.radial;
			data = data.data;
			this._data = data;
			this._layout = layout;
			this._minMax = getMinMax( data, 'size' );

			_updateSize.call( this );

			w = this._w;
			h = this._h;

			data._x = h / 2;
			data._y = 0;

			var root = this._root;
			root.attr( "class", 'root' );
			
			
			_update.call( this, this._toggledNode || this._data );
			this._toggledNode = null;

			var rootTransform = this._isRadial ? "translate(" + w / 2 + "," + h / 2 + ")" :
			"translate(" + this._padding.left + ", 0)";

			var svg = this._svg;
			svg.attr( "width", w )
				.attr( "height", h )
				.select( ".root" )
				.transition()
				.duration( duration )
				.attr( "transform", rootTransform );
		},
		togglePathSelect: function() {
			this._isPathSelectActive = !this._isPathSelectActive;
			if ( this.mySelections.active ) {
				selections.switchSelectionModel.call( this, this._isPathSelectActive );
				//selections.select.call( this );
			}
			_update.call( this, this._data );
		},
		isPathSelectionActive: function() {
			return this._isPathSelectActive;
		},
		isPathSelectionDisabled: function() {
			return this._layout && this._layout.qHyperCube.qDimensionInfo.length < 2;
		},
		getSelectionToolbar: function () {
			var view = this;
			return new DefaultSelectionToolbar( this.$scope.backendApi, this.$scope.selectionsApi, false, false, [{
				  name: "",
				  isIcon: true,
				  buttonClass: "sel-toolbar-icon-toggle",
				  iconClass: "icon-toolbar-follow",
				  action: function () {
					  view.togglePathSelect();
				  },
				  isActive: function () {
					  var active = view.isPathSelectionActive();
					  this.name = active ? "mek.turnOffPathSelect" : "mek.turnOnPathSelect";
					  return active;
				  },
				  isDisabled: function () {
					  if ( view.isPathSelectionDisabled() ) {
						  return true;
					  }
					  return false;
				  }
				}], [] );
		},
		selectValues: function ( cells, clearOld ) {
			
			selections.selectValues( this, cells, clearOld );
			/*
			if ( !this.selectionsEnabled ) {
				return;
			}
			if ( !this.backendApi.inSelections() ) {
				var $scope = this.$scope, self = this;
				//map functions for toolbar
				$scope.selectionsApi.confirm = function () {
					clearSelections.call( self, true );
					$scope.backendApi.endSelections( true ).then( function () {
						$scope.selectionsApi.deactivated();
					} );
				};
				$scope.selectionsApi.cancel = function () {
					clearSelections.call( self, false );
					$scope.backendApi.endSelections( false );
					$scope.selectionsApi.deactivated();
				};
				$scope.selectionsApi.deactivate = function () {
					clearSelections.call( self, true );
					this.deactivated();
				};
				$scope.selectionsApi.clear = function () {
					clearSelections.call( self, false );
					$scope.backendApi.clearSelections();
					$scope.selectionsApi.selectionsMade = false;
					self.resize();
				};

				//start selection mode
				this.backendApi.beginSelections();
				$scope.selectionsApi.activated();
				$scope.selectionsApi.selectionsMade = true;
			}

			if ( !qValues.length ) {
				this.backendApi.clearSelections();
			}
			else {
				this.backendApi.select( qValues, [qDimNo], 'L' );
			}
			*/
		}
	} );
	
	if( !components.hasComponent( "pivot-sorting" ) ) {
		components.addComponent( "pivot-sorting", pivotSorting );
	}

	return {
		definition: properties,
		initialProperties: {
			version: 1.0,
			qHyperCubeDef: {
				qMode: "P",
				qIndentMode: true,
				qSuppressMissing: true,
				qShowTotalsAbove: true,
				qDimensions: [],
				qMeasures: [],
				qInitialDataFetch: [{
					qWidth: 10,
					qHeight: 1000
				}]
			}
		},
		data: {
			dimensions: {
				min: 1,
				nax: 10
			},
			measures: {
				min: 1,
				max: 1
			}
		},
		View: DendrogramView,
		BackendApi: PivotApi,
		importProperties: function ( exportedFmt, initialProperties, definition ) {
			var propTree = objectConversion.hypercube.importProperties( exportedFmt, initialProperties, definition ),
				props = propTree.qProperty;

			props.qHyperCubeDef.qShowTotalsAbove = true;
			props.qHyperCubeDef.qNoOfLeftDims = -1;
			return propTree;
		}
	};
} );