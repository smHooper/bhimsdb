'use strict';

var MAP_DATA;
var MODAL_MAP;
var FIELD_INFO = {};
var LOOKUP_TABLES = {};

function configureReviewCard() {
	const ratingColumns = ['probable_cause_code', 'management_classification_code'];
	const sql = `
		SELECT 
			status, 
			count(*) 
		FROM 
			(
				WITH n_null AS (
					SELECT num_nulls(${ratingColumns.join(', ')}) 
					FROM assessment 
					INNER JOIN encounters ON assessment.encounter_id=encounters.id 
					WHERE 
						probable_cause_code IS NULL OR 
						management_classification_code IS NULL 
					ORDER BY start_date
			) 
			SELECT 
				CASE 
					WHEN n_null.num_nulls = ${ratingColumns.length} THEN 'full' 
					ELSE 'partial' 
				END AS status 
			FROM n_null
		) t 
		GROUP BY status;
	`;

	queryDB(sql, 'bhims')
		.done((queryResultString) => {
        	let resultString = queryResultString.trim();
        	if (resultString.startsWith('ERROR') || resultString === "false" || resultString === "php query failed") {
        		alert('Unable to query encounters locations: ' + resultString);
        		return false; // Save was unsuccessful
        	} else {
        		let queryResult = $.parseJSON(resultString);
        		let needsFullReview, needsPartialReview;
        		for (let row of queryResult) {
        			if (row.status == 'full') {
        				needsFullReview = parseInt(row.count);
        			} else {
        				needsPartialReview = parseInt(row.count);
        			}
        		}
        		const total = needsFullReview + needsPartialReview;
        		$('#needs-partial-review-bar').css('width', `${(needsPartialReview / total) * 100}%`);
				$('#needs-full-review-bar').css('width', `${(needsFullReview / total) * 100}%`);
				$('#n-needs-review').text(total);
				$('#needs-partial-review-text > h3').text(needsPartialReview);
				$('#needs-full-review-text > h3').text(needsFullReview);

				runCountUpAnimations();
        	}
        })
        .fail((xhr, status, error) => {
        	console.log(error)
        });
}


function geojsonPointAsCircle(feature, latlng) {
	/*
	Called on each point to set style and add a popup
	*/

	const age = feature.properties['Age of report'];
	const color = 
		age < 40 ? '#d1443e' :
		age < 60 ? '#dc663e' :
		age < 80 ? '#e7893c' :
		'#f2ab3b';

	var markerOptions = {
		radius: 8,
		weight: 1,
		opacity: 1,
		fillOpacity: 0.8,
		fillColor: color,
		color: color
	}

	// Create a <p> element for each non-null property
	var popupContent = '';
	for (let key in feature.properties) {
		const fieldInfo = FIELD_INFO[key] || '';
		var value = '';
		if (fieldInfo.html_input_type === 'select') {
			const lookupTableName = fieldInfo.lookup_table || fieldInfo.field_name + 's';
			value = (LOOKUP_TABLES[lookupTableName] || '')[feature.properties[key]] ||  '';
		} else if (key === 'Age of report'){
			value = feature.properties[key]
			value += value == 1 ? ' day' : ' days';
		} else {
			value = feature.properties[key];
		}
		const displayName = fieldInfo ? fieldInfo.display_name : key;
		if (value !== null) 
			popupContent += `<p class="leaflet-field-item"><strong>${displayName}:</strong> ${value}</p>`;
	}

	const queryURL = `query.html?{"encounters": {"id": {"value": ${feature.id}, "operator": "="}}}`
	var popup = L.popup({
		autoPan: true,
	}).setContent(`
		<div class="leaflet-popup-data-container">
			${popupContent}
		</div>
		<a href="${encodeURI(queryURL)}" target="_blank">View record</a>
	`);
	
	return L.circleMarker(latlng, markerOptions)
		.bindPopup(popup);
}


