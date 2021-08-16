
var BHIMSQuery = (function(){

	var Constructor = function() {
		this.queryResult = {};
		this.lookupValues = {};
		this.joinedDataTables = [];
		this.selectedID = null;
	}


	/*
	Main constructor
	*/
	Constructor.prototype.configureQuery = function() {
		// Get username
		$.ajax({
			url: 'bhims.php',
			method: 'POST',
			data: {action: 'getUser'},
			cache: false,
			success: function(usernameString){
				// If authentication failed, do nothing
				if (usernameString)  {
					username = usernameString.trim().toLowerCase();
					$('#username').text(username);
				} 
			}
		});

		

		this.configureMap('query-result-map');

		$.when(
			...this.getLookupValues(), 
			entryForm.configureForm(mainParentID='#row-details-pane', isNewEntry=false)
		).then(() => {
			if (window.location.search) {
				this.urlQueryToSQL();
				// Set value for all boolean fields that show/hide accordions
				/*for (const el of $('.accordion.collapse')) {
					this.setImplicitBooleanField($(el));
				}
				this.setReactionFieldsFromQuery();*/

				//update result map
			} else {
				// show message that tells user to run query
			}

			// Set the selectedID property whenever a new list item is selected
			$('#query-result-list > li').click(e => {
				bhimsQuery.selectedID = $(e.target).closest('li').data('encounter-id');
			})

		});
		
		//getFieldInfo();
	}


	Constructor.prototype.onShowQueryOptionsClick = function(e) {
		$(e.target).closest('.header-menu-item-group').toggleClass('hide');
	}


	Constructor.prototype.configureMap = function(divID) {

		var mapCenter, mapZoom;
		const pageName = window.location.pathname.split('/').pop();
		var currentStorage = window.localStorage[pageName] ? JSON.parse(window.localStorage[pageName]) : {};
		if (currentStorage.encounterMapInfo) {
			mapCenter = currentStorage.encounterMapInfo.center;
			mapZoom = currentStorage.encounterMapInfo.zoom;
		}

		var map = L.map(divID, {
			editable: true,
			scrollWheelZoom: true,
			center: mapCenter || [63.5, -150],
			zoom: mapZoom || 9
		});

		var tilelayer = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}', {
			attribution: `Tiles &copy; Esri &mdash; Source: <a href="http://goto.arcgisonline.com/maps/USA_Topo_Maps" target="_blank">Esri</a>, ${new Date().getFullYear()}`
		}).addTo(map);

		/*const sql = `
			SELECT 
				round(CURRENT_DATE - encounters.start_date)::integer AS report_age,
				encounter_locations.latitude,
				encounter_locations.longitude,
				encounters.*
			FROM
				encounters
			INNER JOIN
				encounter_locations 
			ON encounters.id=encounter_locations.encounter_id
			WHERE 
				extract(year FROM encounters.start_date)=(extract(year FROM CURRENT_DATE) - 2) AND
				latitude IS NOT NULL AND longitude IS NOT NULL
		`;
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
		}).addTo(map);*/

		//zoom to extent of geojsonLayer
		return map;
	}


	/* 
	Get the code/value pairs for all lookup tables 
	*/
	Constructor.prototype.getLookupValues = function() {
		
		const sql = `
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema='public' AND table_name LIKE '%_codes';
		`;
		// Since this array of deferreds will get returned before all the $.Deferreds get added, 
		//	initialize with a dummy Deferred. When the for-loop is done, this dummy Deferred can 
		//	be resolved to indicate that all have been added 
		var deferreds = [$.Deferred()];

		queryDB(sql).done(tableQueryResultString => {
			const queryResult = $.parseJSON(tableQueryResultString);
			for (const tableRow of queryResult) {
				var tableName = tableRow.table_name;
				this.lookupValues[tableName] = {};
				const d = queryDB(`SELECT * FROM ${tableName};`).done(lookupQueryResultString => {
					const lookupResult = $.parseJSON(lookupQueryResultString);
					let tName = tableRow.table_name;
					for (const lookupRow of lookupResult) {
						this.lookupValues[tName][lookupRow.code] = {...lookupRow};
					}
				}).fail((xhr, status, error) => {
					console.log(`An unexpected error occurred while connecting to the database: ${error} while getting lookup values from ${tableName}.`)
				});
				deferreds.push(d);
			}
			deferreds[0].resolve(); // trigger initial dummy Deferred 
		}).fail((xhr, status, error) => {
			showModal(`An unexpected error occurred while connecting to the database: ${error} from query:\n${sql}.\n\nTry reloading the page.`, 'Unexpected error')
		});

		return deferreds;	
	}


	/*
	Get the query result for the selected encounter and fill fields in the entry form
	*/
	Constructor.prototype.fillFieldsFromQuery = function() {
		// convert query result to FIELD_VALUES format

		var fieldValues = {}
		//const selectedID = $('#query-result-list > .selected').data('encounter-id');

		// Loop through the accordions to find all the joined data tables that have a 
		//	1-to-many relationship with the encounters table
		/*for (const el of $('.accordion')) {
			const $accordion = $(el);
			const tableName = $accordion.data('table-name');
			if (tableName in this.queryResult) {
				fieldValues[tableName] = [];
				const thisData = this.queryResult[tableName][selectedID];
				
				// If this encounter doesn't have any records for this table, skip the table
				if (!thisData) continue;
				
				for (const rowID in thisData) {
					const theseFieldValues = {};
					for (const fieldName in thisData[rowID]) {
						theseFieldValues[fieldName] = thisData[rowID][fieldName];
					}
					fieldValues[tableName].push(theseFieldValues);
				}
			}
		}*/

		/*for (const tableName of this.joinedDataTables) {//this.queryResult[selectedID]) {
			// If this is one of the accordions, skip it
			if (tableName in fieldValues) continue;

			const tableData = this.queryResult[tableName][selectedID];
			/*for (const fieldName in ) {

				if (FIELD_VALUES[fieldName]) {

				}
			}
		}*/
		entryForm.fieldValues = this.queryResult[this.selectedID];
		entryForm.fillFieldValues(entryForm.fieldValues);
	}


	/*
	Helper function to uery the database to find the primary key for each 
	table. This is really only necessary for bears and reactions, which
	both have primary keys from two columns, a order column specific 
	to the encounter and the encounter_id
	*/
	Constructor.prototype.getTableSortColumns = function() {
		const sql = `
			SELECT 
				tc.table_schema, tc.table_name, kc.column_name
			FROM information_schema.table_constraints tc
				INNER JOIN information_schema.key_column_usage kc 
				ON kc.table_name = tc.table_name AND kc.table_schema = tc.table_schema AND kc.constraint_name = tc.constraint_name
			WHERE 
				tc.constraint_type = 'PRIMARY KEY' AND
				kc.column_name <> 'encounter_id' AND 
				kc.table_name NOT LIKE '%_codes' AND
				kc.ordinal_position is not null
			ORDER BY 
				tc.table_schema,
				tc.table_name,
				kc.position_in_unique_constraint
			;
		`;
		return queryDB(sql);
	}

	/* Query all data tables */
	Constructor.prototype.runDataQuery = function(whereClause, tableSortColumns) {

		var deferreds = [$.Deferred()];
		// Get encounters table
		deferreds.push(
			queryDB(`SELECT * FROM encounters WHERE ${whereClause}`)
				.done(queryResultString => {
					if (queryReturnedError(queryResultString)) { 
						console.log(`error configuring main form: ${queryResultString}`);
					} else {
						var liElements = [];
						const result = $.parseJSON(queryResultString);
						//this.queryResult.encounters = {};
						// For each encounter, create an object that mirrors the FIELD_VALUES object of bhims-entry.js
						for (const encounter of result) {
							
							this.queryResult[encounter.id] = {...encounter};
							//this.queryResult.encounters[encounter.id] = {...encounter};

							// Configure the list item element for this encounter
							const bearGroupType = encounter.bear_cohort_code ? this.lookupValues.bear_cohort_codes[encounter.bear_cohort_code].name : 'unknown'
							liElements.push(
								$(`
									<li data-encounter-id="${encounter.id}">
										<strong>Form number:</strong> ${encounter.park_form_id}, <strong>Bear group type:</strong> ${bearGroupType}
									</li>
								`).appendTo('#query-result-list')
							);
						}

						// Make the first one selected
						const $firstEl = liElements[0];
						if ($firstEl) {
							$firstEl.addClass('selected');
							this.selectedID = $firstEl.data('encounter-id');
						}
					}
				}
			)
		);

		// Get all table names from accordions
		const oneToManyTables = $('.accordion').map((_, el) => {return $(el).data('table-name')}).get();
		
		for (const tableName of this.joinedDataTables) {
			const sql = `SELECT ${tableName}.* FROM ${tableName} INNER JOIN encounters ON encounters.id=${tableName}.encounter_id WHERE ${whereClause} ORDER BY ${tableName}.${tableSortColumns[tableName]}`;
			const deferred = queryDB(sql);
			deferred.done( queryResultString => {
				if (queryReturnedError(queryResultString)) { 
						console.log(`error querying ${tableName}: ${queryResultString}`);
				} else { 
					const result = $.parseJSON(queryResultString);
					//this.queryResult[tableName] = {};
					for (const row of result) {
						const encounterID = row.encounter_id;
						if (oneToManyTables.includes(tableName)) {
							if (!this.queryResult[encounterID][tableName]) this.queryResult[encounterID][tableName] = [];
							this.queryResult[encounterID][tableName].push({...row});
						} else {
							this.queryResult[encounterID] = {...this.queryResult[encounterID], ...row};
						}
						//if (!this.queryResult[tableName][encounterID]) this.queryResult[tableName][encounterID] = {};
						
					}
				}
				
			}).fail((xhr, status, error) => {
				console.log(`An unexpected error occurred while connecting to the database: ${error} while getting data values from ${tableName}.`)
			});
			deferreds.push(deferred);
		}

		deferreds[0].resolve();
		$.when(...deferreds).then(() =>  {
			this.getReactionByFromReactionCodes().then(() => {
				this.fillFieldsFromQuery();
			});
		});

		return deferreds;

	}


	/* 
	Parse a URL query into an SQL query and process the result 
	*/
	Constructor.prototype.urlQueryToSQL = function() {

		//const urlParams = processURLQueryString();
		var whereClause = decodeURIComponent(window.location.search.slice(1));

		// Query each right-side table separately
		const tablesSQL = `
			SELECT 
				DISTINCT table_name 
			FROM information_schema.columns 
			WHERE table_schema='public' AND column_name='encounter_id'
		;`;
		queryDB(tablesSQL).done( tableQueryResultString => {
			const rightSideTables = $.parseJSON(tableQueryResultString);
			for (const row of rightSideTables) {
				const tableName = row.table_name;
				this.joinedDataTables.push(tableName);
			}
			this.getTableSortColumns().then(queryResultString => {
				if (queryReturnedError(queryResultString)) { 
					console.log(`error configuring main form: ${queryResultString}`);
				} else {
					const result = $.parseJSON(queryResultString);
					var tableSortColumns = {};
					for (row of result) {
						tableSortColumns[row.table_name] = row.column_name;
					}
					$.when(
						this.runDataQuery(whereClause, tableSortColumns)
					).then( () => {
						// Set value for all boolean fields that show/hide accordions
						for (const el of $('.accordion.collapse')) {
							this.setImplicitBooleanField($(el));
						}
						//this.setReactionFieldsFromQuery();
					});
				}
			});
			
			
		});
		
	}

	/*
	Helper function to set appropriate values for all fields that show/hide accordion collapses
	*/
	Constructor.prototype.setImplicitBooleanField = function($accordion) {
		
		const $targetField = $($accordion.data('dependent-target'));
		if ($targetField.data('lookup-table') === 'boolean_response_codes') {
			$targetField.val($accordion.find('.card:not(.cloneable)').length ? 1 : 0).change();
		}
	}


	Constructor.prototype.getReactionByFromReactionCodes = function() {
		
		var deferred = $.Deferred();
		queryDB(
			`SELECT * FROM reaction_codes;`
		).then(queryResultString => {
			if (queryReturnedError(queryResultString)) {
				console.log('Could not getReactionByFromReactionCodes because ' + queryResultString);
				deferred.resolve();
			} else {
				var reactionCodesTable = {};
				for (const row of $.parseJSON(queryResultString)) {
					reactionCodesTable[row.code] = {...row};
				}
				const reactionRows = this.queryResult[this.selectedID].reactions;
				if (reactionRows.length) {
					for (const i in reactionRows) {
						// Get reaction code
						const reaction = reactionRows[i];

						// Determine reaction_by and fill value
						reactionRows[i].reaction_by = reactionCodesTable[reaction.reaction_code].action_by;

						/*const $reactionBySelect = $(`#input-reaction_by-${i}`).val(reactionByCode);//.change();
						
						// Rather than call the .change() event handler, manually remove default/error classes
						//	and the default blank option because .change() will also trigger .updateReactionSelect()
						//	and the val has to be set AFTER that function has run. The .change() event won't return
						//	the deferred object, so doing all this manually is the only way to expose it
						$reactionBySelect.removeClass('default error');
						// the user selected an actual option so remove the empty default option
						for (const el of $reactionBySelect.find('option')) {//.each(function(){
							const $option = $(el);
							if ($option.val() == '') {
								$option.remove();
							}
						}
						// Fill reaction selects and set value
						entryForm.updateReactionsSelect($reactionBySelect).then(() => {
							$(`#input-reaction-${i}`).val(reaction.reaction_code).change();
						})*/
					}
					deferred.resolve();
				} else {	
					deferred.resolve();
				}
			}	
		})

		return deferred;

	}


	Constructor.prototype.setDescribeLocationByField = function() {
		const queryData = this.queryResult[this.selectedID];
		var $locationTypeField = $('#input-location_type');
		if (queryData.place_name_code) {
			$locationTypeField.val('Place name');
		} else if (queryData.backountry_unit_code) {
			$locationTypeField.val('Backcountry unit');
		} else if (queryData.road_mile) {
			$locationTypeField.val('Road mile');
		} else {
			$locationTypeField.val('GPS coordinates');
		}
		$locationTypeField.change();
	}

	/***end of BHIMSQuery module***/
	return Constructor;
})();


