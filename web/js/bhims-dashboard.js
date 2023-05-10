'use strict';

var MAP_DATA,
	DASHBOARD_MAP,
	MODAL_MAP_DATA = L.geoJSON(),
	MODAL_MAP,
	FIELD_INFO = {},
	LOOKUP_TABLES = {},
	PRESENT_MODE = false,
	PRESENT_MODE_YEAR = 2022;

//add bhims-dashboard to main-content

function configureReviewCard() {
	const ratingColumns = ['probable_cause_code', 'management_classification_code'];
	
	const sql = `
		SELECT 
			status, 
			string_agg(id::text, ',') AS encounter_ids,
			count(*) 
		FROM 
			(
				WITH n_null AS (
					SELECT
						encounters.id, 
						num_nulls(${ratingColumns.join(', ')}) 
					FROM assessment 
					INNER JOIN encounters ON assessment.encounter_id=encounters.id 
					WHERE 
						${ratingColumns.map(c => {return c + ' IS NULL'}).join(' OR ')} 
					ORDER BY start_date
				) 
				SELECT 
					CASE 
						WHEN n_null.num_nulls = ${ratingColumns.length} THEN 'full' 
						ELSE 'partial' 
					END AS status,
					id
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
        			row.count = parseInt(row.count);
        			if (row.status == 'full') {
        				needsFullReview = {...row};
        			} else {
        				needsPartialReview = {...row};
        			}
        		}
        		const total = needsFullReview.count + needsPartialReview.count;
        		const partialReviewURL = `query.html?{"encounters": {"id": {"value": "(${needsPartialReview.encounter_ids})", "operator": "IN"}}}`;
        		const fullReviewURL = `query.html?{"encounters": {"id": {"value": "(${needsFullReview.encounter_ids})", "operator": "IN"}}}`;
        		$('#needs-partial-review-bar').css('width', `${(needsPartialReview.count / total) * 100}%`)
        			.closest('.review-bar-and-text-container')
        				.attr('href', encodeURI(partialReviewURL));
				$('#needs-full-review-bar').css('width', `${(needsFullReview.count / total) * 100}%`)
        			.closest('.review-bar-and-text-container')
        				.attr('href', encodeURI(fullReviewURL));
				$('#n-needs-review').text(total);
				$('#needs-partial-review-text > h3').text(needsPartialReview.count);
				$('#needs-full-review-text > h3').text(needsFullReview.count);

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
	
	return L.circleMarker(latlng)
		.bindPopup(popup);
}


/*
Helper function to handle selections in either the main or modal map
*/
function mapSelectionChanged(e) {
	// De-select any points
	MAP_DATA.resetStyle();
	MODAL_MAP_DATA.resetStyle();

	const selectedLayers = e.layers;
	const selectedIDs = [];
	// Set style of selected points
	for (const layer of selectedLayers) {
		layer.setStyle({color: '#42d6e6', fillColor: '#42d6e6'})
		const featureID = layer.feature.id;
		selectedIDs.push(featureID);

		// Set style for layer in other map
		const otherData = e.target.boxZoom._container.id === 'encounter-map' ? MODAL_MAP_DATA : MAP_DATA;
		otherData.eachLayer(otherLayer => {
			if (otherLayer.feature.id === featureID) {
				otherLayer.setStyle({color: '#42d6e6', fillColor: '#42d6e6'});
			}
		});
	};

	// Show the link to view these records, setting the URL of the <a> tag
	const selectedRecordsURL = `query.html?{"encounters": {"id": {"value": "(${selectedIDs.join(',')})", "operator": "IN"}}}`;
	$('#view-selected-records-link').toggleClass('invisible', selectedLayers.length === 0);
	$('#view-selected-records-link').attr('href', encodeURI(selectedRecordsURL));
}



function configureMap(divID, modalDivID=null) {

	var mapCenter, mapZoom;
	const pageName = window.location.pathname.split('/').pop();
	var currentStorage = window.localStorage[pageName] ? JSON.parse(window.localStorage[pageName]) : {};
	if (currentStorage.encounterMapInfo) {
		mapCenter = currentStorage.encounterMapInfo.center;
		mapZoom = currentStorage.encounterMapInfo.zoom;
	}

	DASHBOARD_MAP = L.map(divID, {
		editable: true,
		scrollWheelZoom: false,
		center: mapCenter || [63.5, -150],
		zoom: mapZoom || 9
	});
	const dashboardLassoControl = L.control.lasso().addTo(DASHBOARD_MAP);

	// Handle selection events
	DASHBOARD_MAP.on('lasso.finished', e => {
		mapSelectionChanged(e);
	});

	var modalMap, 
		modalLassoControl = {
			enable: ()=>{console.log('modal not configured')}, 
			disable: ()=>{console.log('modal not configured')}
		};
	if (modalDivID) {
		MODAL_MAP = L.map(modalDivID, {
			editable: true,
			scrollWheelZoom: true,
			center: mapCenter || [63.5, -150],
			zoom: mapZoom || 9
		});
		MODAL_MAP.on('lasso.finished', e => {
			mapSelectionChanged(e);
		});
		modalLassoControl = L.control.lasso().addTo(MODAL_MAP);
	}

	// When selection is enabled or disabled in either map, mirror the change in the inactive map
	
	DASHBOARD_MAP.on('lasso.enabled', () => {
		$('.leaflet-control-lasso').addClass('selected');
		modalLassoControl.enable();
	});	
	DASHBOARD_MAP.on('lasso.disabled', () => {
		$('.leaflet-control-lasso').removeClass('selected');
		modalLassoControl.disable();
	});
	MODAL_MAP.on('lasso.enabled', () => {
		$('.leaflet-control-lasso').addClass('selected');
		dashboardLassoControl.enable();
	});	
	MODAL_MAP.on('lasso.disabled', () => {
		$('.leaflet-control-lasso').removeClass('selected');
		dashboardLassoControl.disable();
	});

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
	}).addTo(DASHBOARD_MAP);
	if (modalDivID) {
		L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}', {
			attribution: `Tiles &copy; Esri &mdash; Source: <a href="http://goto.arcgisonline.com/maps/USA_Topo_Maps" target="_blank">Esri</a>, ${new Date().getFullYear()}`
		}).addTo(MODAL_MAP);
	}

	const sql = `
		SELECT 
			round(${PRESENT_MODE ? `'${PRESENT_MODE_YEAR}-9-24'` : 'now()'}::date - encounters.start_date)::integer AS "Age of report",
			encounter_locations.latitude,
			encounter_locations.longitude,
			encounters.*
		FROM
			encounters
		INNER JOIN
			encounter_locations 
		ON encounters.id=encounter_locations.encounter_id
		WHERE 
			extract(year FROM encounters.start_date)=(${PRESENT_MODE ? PRESENT_MODE_YEAR : 'extract(year FROM CURRENT_DATE)'}) AND
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

					const getColor = age => { 
						const color =  
							age < 7 ? '#d1443e' :
							age < 14 ? '#dc663e' :
							age < 21 ? '#e7893c' :
							'#f2ab3b';
						return color;
					}
					const styleFunc = feature => {
						const reportAge = parseInt(feature.properties['Age of report']);
						const style = {
							radius: 8,
							weight: 1,
							opacity: 1,
							fillOpacity: 0.8,
							fillColor: getColor(reportAge),
							color: getColor(reportAge)
						}
						return style;
					}
	        		var geojsonLayer = L.geoJSON(features, {
	        			style: styleFunc,
	        			pointToLayer: geojsonPointAsCircle
	        		}).addTo(DASHBOARD_MAP);
	        		DASHBOARD_MAP.fitBounds(geojsonLayer.getBounds());
	        		
	        		if (modalDivID) {
	        			MODAL_MAP_DATA = L.geoJSON(features, {
	        				pointToLayer: geojsonPointAsCircle,
	        				style: styleFunc
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
			MODAL_MAP.invalidateSize();
			
			// Center the map on the marker
			MODAL_MAP.fitBounds(MAP_DATA.getBounds());
		})
		.modal(); // Show the modal
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
	const tooltipHeight = $tooltip[0].scrollHeight;
	var top = positionY + tooltip.caretY - tooltipHeight;
	
	// Check if the tooltip's position on top of the bar will push it outside the container
	//	If so, move it down and add a class to put the caret on top
	const tooltipOutsideView = top < 0;
	if (tooltipOutsideView) top += tooltipHeight + tooltip.caretY;
	$tooltip.find('.tooltip-arrow').toggleClass('top', tooltipOutsideView);
	
	$tooltip.removeClass('transparent');
	$tooltip.css('left', positionX + tooltip.caretX + 'px');
	$tooltip.css('top', top + 'px');
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
				WHERE extract(year FROM start_date) = extract(year FROM now()) - 1
			) series 
		LEFT JOIN 
			(
				SELECT 
					start_date::date AS encounter_date, 
					count(*) AS n_encounters 
				FROM encounters 
				WHERE extract(year FROM start_date) = extract(year FROM now()) - 1 
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