function configureMap(divID, modalDivID=null) {

	var mapCenter, mapZoom;
	const pageName = window.location.pathname.split('/').pop();
	var currentStorage = window.localStorage[pageName] ? JSON.parse(window.localStorage[pageName]) : {};
	if (currentStorage.encounterMapInfo) {
		mapCenter = currentStorage.encounterMapInfo.center;
		mapZoom = currentStorage.encounterMapInfo.zoom;
	}

	var map = L.map(divID, {
		editable: true,
		scrollWheelZoom: false,
		center: mapCenter || [63.5, -150],
		zoom: mapZoom || 9
	});

	var modalMap;
	if (modalDivID) {
		MODAL_MAP = L.map(modalDivID, {
			editable: true,
			scrollWheelZoom: true,
			center: mapCenter || [63.5, -150],
			zoom: mapZoom || 9
		});
	}

	const fieldInfoSQL = `
		SELECT 
			fields.* 
		FROM data_entry_fields fields 
			JOIN data_entry_field_containers containers 
			ON fields.field_container_id=containers.id 
		WHERE 
			fields.is_enabled 
		ORDER BY 
			containers.display_order,
			fields.display_order
		;
	`;

	const fieldInfoDeferred = queryDB(fieldInfoSQL).done(
		queryResultString => {
			const queryResult = $.parseJSON(queryResultString);
			if (queryResult) {
				for (const row of queryResult) {
					const columnName = row.field_name;
					FIELD_INFO[columnName] = {};
					for (const property in row) {
						FIELD_INFO[columnName][property] = row[property];
					}
					const lookupTableName = row.lookup_table || row.field_name + 's';
					if (row.html_input_type === 'select' && !(lookupTableName in LOOKUP_TABLES)) {
						queryDB(`SELECT code, name FROM ${lookupTableName}`).done(
							resultString => {
								if (!queryReturnedError(resultString)) { 
									const result = $.parseJSON(resultString);
									LOOKUP_TABLES[lookupTableName] = {};
									for (const row of result) {
										LOOKUP_TABLES[lookupTableName][row.code] = row.name; 
									}
								}
							}
						)
					}
				};
			}
		}
	).fail(
		(xhr, status, error) => {
		showModal(`An unexpected error occurred while connecting to the database: ${error} from query:\n${sql}.\n\nTry reloading the page.`, 'Unexpected error')
	});

	var tileLayer = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}', {
		attribution: `Tiles &copy; Esri &mdash; Source: <a href="http://goto.arcgisonline.com/maps/USA_Topo_Maps" target="_blank">Esri</a>, ${new Date().getFullYear()}`
	}).addTo(map);
	if (modalDivID) {
		L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}', {
			attribution: `Tiles &copy; Esri &mdash; Source: <a href="http://goto.arcgisonline.com/maps/USA_Topo_Maps" target="_blank">Esri</a>, ${new Date().getFullYear()}`
		}).addTo(MODAL_MAP);
	}

	const sql = `
		SELECT 
			round(CURRENT_DATE - encounters.start_date)::integer AS "Age of report",
			encounter_locations.latitude,
			encounter_locations.longitude,
			encounters.*
		FROM
			encounters
		INNER JOIN
			encounter_locations 
		ON encounters.id=encounter_locations.encounter_id
		WHERE 
			extract(year FROM encounters.start_date)=(extract(year FROM CURRENT_DATE)) AND
			latitude IS NOT NULL AND longitude IS NOT NULL
	`;
	fieldInfoDeferred.done(() => {
		queryDB(sql, 'bhims')
			.done((queryResultString) => {
	        	let resultString = queryResultString.trim();
	        	if (resultString.startsWith('ERROR') || resultString === "false" || resultString === "php query failed") {
	        		alert('Unable to query encounters locations: ' + resultString);
	        		return false; // Save was unsuccessful
	        	} else {
	        		let queryResult = $.parseJSON(resultString);
	        		let features = [];
	        		for (let row of queryResult) {
	        			
	        			let properties = {};
	        			for (let fieldName in row) {
	        				if (fieldName !== 'latitude' && fieldName !== 'longitude') {
	        					properties[fieldName] = row[fieldName];
	        				}
	        			}

	        			features.push({
	        				id: row.id,
	        				type: 'Feature',
	        				properties: properties,
	        				geometry: {
		        				type: 'Point',
		                        coordinates: [
		                            parseFloat(row.longitude),
		                            parseFloat(row.latitude)
		                        ]
		        			}
	        			});
	        		}

	        		const markerOptions = {
					    radius: 8,
					    fillColor: "#ff7800",
					    color: "#000",
					    weight: 1,
					    opacity: 1,
					    fillOpacity: 0.8
					};
	        		var geojsonLayer = L.geoJSON(features, {
	        			pointToLayer: geojsonPointAsCircle
	        		}).addTo(map);
	        		if (modalDivID) {
	        			var geojsonLayer = L.geoJSON(features, {
	        				pointToLayer: geojsonPointAsCircle
	        			}).addTo(MODAL_MAP);
	        		}
	        		MAP_DATA = geojsonLayer;
	        	}
	        })
	        .fail((xhr, status, error) => {
	        	console.log(error)
	        })
    	});
}