function processURLQueryString() {

	const urlSearchParams = new URLSearchParams(window.location.search);
	const params = Object.fromEntries(urlSearchParams.entries());

	return params;
}

function configureForm() {
	var config = {},
		pages = {},
		sections = {},
		accordions = {},
		fieldContainers = {},
		fields = {};

	const processQueryResult = (obj, result) => {
		const queryResult = $.parseJSON(result);
		if (queryResult) {
			for (const row of queryResult) {
				obj[row.id] = {...row};
			};
		} 
	}
	// Query configuration tables from database
	$.when(
		queryDB('SELECT * FROM data_entry_config;')
			.done(result => {
				const queryResult = $.parseJSON(result);
				if (queryResult) {
					config = {...queryResult[0]};
				}
			}),
		queryDB('SELECT * FROM data_entry_pages ORDER BY page_index;')
			.done(result => {processQueryResult(pages, result)}),
		queryDB('SELECT * FROM data_entry_sections WHERE is_enabled AND page_id IS NOT NULL ORDER BY display_order;')
			.done(result => {processQueryResult(sections, result)}),
		queryDB('SELECT * FROM data_entry_accordions WHERE is_enabled AND section_id IS NOT NULL ORDER BY display_order;')
			.done(result => {processQueryResult(accordions, result)}),
		queryDB('SELECT * FROM data_entry_field_containers WHERE is_enabled AND (section_id IS NOT NULL OR accordion_id IS NOT NULL) ORDER BY display_order;')
			.done(result => {processQueryResult(fieldContainers, result)}),
		queryDB('SELECT * FROM data_entry_fields WHERE is_enabled AND field_container_id IS NOT NULL ORDER BY display_order;')
			.done(result => {processQueryResult(fields, result)})
	).then(() => {
		// Add sections
		if (Object.keys(sections).length) {
			for (const id in sections) {
				const sectionInfo = sections[id];
				const pageInfo = pages[sectionInfo.page_id];
				const titleHTMLTag = sectionInfo.title_html_tag;
				$(`
					<section id="section-${id}" class="${sectionInfo.css_class} ${sectionInfo.is_enabled ? '' : 'disabled'}" >
						<${titleHTMLTag} class="${sectionInfo.title_css_class}">
							${titleHTMLTag == 'div' ? `<h4>${sectionInfo.section_title}</h4>` : sectionInfo.section_title}
						</${titleHTMLTag}>
						<div class="form-section-content"></div>
					</section>
				`).appendTo('#row-details-pane');
			}
		} else {
			alert('Error retrieving data_entry_sections');
			return;
		}

		// Accumulate accordions and field containers since these are the direct descendants of sections
		//	Store them with the display order as the key so that these can be sorted and sequentially
		//	iterated later.
		var sectionChildren = {};

		// Accordions
		if (Object.keys(accordions).length) {
			for (const id in accordions) {
				const accordionInfo = accordions[id];
				const sectionInfo = sections[accordionInfo.section_id];
				const accordionHTMLID = accordionInfo.html_id;
				const tableName = accordionInfo.table_name;
				
				var accordionAttributes = `id="${accordionHTMLID}" class="${accordionInfo.css_class} ${accordionInfo.is_enabled ? '' : 'disabled'}" data-table-name="${tableName}"`;
				var dependentAttributes = '';
				if (accordionInfo.dependent_target) 
					dependentAttributes = `data-dependent-target="${accordionInfo.dependent_target}" data-dependent-value="${accordionInfo.dependent_value}"`;
					accordionAttributes += dependentAttributes;

				var cardLinkAttributes = `class="${accordionInfo.card_link_label_css_class}"`;
				if (accordionInfo.card_link_label_order_column) 
					cardLinkAttributes += ` data-order-column="${accordionInfo.card_link_label_order_column}"`;
				if (accordionInfo.card_link_label_separator) 
					cardLinkAttributes += ` data-label-sep="${accordionInfo.card_link_label_separator}"`;				
				
				const $accordion = $(`
					<div ${accordionAttributes}>
						<div class="card cloneable hidden" id="cloneable-card-${tableName}">
							<div class="card-header" id="cardHeader-${tableName}-cloneable">
								<a class="card-link" data-toggle="collapse" href="#collapse-${tableName}-cloneable" data-target="collapse-${tableName}-cloneable">
									<div class="card-link-content">
										<h5 ${cardLinkAttributes}">${accordionInfo.card_link_label_text}</h5>
									</div>
									<div class="card-link-content">
										<button class="delete-button icon-button" type="button" onclick="onDeleteCardClick(event)" data-item-name="${accordionInfo.item_name}" aria-label="Delete ${accordionInfo.item_name}">
											<i class="fas fa-trash fa-lg"></i>
										</button>
										<i class="fa fa-chevron-down pull-right"></i>
									</div>
								</a>
							</div>
							<div id="collapse-${tableName}-cloneable" class="collapse show card-collapse" aria-labelledby="cardHeader-${tableName}-cloneable" data-parent="#${accordionHTMLID}">
								<div class="card-body"></div>
							</div>
						</div>
					</div>
					<div class="${dependentAttributes.length ? 'collapse' : ''} add-item-container">
						<button class="generic-button add-item-button" type="button" onclick="onAddNewItemClick(event)" data-target="${accordionHTMLID}" ${dependentAttributes}>
							<strong>+</strong> ${accordionInfo.add_button_label}
						</button>
					</div>
				`);
				sectionChildren[accordionInfo.display_order] = {
					element: $accordion, 
					parentID: `#section-${accordionInfo.section_id} .form-section-content`
				};
			}
		} else {
			alert('Error retrieving data_entry_accordions');
			return;
		}

		// Field containers
		if (Object.keys(fieldContainers).length) {
			for (const id in fieldContainers) {
				const containerInfo = fieldContainers[id];
				if (containerInfo.is_enabled) {
					const accordionInfo = accordions[containerInfo.accordion_id];
					const $container = $(`
						<div id="field-container-${id}" class="${containerInfo.css_class}${containerInfo.is_enabled ? '' : ' disabled'}"></div>
					`);
					sectionChildren[containerInfo.display_order] = {
						element: $container,
						parentID: accordionInfo ? `#${accordionInfo.html_id} .card-body` : `#section-${containerInfo.section_id} .form-section-content`
					};
				}
			}
		} else {
			alert('Error retrieving data_entry_field_containers');
			return;
		}

		// Loop through sequentially and add them to their respective parents.
		//	
		for (displayOrder of Object.keys(sectionChildren).sort()) {
			const child = sectionChildren[displayOrder];
			// If the parent exists in the DOM, add the child element. It might not exist 
			//	in the DOM if the parent is disabled
			if ($(child.parentID).length) child.element.appendTo($(child.parentID));
		}

		// Add fields
		if (Object.keys(fields).length) {
			// Gather and sort field info within their containers
			var sortedFields = {};
			for (const id in fields) {
				const fieldInfo = {...fields[id]};
				const fieldContainerID = fieldInfo.field_container_id;
				if (fieldContainerID in sortedFields) {
					sortedFields[fieldContainerID][fieldInfo.display_order] = fieldInfo;
				} else {
					sortedFields[fieldContainerID] = [];
					sortedFields[fieldContainerID][fieldInfo.display_order] = fieldInfo;
				}
			}

			for (const fieldContainerID in sortedFields) {
				const $parent = $('#field-container-' + fieldContainerID);
				if ($parent.length) {
					const childFields = sortedFields[fieldContainerID];
					for (const displayOrder in childFields) {
						const fieldInfo = childFields[displayOrder];

						var inputFieldAttributes = `id="${fieldInfo.html_id}" class="${fieldInfo.css_class}" name="${fieldInfo.field_name || ''}" data-table-name="${fieldInfo.tableName || ''}" placeholder="${fieldInfo.placeholder}"`;
						
						var fieldLabelHTML = `<label class="field-label" for="${fieldInfo.html_id}">${fieldInfo.label_text || ''}</label>`
						var inputTag = fieldInfo.html_input_type;
						if (inputTag !== 'select' && inputTag !== 'textarea'){ 
							inputFieldAttributes += ` type="${fieldInfo.html_input_type}"`;
							inputTag = 'input';
						} else if (inputTag === 'textarea'){
							fieldLabelHTML = '';
						}
						if (fieldInfo.dependent_target) 
							inputFieldAttributes += ` data-dependent-target="${fieldInfo.dependent_target}" data-dependent-value="${fieldInfo.dependent_value}"`;
						if (fieldInfo.lookup_table) 
							inputFieldAttributes += ` data-lookup-table="${fieldInfo.lookup_table}"`;
						if (fieldInfo.on_change) 
							inputFieldAttributes += ` onchange="${fieldInfo.on_change}"`;
						if (fieldInfo.card_label_index) 
							inputFieldAttributes += ` data-card-label-index="${fieldInfo.card_label_index}"`;
						if (fieldInfo.calculation_target) 
							inputFieldAttributes += ` data-calculation-target="${fieldInfo.calculation_target}"`;
						if (fieldInfo.html_min) 
							inputFieldAttributes += ` min="${fieldInfo.html_min}"`;
						if (fieldInfo.html_max) 
							inputFieldAttributes += ` max="${fieldInfo.html_max}"`;
						if (fieldInfo.html_step) 
							inputFieldAttributes += ` step="${fieldInfo.html_step}"`;
						if (fieldInfo.html_input_type == 'datetime-local') 
							inputFieldAttributes +=' pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}"';
						const inputTagClosure = inputTag != 'input' ? `</${inputTag}>` : ''; 
						$(`
							<div class="${fieldInfo.parent_css_class}">
								<${inputTag} ${inputFieldAttributes} ${fieldInfo.required ? 'required' : ''}>${inputTagClosure}
								${fieldInfo.required ? '<span class="required-indicator">*</span>' : ''}
								${fieldLabelHTML}
							</div>
						`).appendTo($parent);
					}
				}
			}
		}

		// Fill fields


		// Remove any field conainters that don't have any enabled fields
		$('.field-container:empty').remove();
		$('.units-field-container > .required-indicator, .units-field-container > .field-label').remove();


		// Add stuff that can't easily be automated/stored in the DB
		// Do stuff with utility flag classes
		$('.input-field.money-field').before('<span class="unit-symbol unit-symbol-left">$</span>');
		
		const lockedSectionTitles = $('.form-section.admin-section.locked').removeClass('admin-section locked');

		// Add "Describe location by" field
		$(`
			<div class="field-container col single-line-field">
				<label class="field-label inline-label" for="input-location_type">Describe location by:</label>
				<select class="input-field no-option-fill" id="input-location_type" value="Place name" name="location_type">
					<option value="Place name">Place name</option>
					<option value="Backcountry unit">Backcountry unit</option>
					<option value="Road mile">Road mile</option>
					<option value="GPS coordinates">GPS coordinates</option>
				</select>
			</div>
		`).prependTo('#section-4 .form-section-content');

		// Configure map and GPS fields
		$(`
			<!-- lat/lon fields -->
			<div class="field-container col">
				<div class="field-container col-6">
					<select class="input-field no-option-fill coordinates-select" name="coordinate_format" id="input-coordinate_format" value="ddd" required>
						<option value="ddd">Decimal degrees (dd.ddd&#176)</option>
						<option value="ddm">Degrees decimal minutes (dd&#176 mm.mmm)</option>
						<option value="dms">Degrees minutes seconds (dd&#176 mm' ss")</option>
					</select>
					<label class="field-label" for="input-coordinate_format">Coordinate format</label>
				</div>
			</div>
			<!--<div class="field-container">-->
			<!-- dd.ddd -->
			<div class="collapse show field-container col-6 inline">
				<div class="field-container col-6">
					<input class="input-field input-with-unit-symbol text-right coordinates-ddd" type="number" step="0.00001" min="-90" max="90" name="latitude_dec_deg" placeholder="Lat: dd.ddd" id="input-lat_dec_deg" required>
					<span class="required-indicator">*</span>
					<span class="unit-symbol">&#176</span>
					<label class="field-label" for="input-lat_dec_deg">Latitude</label>
				</div>
				<div class="field-container col-6">
					<input class="input-field input-with-unit-symbol text-right coordinates-ddd" type="number" step="0.00001" min="-180" max="180" name="longitude_dec_deg" placeholder="Lon: ddd.ddd" id="input-lon_dec_deg" required>
					<span class="required-indicator">*</span>
					<span class="unit-symbol">&#176</span>
					<label class="field-label" for="input-lon_dec_deg">Longitude</label>
				</div>
			</div>
			<!--dd mm.mmm-->
			<div class="collapse field-container col-6 inline">
				<div class="field-container col-6 justify-content-start">
					<div class="flex-field-container flex-nowrap">
						<input class="input-field input-with-unit-symbol text-right coordinates-ddm" type="number" step="1" min="-90" max="90" placeholder="dd" id="input-lat_deg_ddm" required>
						<span class="required-indicator">*</span>
						<span class="unit-symbol">&#176</span>
					</div>
					<div class="flex-field-container flex-nowrap">
						<input class="input-field input-with-unit-symbol text-right coordinates-ddm" type="number" step="0.001" min="0" max="60" placeholder="mm.mm" id="input-lat_dec_min" required>
						<span class="unit-symbol">'</span>
					</div>
					<label class="field-label">Latitude</label>
				</div>
				<div class="field-container col-6 justify-content-start">
					<div class="flex-field-container flex-nowrap">
						<input class="input-field input-with-unit-symbol text-right coordinates-ddm" type="number" step="1" min="-180" max="180" placeholder="ddd" id="input-lon_deg_ddm" required>
						<span class="required-indicator">*</span>
						<span class="unit-symbol">&#176</span>
					</div>
					<div class="flex-field-container flex-nowrap">
						<input class="input-field input-with-unit-symbol text-right coordinates-ddm" type="number" step="0.001" min="0" max="60" placeholder="mm.mmm" id="input-lon_dec_min" required>
						<span class="unit-symbol">'</span>
					</div>
					<label class="field-label">Longitude</label>
				</div>
			</div>
			<!--dd mm ss-->
			<div class="collapse field-container col-6 inline">
				<div class="field-container col-6">
					<div class="field-container degree-field-container">
						<div class="flex-field-container flex-nowrap">
							<input class="input-field input-with-unit-symbol text-right coordinates-dms" type="number" step="1" min="-90" max="90" placeholder="dd" id="input-lat_deg_dms" required>
							<span class="required-indicator">*</span>
							<span class="unit-symbol">&#176</span>
						</div>
						<div class="flex-field-container flex-nowrap">
							<input class="input-field input-with-unit-symbol text-right coordinates-dms" type="number" step="1" min="0" max="60" placeholder="mm" id="input-lat_min_dms" required>
							<span class="unit-symbol">'</span>
						</div>
						<div class="flex-field-container flex-nowrap">
							<input class="input-field input-with-unit-symbol text-right coordinates-dms" type="number" step="0.1" min="0" max="60" placeholder="ss.s" id="input-lat_dec_sec" required>
							<span class="unit-symbol">"</span>
						</div>
					</div>
					<label class="field-label">Latitude</label>
				</div>
				<div class="field-container col-6">
					<div class="field-container degree-field-container">
						<div class="flex-field-container flex-nowrap">
							<input class="input-field input-with-unit-symbol text-right coordinates-dms" type="number" step="1" min="-180" max="180" placeholder="dd" id="input-lon_deg_dms" required>
							<span class="required-indicator">*</span>
							<span class="unit-symbol">&#176</span>
						</div>
						<div class="flex-field-container flex-nowrap">
							<input class="input-field input-with-unit-symbol text-right coordinates-dms" type="number" step="1" min="0" max="60" placeholder="mm" id="input-lon_min_dms" required>
							<span class="unit-symbol">'</span>
						</div>
						<div class="flex-field-container flex-nowrap">
							<input class="input-field input-with-unit-symbol text-right coordinates-dms" type="number" step="0.1" min="0" max="60" placeholder="ss.s" id="input-lon_dec_sec" required>
							<span class="unit-symbol">"</span>
						</div>
					</div>
					<label class="field-label">Longitude</label>
				</div>
			</div>
			<!--</div>-->
				<div class="field-container col-6 inline">
					<div class="field-container col-6">
						<select class="input-field" name="datum_code" id="input-datum" value="1"></select>
						<label class="field-label" for="input-datum">Datum</label>
					</div>
					<div class="field-container col-6">
						<select class="input-field default" name="location_accuracy_code" id="input-location_accuracy" placeholder="GPS coordinate accuracy"></select>
						<label class="field-label" for="input-location_accuracy">GPS coordinate accuracy</label>
					</div>
				</div>
			<div class="field-container map-container">
				<div class="marker-container" id="encounter-marker-container">
					<label class="marker-label">Type coordinates manually above or drag and drop the marker onto the map</label>
					<img id="encounter-marker-img" src="https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png" class="draggable-marker" alt="drag and drop the marker">
				</div>
				
				<div id="expand-map-button-container">
					<button id="expand-map-button" class="icon-button" onclick="onExpandMapButtonClick(event)"  title="Expand map" aria-label="Expand map">
						<img src="imgs/maximize_window_icon_50px.svg"></img>
					</button>
				</div>
				
				<div class="map" id="encounter-location-map"></div>
			</div>
		`).appendTo('#section-4 .form-section-content');//map section

		// Configure attachments
		// Attachment stuff
		$('#input-file_type')
			.parent()
			.after(`
				<div class="collapse field-container col-6 inline">
					<div class="collapse field-container col-6 file-preview-container">
						<div class="attachment-progress-bar-container">
							<div class="attachment-progress-bar">
								<div class="attachment-progress-indicator"></div>
							</div>
						</div>
						<img class="file-thumbnail hidden" src="#" alt="thumbnail" onclick="onThumbnailClick(event)" alt="clickable thumbnail of uploaded file">
					</div>
					<div class="attachment-file-input-container col-6">
						<label class="filename-label"></label>
						<label class="generic-button text-center file-input-label" for="attachment-upload">select file</label>
						<input class="input-field hidden attachment-input" id="attachment-upload" type="file" accept="" name="uploadedFile" data-dependent-target="#input-file_type" data-dependent-value="!<blank>" onchange="onAttachmentInputChange(event)" required>
					</div>
				</div>
			`);
		const $attachmentsAccordion = $('#attachements-accordion');

		// Configure narrative field
		const $narrativeField = $('#input-narrative');
		/*if ($narrativeField.length) {
			$(`
				<div class="recorded-text-container">
					<span id="recorded-text-final" contenteditable="true"></span>
					<span id="recorded-text-interim"></span>
				</div>
				<div class="mic-button-container">
					<label class="recording-status-message" id="recording-status-message"></label>
					<button class="icon-button mb-2 hidden tooltipped" id="record-narrative-button">
						<!--<span class="record-on-indicator"></span>-->
						<i class="pointer fa fa-2x fa-microphone" id="narrative-mic-icon"></i>
						<!--<div class="tip tip-left">
							<h6>Start dictation</h6>
							<i class="tooltip-arrow"></i>
						</div>-->
					</button>
				</div>
			`).appendTo($narrativeField.closest('.field-container'));
		}//*/

		// Do all other configuration stuff

		// If the user does not have previous data saved, add the first card here in 
		//	case this same form is used for data viewing. If there is saved data, the 
		//	form and all inputs will be restored from the previous session
		$('.accordion.form-item-list').each((_, el) => {
			const tableName = $(el).data('table-name');
			if (tableName in this.queryResult) {
				for (row in this.queryResult[tableName]) {
					addNewCard($(el));
				}
			}
		});

		// Some accordions might be permanetnely hidden because the form is simplified, 
		//	but the database still needs to respect the one-to-many relationship. In 
		//	these cases, make sure the add-item-container is also hidden
		$('.accordion.form-item-list.hidden:not(.collapse)')
			.siblings('.add-item-container')
			.addClass('hidden');

		// fill selects
		let deferreds = $('select').map( function() {
			const $el = $(this);
			const placeholder = $el.attr('placeholder');
			const lookupTable = $el.data('lookup-table');
			const lookupTableName = lookupTable ? lookupTable : $el.attr('name') + 's';
			const id = this.id;
			if (lookupTableName != 'undefineds') {//if neither data-lookup-table or name is defined, lookupTableName === 'undefineds' 
				if (placeholder) $('#' + id).append(`<option class="" value="">${placeholder}</option>`);
				if (!$el.is('.no-option-fill')) {
					return fillSelectOptions(id, `SELECT code AS value, name FROM ${lookupTableName} WHERE sort_order IS NOT NULL ORDER BY sort_order`);
				}
			}
		})
		$.when(
			...deferreds
		).then(function() {
			//fillFields();
		});

		$('select').change(onSelectChange);
		
		// Add distance measurement units to unit selects
		$('.short-distance-select')
			.empty()
			.append(`
				<option value="ft">feet</option>
				<option value="m">meters</option>
			`).val('ft');

		// Set additional change event for initial action selects
		$('#input-initial_human_action, #input-initial_bear_action').change(onInitialActionChange);

		// When an input changes, save the result to the FIELD_VALUES global object so data are persistent
		$('.input-field').change(onInputFieldChange);

		//When a field with units changes, re-calculate
		$('.units-field').change(onUnitsFieldChange);

		// When a card is clicked, close any open cards in the same accordion
		$('.collapsed').click(function() {
			const $accordion = $(this).closest('.accordion');
			$accordion.find('.card:not(.cloneable) .collapse.show')
				.removeClass('show')
				.siblings()
					.find('.card-header')
					.addClass('collapsed');
		});

		// Make sure the hidden class is added/removed when bootstrap collapse events fire
		$('.collapse.field-container, .collapse.accordion')
			.on('hidden.bs.collapse', function () {
				$(this).addClass('hidden');
			})
			.on('show.bs.collapse', function () {
				$(this).removeClass('hidden');
			});

		// When any card-label-fields change, try to set the parent card label
		$('.input-field.card-label-field').change(function() {onCardLabelFieldChange($(this))});

		// When the user types anything in a field, remove the .error class (if it was assigned)
		$('.input-field').on('keyup change', onInputFieldKeyUp);

		// Set up coordinate fields to update eachother and the map
		$('.coordinates-ddd').change(onDDDFieldChange);
		$('.coordinates-ddm').change(onDMMFieldChange);
		$('.coordinates-dms').change(onDMSFieldChange);
		$('#input-coordinate_format').change(onCoordinateFormatChange);

		// Set up the map
		ENCOUNTER_MAP = configureMap('encounter-location-map');
		MODAL_ENCOUNTER_MAP = configureMap('modal-encounter-location-map')
			.on('moveend', e => { // on pan, get center and re-center ENCOUNTER_MAP
				const modalMap = e.target;
				ENCOUNTER_MAP.setView(modalMap.getCenter(), modalMap.getZoom());
			}) 
		MODAL_ENCOUNTER_MAP.scrollWheelZoom.enable();

		// Prevent form submission when the user hits the 'Enter' key
		$('.input-field').keydown((e) => { 
			//if (event.which == 13) event.returnValue(); 
			e = e || event;
			var txtArea = /textarea/i.test((e.target || e.srcElement).tagName);
			return txtArea || (e.keyCode || e.which || e.charCode || 0) !== 13;
		});

		var recognition = initSpeechRecognition();
		if (recognition) {
			$('#record-narrative-button')
				.click(onMicIconClick)
				.removeClass('hidden');
		}

		// When the user manually types (rather than dictates) the narrative, 
		//	set the narrative textarea val
		$('#recorded-text-final').on('input', (e) => {
			$('#input-narrative')
				.val($(e.target).text())
				.change();
		})

		//add event listeners for contenteditable and textarea size change: https://stackoverflow.com/questions/1391278/contenteditable-change-events
		//might have to use resizeobserver: https://stackoverflow.com/questions/6492683/how-to-detect-divs-dimension-changed

		// resize modal video preview when new video is loaded
		$('#modal-video-preview').on('loadedmetadata', function(event){
			const el = event.target;
			const aspectRatio = el.videoHeight / el.videoWidth;
			
		});
		
		$('#modal-audio-preview').on('loadedmetadata', function(event){
			// Set width so close button is on the right edge of video/audio
			const $el = $(event.target);
			
			var maxWidth;
			try {
				maxWidth = $el.css('max-width').match(/\d+/)[0];
			} catch {
				return
			}

			$el.closest('.modal')
				.find('.modal-img-body')
					.css('width', Math.min(maxWidth, window.innerWidth) + 'px');
		});

		$('#attachment-modal').on('hidden.bs.modal', e => {
			// Release resources of video preview when modal closes
			const $source = $('#modal-video-preview,#modal-audio-preview').not('.hidden').find('source');
			const currentSrc = $source.attr('src');
			if ($source.length && currentSrc != "#") {
				$source.parent()[0].pause();//pause the video/audio because resetting src doesn't seem to work
				URL.revokeObjectURL(currentSrc);
				$source.attr('src', '#');
			}

			// Remove any inline css to the img/video/audio container element
			$(e.target).find('.modal-img-body').css('width', '');

		});


		// Save user input when the user leaves the page
		$(window).on('beforeunload', function(event) {
			// Check if editing and warn the user if there are unsaved edits
		});

		customizeConfiguration();
	})
}