function onExpandMapButtonClick(e) {

	e.preventDefault();

	$('#map-modal')
		.on('shown.bs.modal', e => {
			// When the modal is shown, the map's size is not yet determined so 
			//	Leaflet thinks it's much smaller than it is. As a result, 
			//	only a single tile is shown. Reset the size after a delay to prevent this
			MODAL_MAP.invalidateSize()
			
			// Center the map on the marker
			MODAL_MAP.fitBounds(MAP_DATA.getBounds()) ///*** this doesn't quite work
		})
		/*.on('hidden.bs.modal', e => {
			// Remove the marker when the modal is hidden
			_this.MODAL_MAP.removeLayer(modalMarker);

			//center form map on the marker. Do this here because it's less jarring 
			//	for the user to see the map move to center when the modal is closed
			_this.encounterMap.setView(_this.encounterMarker.getLatLng(), _this.encounterMap.getZoom())
		})*/
		.modal() // Show the modal
}

// The animation function, which takes an Element
function animateCountUp(el, nFrames, frameDuration, easeFunction=(t) => t, maxVal=null) {
	let frame = 0;
	const countTo = maxVal || parseInt(el.innerHTML, 10);
	// Start the animation running 60 times per second
	const counter = setInterval( () => {
		frame++;
		// Calculate our progress as a value between 0 and 1
		// Pass that value to our easing function to get our
		// progress on a curve
		const progress = easeFunction(frame / nFrames);
		// Use the progress value to calculate the current count
		const currentCount = Math.round(countTo * progress);

		// If the current count has changed, update the element
		if (parseInt(el.innerHTML, 10) !== currentCount) {
			el.innerHTML = currentCount;
		}

		// If we’ve reached our last frame, stop the animation
		if (frame === nFrames) {
			clearInterval(counter);
		}
	}, frameDuration );
}

// Run the animation on all elements with a class of ‘countup’
function runCountUpAnimations(animationDuration=500, framesPerSecond=60, easeFunction=(t) => t * ( 2 - t )) {
	/*
	From: https://jshakespeare.com/simple-count-up-number-animation-javascript-react/
	animationDuration: How long you want the animation to take, in ms
	framesPerSecond: number of times the number will change per second
	easeFunction: 
	*/

	// Calculate how long each ‘frame’ should last if we want to update the animation 60 times per second
	const frameDuration = 1000 / framesPerSecond;
	// Use that to calculate how many frames we need to complete the animation
	const nFrames = Math.round(animationDuration / frameDuration);
	for (const el of $('.count-up')) {
		animateCountUp(el, nFrames, frameDuration);
	}
}


function getChartTooltip(chart) {
	/*
	The tooltips that appear when a bar is clicked is actually just a single
	div that gets changed and repositioned each time a different bar is clicked.
	This helper function to creates the tooltip element if it doesn't exist
	or just returns it if it already does
	*/

	const $canvasWrapper = $(chart.canvas.parentNode)
	let $tooltip = $canvasWrapper.find('.bhims-chart-tooltip');

	if (!$tooltip.length) { 
		$tooltip = $(`
			<div class='bhims-chart-tooltip transparent'>
				<a href="#" target="_blank">View data</>
				<i class="tooltip-arrow"></i>
			</div>
		`);
		$canvasWrapper.append($tooltip);
	}

	return $tooltip;
}


function externalTooltipHandler(context) {
	// Tooltip Element
	const {chart, tooltip} = context;
	const $tooltip = getChartTooltip(chart);

	// Hide if no tooltip
	if (tooltip.opacity === 0) {
		$tooltip.addClass('transparent');
		return;
	}

	const {offsetLeft: positionX, offsetTop: positionY} = chart.canvas;

	// Display, position, and set styles for font
	$tooltip.removeClass('transparent');
	$tooltip.css('left', positionX + tooltip.caretX + 'px');
	$tooltip.css('top', positionY + tooltip.caretY - $tooltip[0].scrollHeight + 'px');
	$tooltip.css('font', tooltip.options.bodyFont.string);
	$tooltip.css('padding', tooltip.options.padding + 'px ' + tooltip.options.padding + 'px');
}