/*function getFieldInfo() {

	const sql = `
		SELECT 
			fields.* 
		FROM data_entry_fields fields 
			JOIN data_entry_field_containers containers 
			ON fields.field_container_id=containers.id 
		WHERE 
			fields.is_enabled AND 
			containers.is_enabled 
		ORDER BY 
			containers.display_order,
			fields.display_order
		;
	`;

	queryDB(sql).done(
		queryResultString => {
			const queryResult = $.parseJSON(queryResultString);
			if (queryResult) {
				for (const row of queryResult) {
					const columnName = row.field_name;
					FIELD_INFO[columnName] = {};
					for (const property in row) {
						FIELD_INFO[columnName][property] = row[property];
					}
				};
			}
		}
	).fail(
		(xhr, status, error) => {
		showModal(`An unexpected error occurred while connecting to the database: ${error} from query:\n${sql}.\n\nTry reloading the page.`, 'Unexpected error')
	});
}*/


function geojsonPointAsCircle(feature, latlng) {
	/*
	Called on each point to set style and add a popup
	*/

	var markerOptions = {
		radius: 8,
		weight: 1,
		opacity: 1,
		fillOpacity: 0.8,
		fillColor: '#f56761',
		color: '#f56761'
	}

	// Create a <p> element for each non-null property
	var popupContent = '';
	for (let key in feature.properties) {
		const value = feature.properties[key];
		if (value !== null) 
			popupContent += `<p class="leaflet-field-item"><strong>${key}:</strong> ${value}</p>`;
	}

	var popup = L.popup({
		autoPan: true,

	}).setContent(`
		<div class="leaflet-popup-data-container">
			${popupContent}
		</div>
		<a href="query.html?id=${feature.id}" target="_blank">View record</a>
	`);

	return L.circleMarker(latlng, markerOptions)
		.bindPopup(popup);
}


function customizeConfiguration() {
	/* Dummy function. */
}