function configureDailyEncounterChart() {
	const sql = `
		SELECT 
			series.encounter_date AS full_date,
			to_char(series.encounter_date, 'Mon DD') AS encounter_date, 
			coalesce(n_encounters, 0) AS n_encounters 
		FROM 
			(
				SELECT 
					generate_series(min(start_date), max(start_date), '1d')::date AS encounter_date 
				FROM encounters 
				WHERE extract(year FROM start_date) = extract(year FROM now())
			) series 
		LEFT JOIN 
			(
				SELECT 
					start_date::date AS encounter_date, 
					count(*) AS n_encounters 
				FROM encounters 
				WHERE extract(year FROM start_date) = extract(year FROM now())
				GROUP BY encounter_date
			) n 
		USING (encounter_date) 
		ORDER BY full_date;
	`;
	
	//for click event -> query string. Needs to be defined in outer scope to be available to click event handler
	var fullDates = []; 

	const onBarClick = (e, _, chart) => {
        const canvasPosition = Chart.helpers.getRelativePosition(e, chart);

        // Substitute the appropriate scale IDs
        const index = chart.scales.x.getValueForPixel(canvasPosition.x);
        
        const $tooltip = getChartTooltip(chart);
        
        // Set the href of the tooltip so the user can open. Do this here rather than in the 
        //	tooltip handler because the fullDates array is available within this scope
        $tooltip.find('a').attr('href', encodeURI(`query.html?{"encounters": {"start_date": {"value": "'${fullDates[index]}'", "operator": "="}}}`))

    }

    const onBarHover = (e, el) => {
		// show pointer cursor
		$(e.native.target).css("cursor", el[0] ? "pointer" : "default");
	}

	queryDB(sql, 'bhims')
		.done((queryResultString) => {
        	let resultString = queryResultString.trim();
        	if (resultString.startsWith('ERROR') || resultString === "false" || resultString === "php query failed") {
        		alert('Unable to query encounters per day: ' + resultString);
        		return false; // Save was unsuccessful
        	} else {
        		let queryResult = $.parseJSON(resultString);
        		var data = [];
        		var xlabels = [];
        		for (let row of queryResult) {
        			data.push(row.n_encounters);
        			xlabels.push(row.encounter_date);
        			fullDates.push(row.full_date)
        		}
        		var rectangleSet = false;
				const $canvas = $('#daily-encounters-chart');
				const $canvasWrapper = $canvas.parent();
				const canvasWidth = $canvasWrapper.width() * data.length / 14;
				$canvasWrapper.width(canvasWidth);

				var chart = new Chart($canvas, {
					type: 'bar',
					data: {
						labels: xlabels,
						datasets: [{
							data: data,
							backgroundColor: '#f3ab3a',
							borderColor: '#f3ab3a',
						}],
					},
		            maintainAspectRatio: true,
		            responsive: true,
		            options: {
		            	interaction: {
		            		mode: 'index',
		            		intersect: true
		            	},
		                tooltips: {
		                    titleFontSize: 0,
		                    titleMarginBottom: 0,
		                    bodyFontSize: 12
		                },
		                plugins: {
			                legend: {
			                    display: false
			                },
							tooltip: {
								enabled: false,
								position: 'nearest',
								external: externalTooltipHandler,
								events: ['click'] // make sure tooltip only shows when a bar is clicked
							}
			            },
		                scales: {
		                    y: {
		                        ticks: {
		                            beginAtZero: true,
		                            stepSize: 1
		                        }
		                    }
		                },
		                onClick: onBarClick,
				        onHover: onBarHover,
		                aspectRatio: canvasWidth / $canvasWrapper.height(),
		                animation: {
		                	// when the chart finishes drawing, set the scale of the independently drawn x-axis
		                    onComplete: () => {
		                        if (!rectangleSet) {
		                            var scale = window.devicePixelRatio;                       

		                            var sourceCanvas = chart.canvas;
		                            var yAxis = chart.scales.y
		                            var copyWidth = yAxis.width - 10;
		                            var copyHeight = yAxis.height + yAxis.top + 10;

		                            var targetCtx = document.getElementById("daily-encounters-axis").getContext("2d");

		                            targetCtx.scale(scale, scale);
		                            targetCtx.canvas.width = copyWidth * scale;
		                            targetCtx.canvas.height = copyHeight * scale;

		                            targetCtx.canvas.style.width = `${copyWidth}px`;
		                            targetCtx.canvas.style.height = `${copyHeight}px`;
		                            targetCtx.drawImage(sourceCanvas, 0, 0, copyWidth * scale, copyHeight * scale, 0, 0, copyWidth * scale, copyHeight * scale);

		                            var sourceCtx = sourceCanvas.getContext('2d');

		                            // Normalize coordinate system to use css pixels.
		                            sourceCtx.clearRect(0, 0, copyWidth * scale, copyHeight * scale);
		                            rectangleSet = true;
		                        }
		                    },
		                    onProgress: () => {
		                        if (rectangleSet) {
		                            var yAxis = chart.scales.y
		                            var copyWidth = yAxis.width - 10;
		                            var copyHeight = yAxis.height + yAxis.top + 10;

		                            var sourceCtx = chart.canvas.getContext('2d');
		                            sourceCtx.clearRect(0, 0, copyWidth, copyHeight);
		                        }
		                    }
		                }
		            }
				});
				// Scroll to the end (most recent)
        		const $outerWrapper = $canvas.closest('.scrollable-chart-outer-wrapper');
        		$outerWrapper.scrollLeft($outerWrapper[0].scrollWidth);
        	}
		})
		.fail((xhr, status, error) => {
			console.log(error)
		})

}


function getQueryURL(params) {

	var searchParams = new URLSearchParams(params);
	//searchParams.append("KEY", "VALUE"); // To append more data
	const url = "query.html?" + searchParams.toString();
	
	return url;
}