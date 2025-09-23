
var BHIMSQuery = (function(){
	
	/*
	Main constructor
	*/
	var _this;
	var Constructor = function() {
		this.queryResult = {};
		this.lookupValues = {};
		this.joinedDataTables = [];
		this.selectedID = null;
		this.dataLoadedFunctions = []; // array of functions to extend 
		this.queryResultMapData = L.geoJSON();
		this.queryResultMap = null;
		this.queryOptions = {case_sensitive: false, where: {}};
		this.tableSortColumns = {};
		this.encounterIDs = [];
		this.fieldsFull = false;
		this.anonymizedDefaults = {
			//first_name: 'Anonymous',
			//last_name: 'Person',
			phone_number: '555-5555',
			email_address: 'someone@abc.com' 
		};
		this.ignorePIIFields = false;
		_this = this; // scope hack for event handlers that take over "this"


	}


	/*
	Get the query result for the selected encounter and fill fields in the entry form
	*/
	Constructor.prototype.fillFieldsFromQuery = function() {

		// Reset fields so that when the newly selected encounter has a null value,
		//	 it doesn't retain the previously selected encounter's value 
		$('.input-field:not(select)').val('');
		for (const el of $('select.input-field')) {
			const $select = $(el);
			$select.val($select.find('option').first().attr('value'));
		}

		// Find any multiple selects and flatten the data
		let queryCopy = deepCopy(this.queryResult[this.selectedID]);
		for (const input of $(`.${MULTIPLE_SELECT_ENTRY_CLASS}`)) {
			const $select = $(input);
			const fieldName = input.name;
			queryCopy[fieldName] = (queryCopy[fieldName] || []).flat();
		}
		entryForm.fillFieldValues(queryCopy);

		// All distance values in the DB should be in meters so make sure the units match that
		$('.short-distance-select').val('m')

	}


	/*
	Helper function to query the database to find the primary key for each 
	table. This is really only necessary for bears and reactions, which
	both have primary keys from two columns, an order column specific 
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
		return queryDB(sql)
			.done(queryResultString => {
				if (queryReturnedError(queryResultString)) { 
					console.log(`error configuring main form: ${queryResultString}`);
				} else {
					const result = $.parseJSON(queryResultString);
					//var tableSortColumns = {};
					for (row of result) {
						this.tableSortColumns[row.table_name] = row.column_name;
					}
				}
			});
	}

	/* 
	Query each right-side table separately
	*/
	Constructor.prototype.getJoinedDataTables = function() {
		
		const tablesSQL = `
			SELECT 
				DISTINCT table_name 
			FROM information_schema.columns 
			WHERE table_schema='${entryForm.dbSchema}' AND column_name='encounter_id'
		;`;
		return queryDB(tablesSQL).done( tableQueryResultString => {
			const rightSideTables = $.parseJSON(tableQueryResultString);
			for (const row of rightSideTables) {
				const tableName = row.table_name;
				this.joinedDataTables.push(tableName);
			}
		});
	}


	Constructor.prototype.queryEncounterIDs = function() {

		return queryDB(`SELECT id FROM encounters`).done(queryResultString => {
			if (queryReturnedError(queryResultString)) { 
				console.log(`error query encounters table: ${queryResultString}`);
			} else {
				for (row of $.parseJSON(queryResultString)) {
					this.encounterIDs.push(row.id);
				}
				$('#query-result-count > .query-result-count-text').text(this.encounterIDs.length);
			}
		})
	}

	/*
	Helper function to get SQL statement for querying encounters table given sqlQueryParameters.
	Returns an array of two elements: the SQL, and WHERE clauses for any related tables that have 
	query parameters set
	*/
	Constructor.prototype.getEncountersSQL = function(sqlQueryParameters) {
		
		var encountersWhereClauses = [];
		var joinClauses = [];
		var whereClauses = {};
		const caseSensitive = $('#case-sensitive-slider-container input[type=checkbox]').prop('checked');
		for (const tableName in sqlQueryParameters.where) {
			for (const fieldName in sqlQueryParameters.where[tableName]) {
				// Initiate array for this table only if there's at least one param
				if (whereClauses[tableName] == undefined) whereClauses[tableName] = [];
				
				const value = sqlQueryParameters.where[tableName][fieldName].value;
				var operator = sqlQueryParameters.where[tableName][fieldName].operator;
				const type = sqlQueryParameters.where[tableName][fieldName].type;
				const clause = caseSensitive && type === 'text' ? 
					`lower(${tableName}.${fieldName}) ${operator} lower(${value})` :
					`${tableName}.${fieldName} ${operator} ${value}`;
				whereClauses[tableName].push(clause);
				encountersWhereClauses.push(clause);
			}
			if (whereClauses[tableName]) {
				if (whereClauses[tableName].length && tableName !== 'encounters') {
					joinClauses.push(`LEFT JOIN ${tableName} ON encounters.id=${tableName}.encounter_id`);
				}
			}
		}

		const encountersWhereStatement = encountersWhereClauses.length ? 'WHERE ' + encountersWhereClauses.join(' AND ') : '';
		const encountersSQL = `SELECT DISTINCT encounters.* FROM encounters ${joinClauses.join(' ')} ${encountersWhereStatement} ORDER BY encounters.start_date`;
		
		return  [encountersSQL, whereClauses];
	}


	/* Query all data tables */
	Constructor.prototype.runDataQuery = function(sqlQueryParameters) {

		showLoadingIndicator();

		var deferreds = [$.Deferred()];
		// Get encounters table
		if (typeof(sqlQueryParameters) === 'string') {
			try {
				sqlQueryParameters = $.parseJSON(sqlQueryParameters);
			} catch {
				console.log('could not parse queryParameters string: ' + sqlQueryParameters);
				return;
			}
		}
		
		const [encountersSQL, whereClauses] = this.getEncountersSQL(sqlQueryParameters);
		var encounterResult = {};
		var encountersDeferred = queryDB(encountersSQL)
			.done(queryResultString => {
				if (queryReturnedError(queryResultString)) { 
					console.log(`error query encounters table: ${queryResultString}`);
				} else {
					var liElements = [];
					encounterResult = $.parseJSON(queryResultString);

					// Unload any previous data since we know the query returned something
					this.queryResult = {}; 
					$('#query-result-list').empty();
					// for some reason accordions also occasionally get cleared before being reloaded with new data, so do that manually
					$('.accordion.form-item-list .card:not(.cloneable)').remove();

					// For each encounter, create an object that mirrors the FIELD_VALUES object of bhims-entry.js
					for (const encounter of encounterResult) {
						
						
						this.queryResult[encounter.id] = {...encounter};

						//this.queryResult.encounters[encounter.id] = {...encounter};

						// Configure the list item element for this encounter
						const bearGroupType = encounter.bear_cohort_code ? this.lookupValues.bear_cohort_codes[encounter.bear_cohort_code].name : 'unknown'
						liElements.push(
							$(`
								<li id="query-result-item-${encounter.id}" class="query-result-list-item" data-encounter-id="${encounter.id}" title="Form number: ${encounter.park_form_id}, Bear group: ${bearGroupType}">
									<label>
										<strong>Form number:</strong> ${encounter.park_form_id}, <strong>Bear group:</strong> ${bearGroupType}
									</label>
									<div class="query-result-edit-button-container">
										<button id="delete-button-${encounter.id}" class="query-result-edit-button icon-button delete-encounter-button" type="button" aria-label="Delete selected encounter" title="Delete encounter">
											<i class="fas fa-trash fa-lg"></i>
										</button>
										<button id="edit-button-${encounter.id}" class="query-result-edit-button icon-button toggle-editing-button" type="button" aria-label="Edit selected encounter" title="Edit encounter">
											<i class="fas fa-edit fa-lg"></i>
										</button>
										<button id="save-button-${encounter.id}" class="query-result-edit-button icon-button save-edits-button hidden" type="button" aria-label="Save edits" title="Save edits">
											<i class="fas fa-save fa-lg"></i>
										</button>
										<button id="permalink-button-${encounter.id}" class="query-result-edit-button icon-button encounter-permalink-button" type="button" aria-label="Copy permalink" title="Copy permalink" data-encounter-id="${encounter.id}">
											<i class="fas fa-link fa-lg"></i>
										</button>
									</div>
								</li>
							`).appendTo('#query-result-list')
								.click(this.onResultItemClick)
						);
					}

					// Make the first one selected
					const $firstEl = liElements[0];
					if ($firstEl) {
						$firstEl.addClass('selected');
						this.selectedID = $firstEl.data('encounter-id');
					}

					$('.delete-encounter-button').click(this.onDeleteEncounterButtonClick);
					$('.toggle-editing-button').click(this.onEditButtonClick);
					$('.save-edits-button').click(this.onSaveButtonClick);
					$('.encounter-permalink-button').click(e => {
						const $button = $(e.target).closest('.query-result-edit-button');
						const encounterID = $button.data('encounter-id');
						const url = encodeURI(`${window.location.href.split('?')[0]}?{"encounters": {"id": {"value": "(${encounterID})", "operator": "IN"}}}`);
						copyToClipboard(url, `Permalink for encounter ${encounterID} successfully copied to clipboard`);
					});

					// Show export button
					$('.data-export-footer').removeClass('hidden').attr('aria-hidden', false);
				}
			}
		).fail(() => {hideLoadingIndicator()})
		.then(() => {

			// If the encounters query was empty, warn the user and exit
			if (!Object.keys(encounterResult).length) {
				showModal('Your query did not return any results. Try changing the query parameters.', 'Empty query result');
				deferreds[0].resolve();
				hideLoadingIndicator();
				return;
			}

			// Get all table names from accordions
			const oneToManyTables = $('.accordion').map((_, el) => {return $(el).data('table-name')}).get();
			const encounterIDClause = `encounters.id IN (${Object.keys(this.queryResult).join(',')})`
			// get a list of all the multiple choice select fields
			const selectMultipleFields = Object.fromEntries(
				Object.entries(entryForm.fieldInfo).flatMap( 
					// return [table name, field name] if it's a multiple select, otherwise return an empty array
					// 	so that the whole returned array can be flattened and null results will be dropped
					([fieldName, info]) => (info.css_class || '').includes(MULTIPLE_SELECT_ENTRY_CLASS) ? 
						[[info.table_name, fieldName]] : // wrap in double brackets for flatMap() to remove the first set
						[] // and collapse any null results
				)
			);
			for (const tableName of this.joinedDataTables) {
				// construct WHERE statement in the format "WHERE encounters.id IN (...) AND <tableName>.<fieldName>..." 
				//	unless there are no query params for this table. If that's the case just use "WHERE encounters.id IN (...)"
				const tableWhereClauseString = whereClauses[tableName] ? 'AND ' + whereClauses[tableName].join(' AND ') : '';
				const whereString = `WHERE ${encounterIDClause} ${tableWhereClauseString}`;
				const sql = `SELECT ${tableName}.* FROM ${tableName} INNER JOIN encounters ON encounters.id=${tableName}.encounter_id ${whereString} ORDER BY ${tableName}.${this.tableSortColumns[tableName]}`;
				const deferred = queryDB(sql);

				deferred.done( queryResultString => {
					if (queryReturnedError(queryResultString)) { 
							console.log(`error querying ${tableName}: ${queryResultString}`);
					} else { 
						const result = $.parseJSON(queryResultString);
						//this.queryResult[tableName] = {};
						if (tableName in selectMultipleFields) {
							const fieldName = selectMultipleFields[tableName];
							const sortedResult = (result[0] || {}).display_order ? 
								result.sort((row1, row2) => parseInt(row1.display_order) - parseInt(row2.display_order)) :
								result;
							const encounterID = result[0].encounter_id;
							this.queryResult[encounterID][fieldName] = sortedResult.map(row => row[fieldName]);
						} else {
							for (const row of result) {
								for (const columnName in row) {
									if ((entryForm.fieldInfo[columnName] || {}).has_pii === 't' && this.anonymizedDefaults[columnName]) {
										row[columnName] = this.anonymizedDefaults[columnName];
										this.ignorePIIFields = true;
									}
								}
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
					}
					
				}).fail((xhr, status, error) => {
					console.log(`An unexpected error occurred while connecting to the database: ${error} while getting data values from ${tableName}.`)
				});
				deferreds.push(deferred);
			}

			deferreds[0].resolve();
			$.when(...deferreds).then(() =>  {
				this.loadSelectedEncounter();
				this.addMapData();
			}).always(() => {hideLoadingIndicator()});
		});

		return deferreds;

	}


	/* 
	Parse a URL query into an SQL query and process the result 
	*/
	Constructor.prototype.urlQueryToSQL = function(optionConfigComplete) {

		var queryParamString = decodeURIComponent(window.location.search.slice(1));

		// turn the case-sensitive switch on if it was set in the parameters
		const queryParams = $.parseJSON(queryParamString);
		$('#case-sensitive-slider-container input[type=checkbox]').prop('checked', queryParams.case_sensitive);

		// For backwards compatibility with old-style URLs, create the .where property if it doesn't exist
		if (!('where' in queryParams)) queryParams.where = {...queryParams};

		$.when(
			this.runDataQuery(queryParams),
			optionConfigComplete
		).then( () => {
			//this.setReactionFieldsFromQuery();
			// set query options
			for (const tableName in queryParams.where) {
				
				const tableParams = queryParams.where[tableName];
				
				// set queryOptions here so query drawer state can be appropriately set when 
				//	$optionElement.blur() is called
				this.queryOptions.where[tableName] = {...tableParams};
				
				for (const fieldName in tableParams) {
					const $optionElement = $(`#query-option-${fieldName}`);
					
					// If this field isn't one of the options (e.g., id), skip it
					if (!$optionElement.length) continue;

					const fieldParams = tableParams[fieldName];

					if ($optionElement.hasClass('string-match-query-option')) {
						// text, textarea, tel, or email
						const $operatorElement = $optionElement.siblings('.query-option-operator');
						const fieldValue = fieldParams.value.toString().replace(/'/g, '');
						if (fieldParams.operator === '=') {
							// e.g., field = 'value'
							$optionElement.val(fieldValue);
							$operatorElement.val('equals');
						} else if (fieldParams.operator === '<>') {
							// e.g., field <> 'value'
							$optionElement.val(fieldValue);
							$operatorElement.val('notEqual');
						} else if (fieldParams.operator === 'LIKE') {
							if (fieldValue.endsWith("%") && !fieldValue.startsWith("%")) {
								//e.g. field LIKE 'value%'
								$operatorElement.val('startsWith');
							} else if (fieldValue.startsWith("%") && !fieldValue.endsWith("%")) {
								//e.g. field LIKE '%value'
								$operatorElement.val('endsWith')
							} else {
								//e.g. field LIKE '%value%'
								$operatorElement.val('contains')
							}
							// Remove percent symbol
							$optionElement.val(fieldValue.replace(/%/g, ''));
						} else if (fieldParams.operator === 'IS' && fieldValue === 'NULL') {
							$optionElement.addClass('hidden');
							$operatorElement.val('is null');
						} else if (fieldParams.operator === 'IS NOT' && fieldValue === 'NULL') {
							$optionElement.addClass('hidden');
							$operatorElement.val('is not null');
						} else {
							console.log('could not understand type of string option for ' + fieldName)
						}

					} else if ($optionElement.hasClass('slider-container')) {
						// numeric
						const $sliderContainer = $optionElement;
						const $inputs = $sliderContainer.find('.query-slider-label-container > input.slider-value');
						const $minInput = $inputs.first();
						const $maxInput = $inputs.last();
						const valueString = fieldParams.value;
						var values;
						try { 
							values = valueString.split('AND').map(value => {return parseInt(value.trim())});
						} catch {
							console.log(`could not parse numeric values from value string for ${fieldName}: ${valueString}`)
						}
						// Fill values and trigger change to set handles
						$minInput.val(Math.max(values[0], $minInput.attr('min'))).change();
						$maxInput.val(Math.min(values[1], $maxInput.attr('max'))).change();

					} else if ($optionElement.hasClass('datetime-query-option')) {
						// datetime field
						const fieldValue = fieldParams.value.replace(/'/g, '');
						const $operatorElement = $optionElement.siblings('.query-option-operator');
						if (fieldParams.operator === 'BETWEEN') {
							const $inputs = $optionElement.siblings('.query-option-double-value-container')
								.removeClass('hidden')
									.find('.query-option-input-field.double-value-field');
							const valueString = fieldValue;
							var values;
							try { 
								values = valueString.split('AND').map(value => {return value.trim()});
							} catch {
								console.log(`could not parse date/time values from value string for ${fieldName}: ${valueString}`)
							}
							$operatorElement.val('BETWEEN');
							$inputs.first().val(values[0]);
							$inputs.last().val(values[1]);
						} else {
							$optionElement.val(fieldValue);

							$operatorElement.val(fieldParams.operator);
						}
					} else if ($optionElement.hasClass('select2-no-tag')) {
						$optionElement.val(fieldParams.value.toString().replace(/\(|\)/g, '').split(','))
					} else {
						console.log('could not understand type of option for ' + fieldName)
					}

					// Show this option
					$('.tab-field-list-container .field-list-item > .add-field-query-option-button')
						.filter((_, el) => {return $(el).data('target') === ('#' + $optionElement.attr('id'))})
							.parent()
							.addClass('hidden');
					$optionElement.closest('.query-option-container').removeClass('hidden');
					$('#copy-query-link-button').removeClass('invisible');
					$optionElement.blur();
				}
			}

		});
		
	}


	/*
	Add all query results to the result map. This only happens when the user runs a new 
	query, not when the user selects a different encounter
	*/
	Constructor.prototype.addMapData = function() {

		var features = [];
		for (const encounterID in this.queryResult) {

			data = this.queryResult[encounterID];
			// Skip it if it doesn't have spatial data
			if (!data.longitude && !data.latitude) continue;

			features.push({
				id: encounterID,
				type: 'Feature',
				properties: {...data},
				geometry: {
					type: 'Point',
					coordinates: [
						parseFloat(data.longitude),
						parseFloat(data.latitude)
					]
				}
			});
		}

		const featureToMarker = (feature, latlng) => {

			return L.circleMarker(latlng);//, styleFunc)
		}

		const getColor = (encounterID) => { 
			return encounterID == _this.selectedID ? 
				'#f73830' ://'#f56761' : //red
				'#f3ab3a'; //orange
		}
		const styleFunc = feature => {
			return {
				radius: 8,
				weight: 1,
				opacity: 1,
				fillOpacity: 0.8,
				fillColor: getColor(feature.id),
				color: getColor(feature.id)
			}
		}

		this.queryResultMapData.remove();

		this.queryResultMapData = L.geoJSON(
				features, 
				{
					//onEachFeature: onEachPoint,
					style: styleFunc,
					pointToLayer: featureToMarker
				}
		).on('click', e => {
			/*
			When a point is clicked on the map, select the corresponding encounter
			*/
			const clickedMarker = e.layer;
			const encounterID = clickedMarker.feature.id;

			// If this encounter is already selected, do nothing
			if (encounterID == _this.selectedID) return;

			const $selectedItem = $('.query-result-list-item')
				.filter((_, el) => {
					return encounterID == $(el).data('encounter-id')
				});
			
			// Load data by triggering the onclick event for the .query-result-list-item
			$selectedItem.click();
			
			// Show this point as selected in the map
			_this.selectResultMapPoint();

		}).addTo(this.queryResultMap);

		// Zoom to fit data on map. maxZoom is property set when the map is created in confiureMap()
		// 	so no need to worry/check that it will zoom in too far (beyond the range of the tile layer)
		this.queryResultMap.fitBounds(this.queryResultMapData.getBounds());
	}


	/*
	Helper function to toggle field editability and change appearance
	*/
	Constructor.prototype.toggleFieldEditability = function(allowEdits) {
		
		const disableEdits = !allowEdits;
		const fields = $('.input-field')
			.toggleClass('uneditable', disableEdits)
			.prop('readonly', disableEdits);
		fields
			.has('select') //"readonly" attribute doesn't work on selects, but "disabled" does
				.prop('disabled', disableEdits);
		for (const el of fields) {
			$(el).parents('.field-container').last().toggleClass('uneditable', disableEdits);
		}

		$('.query-result-list-item.selected .save-edits-button').toggleClass('hidden', disableEdits);

		// disable buttons and other interactive elements
		$('.add-item-button, .delete-button, .file-input-label').toggleClass('hidden', disableEdits);
		$('.add-item-container').toggleClass('show', allowEdits);
		$('.map .leaflet-marker-pane .leaflet-marker-icon').toggleClass('leaflet-marker-draggable', allowEdits);
		const markerContainer = $('.marker-container.collapse');
		if (allowEdits && !entryForm.markerIsOnMap()) {
			markerContainer.show();
		} else {
			markerContainer.hide();
		}

		// Hide any "add item" buttons if they're controlling select is set to "No"
		for (const button of $('.add-item-button')) {
			const $button = $(button);
			const targetID = $button.data('dependent-target'); 
			const targetValue = $button.data('dependent-value');
			if (targetID) { // if true, the .add-item-button is inside a collapse 
				const collapseCommand = $(targetID).val() == targetValue && allowEdits ?
					'show' :
					'hide';
				$button.closest('.add-item-container').collapse(collapseCommand);
			}
		}


		// Make sure the narrative field editability is changed
		$('#recorded-text-final').prop('contenteditable', allowEdits);

		// Adjust any fields with units that need to be next to the value
		const fieldsWithUnits = $('.input-with-unit-symbol.text-right, .flex-field-container .input-field.text-right-when-valid');
		const fontString = getCanvasFont(fieldsWithUnits[0]);
		if (disableEdits) {
			for (const el of fieldsWithUnits) {
				const width = Math.ceil(getTextWidth(el.value, fontString) + 10);
				const $el = $(el).css('width', width + 'px');
			}
		} else {
			fieldsWithUnits.css('width', '');//undo inline styles
		}

		//uneditable-units-text
		for (const el of $('.units-field-container')) {
			const $unitsContainer = $(el);
			const $select = $unitsContainer.find('select.input-field');
			const unitsValue = $select.val();
			const $option = $select.find('option').filter((_, el) => {return el.value === unitsValue});
			const displayValue = $option.text();
			$unitsContainer.siblings('.flex-field-container')
				.find('.uneditable-units-text')
					.text(displayValue);
		}

		// disable multiple selects
		$(`.${MULTIPLE_SELECT_ENTRY_CLASS}`).prop('disabled', disableEdits);
	}


	/*
	Load a previously attached file from the server. 
	*/
	Constructor.prototype.loadAttachment = function(attachmentInfo) {
		
		const $card = entryForm.addNewCard($('#attachments-accordion'));
		
		const fileType = attachmentInfo.file_type_code;
		$card.find('select') // file type select is the only one
			.val(fileType)
			.change();
		const fileName = attachmentInfo.thumbnail_filename || 
			attachmentInfo.file_path
				.split('\\').pop() //for windows-style paths
				.split('/').pop(); //for universal paths
		
		$card.find('.file-thumbnail')
			.attr('src', `attachments/${fileName}`) //set the image source
			.data('file-path', attachmentInfo.file_path)
			.removeClass('hidden') // and show it
		// hide the progress bar
		$card.find('.attachment-progress-bar-container')
		 		.addClass('hidden') 
		 		// and show the whole container
		 		.closest('.collapse').collapse('show') 
		// Set the card title and the file label
		$card.find('.card-link-label, .filename-label')
		 	.text(attachmentInfo.client_filename);

		$card.find('.input-field').filter((_, el) => {return el.name === 'file_description'})
			.val(attachmentInfo.file_description);

		// Load the file
		$.ajax({
			url: 'bhims.php',
			method: 'POST',
			data: {action: 'readAttachment', filePath: attachmentInfo.file_path},
		}).done(dataString => {
			var blob = fileType == 2 ? new Blob([dataString], {type: attachmentInfo.mime_type}) : null;
			setAttachmentThumbnail(fileType, $card.find('.file-thumbnail'), blob, `attachments/${fileName}`);
		}).fail((xhr, status, error) => {
			console.log(`Could not read ${attachmentInfo.file_path} because ${error}`)
		})
		
	}


	/*
	Delete a row from a joined table represented in an accordion card
	*/
	Constructor.prototype.deleteDBRecordFromCard = function(tableName, databaseID, cardID) {

		showLoadingIndicator('deleteDBRecordFromCard');
		const failMessage = 
			`The record fromt the ${tableName} table could not be deleted.` + 
			` Make sure you're connected to the NPS network and try again.` + 
			` If the problem persists, contact your system administrator.`
		;
		queryDB(
			`DELETE FROM ${tableName} WHERE id=${databaseID};`
		).done(queryResultString => {
			if (queryResultString.trim().startsWith('ERROR')) {
				console.log(queryResultString);
				setTimeout(
					()=> {
						showModal(failMessage, 'Database error')
					},
					1000
				);
			} else {
				// Check if this is the last card before calling onConfirmDeleteCardClick 
				//	because the removal happens asynchronously, and it would be impossible 
				//	to know if that has happened or not before checking if this is the last card
				const $card = $('#' + cardID);
				const $accordion = $card.closest('.accordion');
				const isLastCard = $card.siblings().length === 1;
				const cardIndex = $card.index() - 1;

				// Remove the card
				entryForm.onConfirmDeleteCardClick(cardID);
				
				// If this accordion is also a collapse (i.e., depends on a boolean select), 
				//	set the boolean select to "No"
				const dependentTargetID = $accordion.data('dependent-target');
				if (dependentTargetID && isLastCard) $(dependentTargetID).val(0).change();

				// Remove object from in-memory data
				const selectedTableData = _this.queryResult[_this.selectedID][tableName];
				selectedTableData.splice(cardIndex, 1);
				entryForm.fieldValues[tableName] = [...selectedTableData];
			}
		}).fail((xhr, status, error) => {
			console.log(`Could not delete record ${databaseID} from ${tableName} because ${error}`);
			setTimeout(
				()=> {
					showModal(failMessage, 'Database error')
				},
				1000
			);
		}).always(() => {hideLoadingIndicator('deleteDBRecordFromCard');})

	}


	/*
	Event handler for card delete buttons. This handler replaces the entryForm.onDeleteCardClick
	*/
	Constructor.prototype.onDeleteCardClick = function(e) {

		e.preventDefault();
		e.stopPropagation();

		var $deleteButton = $(e.target);
		const $card = $deleteButton.closest('.card');
		const cardID = $card.attr('id');
		
		//////// test what happens with cardID if middle card is deleted

		const cardIndex = $card.index() - 1; // minus 1 because this includes .cloneable card
		const tableName = $card.closest('.accordion').data('table-name');
		const selectedData = _this.queryResult[_this.selectedID];
		var onConfirmClick;
		// If the data only live in memory (i.e., the user recently added this card), they won't be in the queried data
		if (tableName in selectedData) {
			const tableRows = selectedData[tableName];
			// Check if data for this card exist in the DB already
			if (cardIndex in tableRows) {
				const dbID = tableRows[cardIndex].id
				if (dbID !== undefined) onConfirmClick = `bhimsQuery.deleteDBRecordFromCard('${tableName}', ${dbID}, '${cardID}');`;
			}
		}
		entryForm.deleteCard($deleteButton, onConfirmClick);
	}


	/*
	*/
	Constructor.prototype.loadSelectedEncounter = function() {

		showLoadingIndicator('loadSelectedEncounter');

		const selectedEncounterData = this.queryResult[this.selectedID];
		
		this.getReactionByFromReactionCodes().then(() => {
			this.fillFieldsFromQuery();
			this.setAllImplicitBooleanFields();
			this.setDescribeLocationByField();
			this.selectResultMapPoint();

			// Load any attachments
			const attachments = selectedEncounterData.attachments || [];
			entryForm.fieldValues.attachments = [...attachments];
			const $hasAttachmentsInput = $('#input-has_attachments');
			if (attachments.length) $hasAttachmentsInput.val(1); //open the collapse
			for (attachmentInfo of attachments) {
				if (attachmentInfo.file_path) {
					this.loadAttachment(attachmentInfo);
				}	
			}

			// Get the dependent target selects (which, when changed, should toggle some field editability)
			var dependentTargets = [];
			for (const el of $('.input-field')) {
				const targetID = $(el).data('dependent-target');
				const $select = $(targetID);
				if ($select.length && !dependentTargets.includes(targetID)) {
					entryForm.toggleDependentFields($select);
					// keep track of processed target selects
					dependentTargets.push(targetID);
				}
			};
			
			// Show the right location field(s) based on which of these fields is filled in
			/*const $locationTypeSelect = $('#input-location_type');
			if (selectedEncounterData.road_mile != null) {
				$locationTypeSelect.val('Road mile');
			} else if (selectedEncounterData.backountry_unit_code != null) {
				$locationTypeSelect.val('Backcountry unit');
			} else if (selectedEncounterData.place_name_code != null) {
				$locationTypeSelect.val('Place name');
			}*/

			const $attachmentsAccordion = $('#attachments-accordion');
			setTimeout(()=>{$attachmentsAccordion.collapse('show')}, 500);
			
			// If lat/lon isn't set, show the draggable mnarker
			if (!(selectedEncounterData.latitude && selectedEncounterData.longitude)) {
				$('#encounter-marker-container').slideDown(0);//.collapse('show')
			}

			// Run any extended functions
			for (const func of this.dataLoadedFunctions) {
				try {
					func()
				} catch (e) {
					console.log(`failed to run ${func.name} after loading data: ${e}`)
				}
			}

			this.toggleFieldEditability(false);

			// Open the first card
			if (!$('.row-details-card-collapse.show').length) {
				$('.card.form-section').first()
					.find('.row-details-card-collapse')
						.collapse('show');
			}

			// Make sure the reactions select is visible (might not be if either 
			//	initial_human_activity or initial_bear_activity is filled in)
			$('#reactions-accordion').removeClass('hidden').addClass('show');

			// Remove the entryForm's event listener for all .delete-card-buttons 
			//	and add one that will actually delete the database record
			$('.delete-card-button').off('click')
				.click(_this.onDeleteCardClick);
		});

	}


	/*
	Helper function to reset the form to its defaults
	*/
	Constructor.prototype.resetEncounterForm = function() {
		// Reset flag to prevent confirm message from showing when a user switches 
		//	to a new record before .dirty class can be removed from inputs
		this.fieldsFull = false;

		// Reset the form
		//	clear accordions
		$('.accordion .card:not(.cloneable, .form-section)').remove();
		
		// 	Reset the entry form map
		if (entryForm.markerIsOnMap()) entryForm.encounterMarker.remove();
		$('#input-location_type').val('Place name');
		$('.coordinates-ddd, .coordinates-ddm, .coordinates-dms').val(null);
		_this.resetSelectDefault($('#input-location_accuracy'));//use bhimsQuery because it needs to reference the global from query.html
		$('#input-datum').val(1); //WGS84
	}


	/*
	Load a new encounter after an encounter has already been selected. This needs 
	to be separated from the onResultItemClick event handler to enable control flow 
	from modal asking user to confirm edit saves
	*/
	Constructor.prototype.switchEncounterRecord = function(newRecordItemID) {

		_this.resetEncounterForm();

		// Deselect the currently selected encounter and select the clicked one
		$('.query-result-list-item.selected').removeClass('selected');
		const $selectedItem = $('#' + newRecordItemID).closest('li').addClass('selected');
		_this.selectedID = $selectedItem.data('encounter-id');

		// Load data
		_this.loadSelectedEncounter();
	}


	Constructor.prototype.confirmSaveEdits = function(afterActionCallbackStr='') {
		//@param afterActionCallbackStr: string of code to be appended to html onclick attribute
		const onConfirmClick = `
			showLoadingIndicator();
			bhimsQuery.saveEdits(); 
		`;
		
		const footerButtons = `
			<button class="generic-button modal-button secondary-button close-modal" data-dismiss="modal">Cancel</button>
			<button class="generic-button modal-button danger-button close-modal" data-dismiss="modal" onclick="bhimsQuery.discardEdits();${afterActionCallbackStr}">Discard</button>
			<button class="generic-button modal-button primary-button close-modal" data-dismiss="modal" onclick="${onConfirmClick}${afterActionCallbackStr}">Save</button>
		`;
		showModal(
			'You have unsaved edits to this encounter. Would you like to <strong>Save</strong> or <strong>Discard</strong> them? Click <strong>Cancel</strong> to continue editing this encounter.',
			'Save edits?',
			'alert',
			footerButtons
		);
	}

	/*
	Event handler for result item edit buttons
	*/
	Constructor.prototype.onEditButtonClick = function(e) {
		
		//e.preventDefault();
		e.stopPropagation();

		//Check to see if there's an active edit session
		const isEditing = !$('.input-field.uneditable').length;

		// check to see if anyone else is currently editing this encounter
		/*
		- if not isEditing:
			- user client issues 'NOTIFY edits_<encounter_id>'
			- user client issues 'LISTEN edits_<encounter_id>'
			- php script starts checking notifications with pg_get_notify() in a while loop every 1/2 second
			- if one is received, someone else is already editing and this user will be alerted and prevented from editing
		- else:
			- user client issues 'UNLISTEN edits_<encounter_id>'
		*/

		// Check for any edits
		if (isEditing) {
			const $dirtyInputs = $('.input-field.dirty:not(.ignore-on-insert)');
			if ($dirtyInputs.length && _this.fieldsFull) {
				_this.confirmSaveEdits(`bhimsQuery.toggleFieldEditability(${!isEditing});`);
			} else {
				_this.toggleFieldEditability(!isEditing);
			}
		} else {
			// If there are any .input-fields that are also .uneditable, turn on edits. 
			//	Otherwise, rurn them off
			_this.toggleFieldEditability(!isEditing);
		}


	}


	Constructor.prototype.deleteEncounter = function() {

		const encounterID = this.selectedID;
		showLoadingIndicator('deleteEncounter');
		return $.post({
			url: 'flask/deleteEncounter',
			data: {
				encounter_id: encounterID
			},
		}).done(deleteResultString => {
			if (queryReturnedError(deleteResultString)) {
				showModal('A problem occurred that prevented the server from deleting the encounter. Please try again later. \n\n Error details: ' + deleteResultString, 'Database Error');
			} else {
				const $deletedEncounterElement = $('#query-result-item-' + encounterID)
					.fadeOut(500, (_, el) => {
						$(el).remove();
					})
				// Select the previous (or next) encounter in the list
				const $previousEncounter = $deletedEncounterElement.prev();
				const $newSelection = $previousEncounter.length ? 
					$previousEncounter : 
					$deletedEncounterElement.next();
				// Check if the new selection exists. If so, switch to it
				if ($newSelection.length) {
					_this.switchEncounterRecord($newSelection.attr('id'));
				} 
				// If not, just reset the form
				else {
					_this.resetEncounterForm();
				}

			}
		}).fail((xhr, status, error) => {
			console.log(`An unexpected error occurred while deleting encounter ${encounterID}: ${error}`)
		}).always(() => {hideLoadingIndicator()})

	}

	/*
	*/
	Constructor.prototype.onDeleteEncounterButtonClick = function(e) {

		e.stopPropagation();

		const footerButtons = `
			<button class="generic-button modal-button secondary-button close-modal" data-dismiss="modal">No</button>
			<button class="generic-button modal-button danger-button close-modal" data-dismiss="modal" onclick="bhimsQuery.deleteEncounter()">Yes</button>
		`;
		showModal(`Are you sure you want to permanently delete this encounter and any files attached to it? This action cannot be undone.`, `Delete encounter?`, 'confirm', footerButtons);
	}


	/*
	Helper function to get a parametized SQL UPDATE statement
	*/
	Constructor.prototype.getUpdateSQL = function(tableName, fieldValues, idField, id) {
		const sortedFields = Object.keys(fieldValues).sort();
		const parameters = sortedFields.map(f => fieldValues[f]);
		const parametized = sortedFields
			.map((field, index) => `${field}=$${index + 1}`)
			.join(', ');
		const sql = `UPDATE ${tableName} SET ${parametized} WHERE ${idField}=${id};`;

		return [sql, parameters];
	}


	/*
	Helper function to get a parametized SQL INSERT statement
	*/
	Constructor.prototype.getInsertSQL = function(tableName, fieldValues, idField) {
		const sortedFields = Object.keys(fieldValues).sort();
		const parameters = sortedFields.map(f => fieldValues[f]);
		const parametized = sortedFields
			.map((field, index) => `$${index + 1}`)
			.join(', ');

		const sql = `INSERT INTO ${tableName} (${sortedFields.join(', ')}) VALUES (${parametized}) RETURNING id`;

		return [sql, parameters];
	}


	/*
	Helper function to discard user edits
	*/
	Constructor.prototype.discardEdits = function() {
		// Loop through each dirty input and reset the value
		const selectedID = this.selectedID;
		const selectedEncounterData = this.queryResult[selectedID];
		const $dirtyInputs = $('.input-field.dirty:not(.ignore-on-insert)');
		for (el of $dirtyInputs) {
			const fieldName = el.name;
			const queriedValue = selectedEncounterData[fieldName];
			const $input = $(el);
			$input.val(queriedValue); 
		} 
	}

	/* 
	Save user edits 
	*/
	Constructor.prototype.saveEdits = function() {

		// If the values of any PII fields were automatically set, ignore any changes to them
		if (this.ignorePIIFields) {
			const selector = Object.keys(this.anonymizedDefaults)
				.map(fieldName => `.input-field[name="${fieldName}"]`)
				.join(', ');
			$(selector).removeClass('dirty');
		}

		const $dirtyInputs = $('.input-field.dirty:not(.ignore-on-insert)');
		if ($dirtyInputs.length === 0) {
			hideLoadingIndicator();
			return;
		}

		const encounterID = this.selectedID;
		var selectedEncounterData = this.queryResult[encounterID];

		//TODO: need to handle attachment changes/new attachments
		//TODO: also need to make sure all required fields are filled in somehow 

		var oneToOneEdits = {},
			oneToManyEdits = {},
			sqlStatements = [],
			sqlParameters = [],
			multipleSelectStatements = [],
			multipleSelectParameters = [],
			inserts = []; // for updating query result after save
		//var fileUploads = {};

		const queryRecord = _this.queryResult[_this.selectedID];

		for (const input of $dirtyInputs) {
			const $input = $(input);
			let inputValue = $input.val();
			const fieldName = $input.attr('name');
			const $accordion = $input.closest('.accordion.form-item-list');

			if ($input.is('.short-distance-field')) {
				const $unitsSelect = $(`.short-distance-select[data-calculation-target="#${input.id}"]`);
				inputValue = Math.round(inputValue / UNIT_PER_METER_MAP.get($unitsSelect.val()));
			}

			var tableName = '';
			if ($accordion.length) { 
				tableName = $accordion.data('table-name');
			} else {
				const fieldInfo = entryForm.fieldInfo[fieldName]; 
				if (fieldInfo) {
					tableName = fieldInfo.table_name;
				} else {
					continue;
				}
			}
			
			// If the field is inside an accordion, it belongs to a 1-to-many relationship and 
			//	there could, therefore, be multiple objects with this column. In that case,
			//	append it to the appropriate object (as IDed by the index of the card)
			if ($accordion.length) {
				// If this is the first time a field has been changed in this 
				//	table, oneToManyEdits[tableName] will be undefined
				if (!oneToManyEdits[tableName]) oneToManyEdits[tableName] = {};
				const tableUpdates = oneToManyEdits[tableName];

				// Get the index of this card within the accordion
				const index = $input.closest('.card').index() - 1;//attr('id').match(/\d+$/)[0];
				
				if (!tableUpdates[index]) tableUpdates[index] = {id: undefined, values: {}};
				// If this tableName doesn't exists as a key in the entryForm's fieldValues,
				//	this is the first card in this accordion and the first row in a 1-to-many
				//	relationship for this table and this encounter. In that case, the id will 
				//	remain undefined. Otherwise, set the ID so the item can be updated
				if (entryForm.fieldValues[tableName] != undefined) {
					
					if (tableName in queryRecord && index in queryRecord[tableName] && index in entryForm.fieldValues[tableName]) {
						// Get DB row ID from queryResult because entryForm.fieldValues doesn't have it
						tableUpdates[index].id = (queryRecord[tableName][index] || {}).id; // will be undefined if this is a new card
					} else {
						tableUpdates[index].id = undefined;
					}
				} 
				tableUpdates[index].values[fieldName] = inputValue;
			} else if ($input.is(`.${MULTIPLE_SELECT_ENTRY_CLASS}`)) { 
				// Add a DELETE statement to remove any existing records, 
				//	then just insert whatever the current values are
				sqlStatements.push(`DELETE FROM ${tableName} WHERE encounter_id=$1;`)
				sqlParameters.push([encounterID]);

				const [statements, params] = entryForm.getMultipleSelectSQL(input, encounterID);
				// Because there could be other inserts that the tables for multiple selects
				//	depend on, these should be last in the execution order
				multipleSelectStatements = [...multipleSelectStatements, ...statements];
				multipleSelectParameters = [...multipleSelectParameters, ...params];

			} else {
				if (!oneToOneEdits[tableName]) oneToOneEdits[tableName] = {};
				oneToOneEdits[tableName][fieldName] = inputValue;
			}
		}

		// Add meta fields to encounters table
		if (!('encounters' in oneToOneEdits)) oneToOneEdits.encounters = {};
		oneToOneEdits.encounters.last_edited_by = entryForm.username;
		oneToOneEdits.encounters.datetime_last_edited = getFormattedTimestamp();
		
		for (const tableName in oneToOneEdits) {
			const updates = oneToOneEdits[tableName];

			// if every field in this table is undefined in the queryResult, 
			//	this needs to be an insert. Otherwise, it's an update
			const tableValues = Object.values(entryForm.fieldInfo)
				.filter(i => i.table_name === tableName)
				.map(i => queryRecord[i.field_name]);
			const isInsert = tableValues.every(v => v === undefined);
			var sql,
				parameters;
			if (isInsert) {
				updates.encounter_id = _this.selectedID;
				[sql, parameters] = _this.getInsertSQL(tableName, updates, 'id');
				inserts.push({
					sqlIndex: sqlStatements.length,
					tableName: tableName, 
					fieldValues: {...updates}
				});
			} else {
				// If this is just a normal table update (not part of a 1-to-many relationship), 
				//	just construct the UPDATE statement
				const idField = tableName === 'encounters' ? 'id' : 'encounter_id';
				[sql, parameters] = _this.getUpdateSQL(tableName, updates, idField, _this.selectedID);
			}
			sqlStatements.push(sql);
			sqlParameters.push(parameters);
		} 

		const getSQL = (tableName, cardID, dbID, values) => {
			if (dbID === undefined) {
				// new row that needs to be INSERTed
				// Add the encounter_id field, since all related records need this
				values['encounter_id'] = _this.selectedID;
				const [sql, parameters] = _this.getInsertSQL(tableName, values, 'id');
				inserts.push({
					sqlIndex: sqlStatements.length,
					tableName: tableName,
					fieldValues: {...values},
					tableIndex: cardID
				});
				sqlStatements.push(sql);
				sqlParameters.push(parameters);
			} else {
				// just a regular UPDATE
				var [sql, parameters] = _this.getUpdateSQL(tableName, values, 'id', dbID);
				sqlStatements.push(sql);
				sqlParameters.push(parameters);			
			}
		}
		// Create SQL statements for all other updates
		for (const tableName in oneToManyEdits) {
			// skip attachments for now
			if (tableName === 'attachments') continue;

			// Either UPDATE the proper row or INSERT if this is a new row
			const updates = oneToManyEdits[tableName];
			for (const cardID in updates) {
				const dbID = updates[cardID].id;
				var values = {...updates[cardID].values};
				getSQL(tableName, cardID, dbID, values);
			}
		}

		// Gather info from any attachments where the actual attachment (not associated fields)
		//	were updated
		var failedFiles = [];
		var fileUploadDeferreds = [];
		if ('attachments' in oneToManyEdits) {
			updates = oneToManyEdits.attachments;
			for (const attachmentIndex in updates) {
				if ('uploadedFile' in updates[attachmentIndex].values) {
					const uploadInfo = updates[attachmentIndex];
					const $fileInput = $('#attachment-upload-' + attachmentIndex);
					const fileInput = $fileInput[0];
					const fileName = $fileInput.siblings('.filename-label').text();
					const filePath = $fileInput.closest('.card').find('.file-thumbnail').data('file-path');
					const timestamp = getFormattedTimestamp();
					fileUploadDeferreds.push(
						saveAttachment(fileInput)
							.done(resultString => {
								if (resultString.trim().startsWith('ERROR')) {
									failedFiles.push(fileName);
									return false;
								} else {
									const result = $.parseJSON(resultString);
									const thisFile = fileInput.files[0];
									delete uploadInfo.values.uploadedFile;
									attachmentValues = {
										client_filename: fileName,
										file_path: result.filePath,//should be the saved filepath (with UUID)
										file_size_kb: Math.floor(thisFile.size / 1000),
										mime_type: thisFile.type,
										attached_by: entryForm.username,//retrieved in window.onload()
										datetime_attached: timestamp,
										last_changed_by: entryForm.username,
										datetime_last_changed: timestamp,
										thumbnail_filename: result.thumbnailFilename || null,
										...uploadInfo.values
									}
									
									const $thumbnail = $fileInput.parent()
										.siblings('.file-preview-container')
											.find('.file-thumbnail');
									if (result.thumbnailFilename) $thumbnail.attr('src', 'attachments/' + result.thumbnailFilename);
									$thumbnail.data('file-path', result.filePath);

									// delete old file if this is an update
									if (filePath) {
										//$.ajax({...})
									}

									getSQL('attachments', attachmentIndex, uploadInfo.id, attachmentValues);
								}
							})
							.fail((xhr, status, error) => {
									console.log(`File upload for ${fileName} failed with status ${status} because ${error}`);
									failedFiles.push(fileName);
							})
					);
				}
			}
		}


		// Add SQL statements for multiple selects last
		sqlStatements = [...sqlStatements, ...multipleSelectStatements];
		sqlParameters = [...sqlParameters, ...multipleSelectParameters];
		
		return $.when(
			...fileUploadDeferreds
		).then(() => {
			
			if (failedFiles.length) {
				const message = `
					The following files could not be saved to the server:<br>
					<ul>
						<li>${failedFiles.join('</li><li>')}</li>
					</ul>
					<br>Your encounter was not saved as a result. Check your internet and network connection, and try to submit the encounter again.`;
				hideLoadingIndicator();
				showModal(message, 'File uploads failed');
				return $.Deferred().reject();
			}

			// In case this dummy function isn't implemented, only do reassign the sql vars if 
			//	beforeSaveCustomAction returns something
			const beforeSaveResult = _this.beforeSaveCustomAction(sqlStatements, sqlParameters);
			if (beforeSaveResult && beforeSaveResult.length === 2) [sqlStatements, sqlParameters] = beforeSaveResult;

			// Send queries to server
			return $.ajax({
				url: 'bhims.php',
				method: 'POST',
				data: {action: 'paramQuery', queryString: sqlStatements, params: sqlParameters},
				cache: false
			}).done((queryResultString) => {
				queryResultString = queryResultString.trim();

				//hideLoadingIndicator();

				if (queryReturnedError(queryResultString)) {
					showModal(`An unexpected error occurred while saving data to the database: ${queryResultString.trim()}.`, 'Unexpected error')
					return $.Deferred().reject();
				} else {
					// For any INSERTs, the result will contain the id from the associated table for the new record
					const result = $.parseJSON(queryResultString);

					$dirtyInputs.removeClass('dirty');
					// Set values in the in-memory queried data so when this record is reloaded, it has the right values
					for (const tableName in oneToOneEdits) {
						const updates = oneToOneEdits[tableName];
						for (const fieldName in updates) {
							selectedEncounterData[fieldName] = updates[fieldName];
						}
					}
					// Update in-memory data. For one-to-one tables, this just means adding
					//	each field's values to the queryResult record. For one-to-many,
					//	results need to be added to both the queryResult and fieldValues
					for (const {sqlIndex, tableName, fieldValues, tableIndex} of inserts) {
						// tableIndex is only defined for one-to-many inserts
						if (tableIndex === undefined) {
							// this is a one-to-one update
							for (const [name, value] of Object.entries(fieldValues)) {
								selectedEncounterData[name] = value;
							}
						} else {
							// Only INSERTs will return an ID. Otherwise, the return result will be null
							fieldValues.id = (result[sqlIndex] || {}).id;

							// If this was an insert, no record exists in the queried data yet
							if (!selectedEncounterData[tableName]) {
								selectedEncounterData[tableName] = [];
							}
							const selectedRowData = selectedEncounterData[tableName][tableIndex];
							if (!selectedRowData) {
								selectedEncounterData[tableName][tableIndex] = {...fieldValues};
							} else {
								for (fieldName in fieldValues) {
									if (fieldName in selectedRowData) {
										selectedRowData[fieldName] = fieldValues[fieldName];
									}
								}
							}

							// Use deep copy to avoid tying fieldValues to queryResult
							entryForm.fieldValues[tableName] = deepCopy(selectedEncounterData[tableName])
						}
					}

					// Call in case it's implemented in bhims-custom.js
					_this.afterSaveCustomAction()
				}
			}).fail((xhr, status, error) => {
				showModal(`An unexpected error occurred while saving data to the database: ${error}.`, 'Unexpected error');
			}).always(() => {hideLoadingIndicator()}); 
		})
	}


	/*
	Event handler for .save-button
	*/
	Constructor.prototype.onSaveButtonClick = function(e) {
		
		e.stopPropagation();
		showLoadingIndicator();
		_this.saveEdits();
	}

	/*
	Helper function to reset a select to the default option and with the default class
	*/
	Constructor.prototype.resetSelectDefault = function($select){
		const placeholder = $select.attr('placeholder');
		const $options = $select.children();
		var $placeholderOption = $options.filter((_, el) => {return el.value === placeholder});
		if (!$placeholderOption.length) {
			$placeholderOption = $options.first()
				.before(
					`<option value="${placeholder}">${placeholder}</>`
				);
		}

		$select.addClass('default')
			.val(placeholder);
	}

	/*** Event Handlers ***/
	/*
	Query the DB if the user has specified any query parameters
	*/
	Constructor.prototype.onRunQueryClick = function() {

		// Check that the user has actually specified options
		var hasQueryOptions = false;
		for (const tableName in _this.queryOptions.where) {
			if (Object.keys(_this.queryOptions.where[tableName]).length) {
				hasQueryOptions = true;
				break;
			}
		}
		if (!hasQueryOptions) {
			showModal('You have not selected or specified any query options to filter query results. Once you have added a field, add or change the value to filter results based on that field.', 'No query options selected')
			return;
		}

		_this.runDataQuery(_this.queryOptions);
		$('#show-query-options-container').removeClass('open');

	}


	/*
	Set onclick event for newly created result list items
	*/
	Constructor.prototype.onResultItemClick = function(e) {
		
		const newResultID = e.target.closest('li').id;

		// Check if any inputs were changed
		if ($('.input-field.dirty:not(.ignore-on-insert)').length && _this.fieldsFull) {
			_this.confirmSaveEdits(`bhimsQuery.switchEncounterRecord('${newResultID}');`);
		} else {
			_this.switchEncounterRecord(newResultID);
		}

	}


	/*
	Show a point on the query result map as selected and zoom to it
	*/
	Constructor.prototype.selectResultMapPoint = function() {

		// Use the style function to set the color of the points
		_this.queryResultMapData.resetStyle();

		// Set the center of the map on the selected point
		for (const feature of _this.queryResultMapData.toGeoJSON().features) {
			if (feature.id == _this.selectedID) {
				const coordinates = feature.geometry.coordinates;
				// geometry.coordinates is annoyingly [x, y] but .panTo() requires lat, lon
				_this.queryResultMap.panTo({lon: coordinates[0], lat: coordinates[1]});

				_this.queryResultMapData.eachLayer(layer => {
					if (layer.feature.id === feature.id) layer.bringToFront();
				})

				break;
			}
		}

		// Scroll to the selected list item
		const $selectedItem = $('.query-result-list-item.selected');//new item is already selected
		const $resultList = $('#query-result-list');//;
		const scrollPosition = $resultList.scrollTop();
		const listHeight = $resultList[0].clientHeight;
		const rowHeight = $selectedItem.first()[0].clientHeight;
		const elementIndex = $selectedItem.index();
		const scrollTo = elementIndex * rowHeight - rowHeight;

		// Check if the user has reduced motion set
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

		// scroll to the row if it's off the screen
		if (scrollTo < scrollPosition || scrollTo > scrollPosition + listHeight - rowHeight) {
			$resultList.parent()
				.animate(
					{scrollTop: scrollTo < 0 ? 0 : scrollTo}, 
					!mediaQuery || mediaQuery.matches ? 
						0 : // reduced motion
						300 // no preference set, so animate
				);
		}
	}


	/*
	Set appropriate values for field that show/hide accordion collapses
	*/
	Constructor.prototype.setImplicitBooleanField = function($accordion) {
		
		const $targetField = $($accordion.data('dependent-target'));
		if ($targetField.data('lookup-table') === 'boolean_response_codes') {
			$targetField.val($accordion.find('.card:not(.cloneable)').length ? 1 : 0).change();
		}
	}


	/*
	Helper function to set all implicit boolean fields
	*/
	Constructor.prototype.setAllImplicitBooleanFields = function () {
		// Set value for all boolean fields that show/hide accordions
		for (const el of $('.accordion.collapse')) {
			_this.setImplicitBooleanField($(el));
		}

		for (const targetField of $('.boolean-collapse-trigger')) {
			const htmlID = targetField.id;
			const $dependentFields = $('.input-field').filter((_, el) => {
				return $(el).data('dependent-target') === '#' + htmlID
			});
			var collapsed = true;
			if ($dependentFields.length) {
				for (const el of $dependentFields) {
					if (el.value != null && el.value !== '') {
						collapsed = false;//show the collapse
						break;
					}
				}	
				$(targetField).val(collapsed ? 0 : 1).change();
			}
			
		}
	}


	/*
	Determine the "reaction by" field from the reaction code 
	*/
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
				const reactionRows = this.queryResult[this.selectedID].reactions || [];
				if (reactionRows.length) {
					for (const i in reactionRows) {
						// Get reaction code
						const reaction = reactionRows[i];
						const reactionLookup = reactionCodesTable[reaction.reaction_code];
						// Determine reaction_by and fill value
						reactionRows[i].reaction_by = reactionLookup ? reactionLookup.action_by : null;
					}
					deferred.resolve();
				} else {	
					deferred.resolve();
				}
			}	
		})

		return deferred;

	}


	/*
	Make sure the "Describe location by:" field matches the entry in the database
	*/
	Constructor.prototype.setDescribeLocationByField = function() {
		const queryData = _this.queryResult[_this.selectedID];
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


	Constructor.prototype.onEncounterDataLoaded = function() {
		//dummy function
	}


	/*
	Event handler for the query options button
	*/
	Constructor.prototype.onShowQueryOptionsClick = function(e) {
		$(e.target).closest('.header-menu-item-group').toggleClass('open');
	}


	/* 
	When a meters/feet units field changes, set the value of the associated distance field. 
	This should happen in the review/query form but not in the entry form because when the user 
	enters a value in the entry form, it has not yet been determined what the units are. 
	Once the value is in the database, though, it will only be stored in meters. So if a user 
	just changes the units, presumably the don't intend to change the actual distance.
	*/
	Constructor.prototype.onShortDistanceUnitsFieldChange = function(e) {
		const $target = $(e.target);
		const units = $target.val();
		conversionFactor = UNIT_PER_METER_MAP.get(units)
		const $valueField = $target.closest('.field-container')
			.find('.flex-field-container')
				.find('.input-field');
		const distanceInMeters = entryForm.fieldValues[$valueField.attr('name')];
		if (!$valueField.hasClass('dirty')) {
			$valueField.val(
				Math.round(distanceInMeters * conversionFactor)
			);
		}
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
			zoom: mapZoom || 9,
			maxZoom: 15
		});

		var tilelayer = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}', {
			attribution: `Tiles &copy; Esri &mdash; Source: <a href="http://goto.arcgisonline.com/maps/USA_Topo_Maps" target="_blank">Esri</a>, ${new Date().getFullYear()}`
		}).addTo(map);

		return map;
	}


	/* 
	Get the code/value pairs for all lookup tables 
	*/
	Constructor.prototype.getLookupValues = function() {
		
		const sql = `
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema='${entryForm.dbSchema}' AND table_name LIKE '%_codes';
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


	Constructor.prototype.setSliderHandleLabel = function($sliderContainer, handleIndex, handleValue) {
		
		const $sliderRange = $sliderContainer.find('.ui-slider-range').first();
		const rangeLeft = $sliderRange.css('left');
		const rangeWidth = $sliderRange.css('width');

		// Set the value of the slider handle's label
		$label = $($sliderContainer.find('.query-slider-label')[handleIndex]);
		$label.text(handleValue);

		// Set the width of the input to be just wide enough to handle the value's width
		const $input = $($sliderContainer.find('input.slider-value')[handleIndex]);
		$input.val(handleValue);
		$input.css('width', (($input[0].value.length + 1) * 8) + 'px');
	}


	/*
	Return a count of encounter records that will be returned with the given query params
	*/
	Constructor.prototype.countQueryEncounters = function() {

		const [sql, _] = this.getEncountersSQL(this.queryOptions);
		const countSQL = `SELECT count(*) FROM (${sql}) AS t;`;
		return queryDB(countSQL).done(queryResultString => {
			if (queryReturnedError(queryResultString)) { 
				console.log(`error query encounters table: ${queryResultString}`);
			} else {
				const result = $.parseJSON(queryResultString);
				if (result.length) {
					const count = parseInt(result[0].count);
					const isSameAsTotal = count === this.encounterIDs.length;
					const $countText = $('#query-encounters-count')
					$('#query-result-count').toggleClass('invisible', isSameAsTotal)
					$countText.text(count);
					if (!isSameAsTotal) runCountUpAnimations();
				}

			}
		});
	}


	/*
	Helper function to show/hide the copy query link button. This is called 
	when a query option or the case-sensitive switch changes 
	*/
	Constructor.prototype.toggleCopyQueryLinkButton = function() {
		// If this was the last query option, hide the copy-permalink button
		var queryOptionsSpecified = false;
		for (const tableName in _this.queryOptions.where) {
			if (Object.keys(_this.queryOptions.where[tableName]).length) {
				queryOptionsSpecified = true;
				break;
			}
		}
		$('#copy-query-link-button').toggleClass('invisible', !queryOptionsSpecified);
	}


	Constructor.prototype.onQueryOptionChange = function(e) {
		
		_this.toggleCopyQueryLinkButton();
		
		// Make the tab label appear selected
		const $target = $(e.target);
		const $tabContent = $target.closest('.tab-content');
		$tabContent
			.siblings('.tab-label')
			.toggleClass('active', 
				$tabContent.find('.query-option-container:not(.hidden)').length > 0
			);

		// Change the query count preview
		_this.countQueryEncounters();
	}


	Constructor.prototype.configureQueryOptions = function() {
		
		showLoadingIndicator()

		// Configure query options
		// Get numeric field min/max
		var numericFieldRanges = {};
		var valueRangeTrigger = $.Deferred();
		var valueRangeDeferreds = [valueRangeTrigger];

		// Query the DB to get the numeric fields per table
		queryDB(`
			SELECT 
				table_name, 
				string_agg(field_name, ',' ORDER BY field_name) AS fields
			FROM data_entry_fields 
			WHERE 
				is_enabled AND 
				html_input_type='number' AND 
				field_name IS NOT NULL AND 
				table_name IS NOT NULL
			GROUP BY table_name
			;
		`).done(queryResultString => {
			if (queryReturnedError(queryResultString)) { 
				console.log(`error getting numeric fields: ${queryResultString}`);
			} else {
				const queryResults = $.parseJSON(queryResultString);
				for (const i in queryResults) {
					const row = queryResults[i];
					const fieldNames = row.fields.split(',');
					const minString = fieldNames.map(fieldName => {
						return `min(${fieldName}) AS min_${fieldName}`
					}).join(', ');
					const maxString = minString.replace(/min/g, 'max');
					
					const deferred = queryDB(
						`SELECT '${row.table_name}' as table_name, ${minString}, ${maxString} FROM ${row.table_name} GROUP BY table_name;` 
					).then(resultString => {
						if (queryReturnedError(resultString)) { 
							console.log(`error getting value ranges: ${queryResultString}`);
						} else {
							// Each result will be a single row
							const result = $.parseJSON(resultString)[0];
							const tableName = result.table_name;
							numericFieldRanges[tableName] = {};
							for (field in result) {
								if (field === 'table_name') continue;
								const fieldType = field.match(/^min_|^max_/).toLocaleString();
								const fieldName = field.replace(fieldType, '');
								if (!numericFieldRanges[tableName][fieldName]) numericFieldRanges[tableName][fieldName] = {};
								numericFieldRanges[tableName][fieldName][fieldType.replace('_', '')] = result[field];
							}

							// If this is the last deferred, resolve the trigger so the next query will run
							// 	Removing each one once it's processed and checking that queryResults is empty
							//	is the best way to do this because the asynchronous processing can happen out
							//	of order
							queryResults.pop(queryResults[i]);
							if (!queryResults.length) valueRangeTrigger.resolve(); 
						}
					})
					valueRangeDeferreds.push(deferred);
				}
			}
		})

		// valueRangeDeferreds should all resolve to the query result string, so process 
		//	each one and save the result to the numericFieldRanges object
		const configurationComplete = $.Deferred();

		$.when(
			...valueRangeDeferreds
		).then(() => {
			const queryOptionSQL = `
				SELECT 
					id, 
					table_name, 
					field_name, 
					html_input_type, 
					html_id, 
					display_name, 
					description 
				FROM data_entry_fields 
				WHERE 
					is_enabled AND 
					table_name IS NOT NULL AND 
					css_class NOT LIKE '%boolean-collapse-trigger%' 
				ORDER BY table_name, display_order;
			`; 
			queryDB(queryOptionSQL).then(queryResultString => {
				if (queryReturnedError(queryResultString)) { 
					console.log(`error configuring query options: ${queryResultString}`);
				} else {
					queryOptionConfig = {};
					var queryResults = $.parseJSON(queryResultString);
					// Add other fields
					const otherQueryOptions = [
						{id: 998, table_name: 'attachments', field_name: 'file_size_kb', html_input_type: 'number', html_id: 'input-file_size_kb', display_name: 'File size (kb)', description: 'File size of the attachment'},
						{id: 999, table_name: 'attachments', field_name: 'client_filename', html_input_type: 'text', html_id: 'input-client_filename', display_name: 'File name', description: 'Name of the attached file'},
						{id: 0, table_name: 'encounters', field_name: 'id', html_input_type: 'select', html_id: null, display_name: 'Encounter ID', description: 'Database ID of this record in the "encounters" table'}
					];
					numericFieldRanges.attachments = {};
					numericFieldRanges.attachments.file_size_kb = {min: 1, max: 1000000};
					const queryOptionInfo = [...queryResults, ...otherQueryOptions];
					
					for (const row of queryOptionInfo) {
						const tableName = row.table_name;
						if (!queryOptionConfig[tableName]) queryOptionConfig[tableName] = [];
						queryOptionConfig[tableName].push({...row});
					}

					for (tableName in queryOptionConfig) {
						this.queryOptions.where[tableName] = {};
						const titlecaseTableName = `${tableName[0].toUpperCase()}${tableName.slice(1).replace('_', ' ')}`;
						const $tab = $(`
							<li>
								<input id="tab-${tableName}" class="tab-button" type="radio" name="tabs">
								<label id="tab-label-${tableName}" for="tab-${tableName}"
									class="tab-label" 
									role="tab" 
									aria-selected="false" 
									aria-controls="tab-content-${tableName}" 
									tabindex="0">
									${titlecaseTableName}
							    </label>
							    <div id="tab-content-${tableName}" 
									class="tab-content" 
									role="tabpanel" 
									aria-labelledby="tab-label-${tableName}" 
									aria-hidden="false">
									<div class="tab-field-list-container"></div
								</div>
							</li>
						   `).appendTo('#query-options-drawer-body > .tabs');

						const $exportTab = $(`
							<li id="export-tab-${tableName}" class="data-export-table-tab" data-table-name="${tableName}">
								<button id="export-tab-button-${tableName}" class="tab-label export-data-tab-button" role="tab" data-toggle="collapse" data-target="#export-tab-content-${tableName}" aria-controls="export-tab-content-${tableName}" tabindex="0">
									<span class="export-tab-label">${titlecaseTableName}</span>
									<button class="icon-button remove-table-tab-button" role="button" data-target="#removed-table-${tableName}">
										<i class="fas fa-md fa-times"></i>
									</button>
							    </button>
							</li>
					   `).appendTo('#export-field-options-body > .tabs')
						const $contentCollapse = $(`
						    <div id="export-tab-content-${tableName}" class="export-tab-content collapse" role="tabpanel" aria-labelledby="export-tab-label-${tableName}" data-table-name="${tableName}"aria-hidden="true">
								<div class="tab-field-list-container export-fields-list"></div>
								<div class="tab-field-list-container removed-fields-list">
									<h5 class="field-list-header w-100 mt-2 hidden">Removed fields</h5>
								</div>
							</div>
						`).appendTo('.export-field-collapse-container');

						// Add table to list of (currently hidden) removed tables so they can be toggled on
						//	when the user clicks the "remove" button in the tab label
						$(`
							<label id="removed-table-${tableName}" class="field-list-item hidden" data-table-name="${tableName}">
								<span>${titlecaseTableName}</span>
								<button id="button-add-${tableName}" class="icon-button include-export-table-button" data-target="#export-tab-${tableName}" aria-label="Add table to export" title="Add ${titlecaseTableName} to export">
									<i class="fas fa-plus"></i>
								</button>
							</label>
						`).appendTo('.export-field-options-footer');

						// Configure options for each field
						for (option of queryOptionConfig[tableName]) {
							const fieldName = option.field_name;
							var $optionContent = null;

							// Add query option
							$(`
								<label class="field-list-item">
									<button id="button-add-${fieldName}" class="icon-button add-field-query-option-button" data-target="#query-option-${fieldName}" aria-label="Add query option">
										<i class="fa fa-plus" aria-hidden="true"></i>
									</button>
									<span>${option.display_name}</span>
								</label>
							`).appendTo($tab.find('.tab-field-list-container'));

							// Add export option for removing this field
							$(`
								<label id="included-field-${fieldName}" class="field-list-item">
									<span>${option.display_name}</span>
									<button id="button-remove-${fieldName}" class="icon-button remove-export-field-button" data-target="#removed-field-${fieldName}" data-field-name="${fieldName}" aria-label="Remove field from export">
										<i class="fas fa-times"></i>
									</button>
								</label>
							`).appendTo($contentCollapse.find('.tab-field-list-container.export-fields-list'));
							
							// Add export option to add this field back in
							$(`
								<label id="removed-field-${fieldName}" class="field-list-item hidden">
									<span>${option.display_name}</span>
									<button id="button-add-${fieldName}" class="icon-button include-export-field-button" data-target="#included-field-${fieldName}" aria-label="Add field to export" title="Add ${option.display_name} field to export">
										<i class="fas fa-plus"></i>
									</button>
								</label>
							`).appendTo($contentCollapse.find('.tab-field-list-container.removed-fields-list'));

							// Configure option depending on html_input_type
							switch (option.html_input_type) {
								case 'text':
								case 'textarea':
								case 'email':
								case 'tel':
									$optionContent = $(`
										<div class="query-option-container hidden">
											<div class="query-option-condition-container">
												<select class="query-option-operator string-match-query-option text-string-query-option" value="equals">
													<option value="equals">equals</option>
													<option value="notEqual">does not equal</option>
													<option value="startsWith">starts with</option>
													<option value="endsWith">ends with</option>
													<option value="contains">contains</option>
													<option value="is null">is null</option>
													<option value="is not null">is not null</option>
												</select>
												<input id="query-option-${fieldName}" class="query-option-input-field string-match-query-option" type="text" data-field-name="${fieldName}" data-table-name="${tableName}" data-display-name="${option.display_name}">
											</div>
										</div>
									`); 
									break;
								case 'number':
									var thisMin;
									try{
										thisMin = numericFieldRanges[tableName][fieldName].min || 0;
									} catch {
										a=1
									}
									const thisMax = numericFieldRanges[tableName][fieldName].max || 100;
									$optionContent = $(`
										<div class="query-option-container hidden">
											<div class="query-option-condition-container">
												<div id="query-option-${fieldName}" class="slider-container query-option-input-field" data-field-name="${fieldName}" data-table-name="${tableName}" data-display-name="${option.display_name}">
													<div class="query-slider-label-container">
														<input class="slider-value slider-value-low" type="number" value=${thisMin} min=${thisMin} max=${thisMax}>
														<input class="slider-value slider-value-high" type="number" value=${thisMax} min=${thisMin} max=${thisMax}>
													</div>
												</div>
											</div>	
										</div>	
									`)
									
									const sliderOptions = {
										range: true,
										min: Math.ceil(thisMin / 10) * 10,
										max: Math.ceil(thisMax / 10) * 10,
										values: [thisMin, thisMax],
										disabled: numericFieldRanges[tableName][fieldName].min == null, //if it's null, nothing's been entered in this field
										slide: (e, slider) => {
											// Set the query option clause
											const $sliderContainer = $(slider.handle).closest('.slider-container');
											const tableName = $sliderContainer.data('table-name');
											const fieldName = $sliderContainer.data('field-name');
											this.queryOptions.where[tableName][fieldName] = {value: `${slider.values[0]} AND ${slider.values[1] + 1}`, operator: 'BETWEEN', type: 'numeric'};//`${tableName}.${fieldName} BETWEEN ${slider.values[0]} AND ${slider.values[1] + 1}`;

											// Show the copy-permalink button
											$('#copy-query-link-button').removeClass('hidden');
											
											// Set the location of the slider handle's label
											const $sliderRange = $sliderContainer.find('.ui-slider-range').first();
											const handleIndex = slider.handleIndex;
											const sliderValue = slider.values[handleIndex];
											
											this.setSliderHandleLabel($sliderContainer, handleIndex, sliderValue);

											// Set value of the handle's input val
											const sliderValueInput = $sliderContainer//.siblings('.slider-value-input-container')
												.find('input.slider-value').get(handleIndex);
											sliderValueInput.value = sliderValue;
										},
										stop: (e, slider) => {
											_this.onQueryOptionChange(e);
										}
									}
									
									$optionContent.find('.slider-container').slider(sliderOptions);

									break;
								case 'datetime-local':
								case 'date':
								case 'time':
									$optionContent = $(`
										<div class="query-option-container hidden">
											<div class="query-option-condition-container">
												<select class="query-option-operator datetime-query-option" value="equals">
													<option value="=">equals</option>
													<option value="<=">is before</option>
													<option value=">=">is after</option>
													<option value="BETWEEN">is between</option>
													<option value="is null">is null</option>
													<option value="is not null">is not null</option>
												</select>
												<input id="query-option-${fieldName}" class="query-option-input-field single-value-field datetime-query-option" type="${option.html_input_type}" data-field-name="${fieldName}" data-table-name="${tableName}" data-display-name="${option.display_name}" >
												<div class="query-option-double-value-container hidden">
													<input class="query-option-input-field double-value-field low-value-field datetime-query-option" type="${option.html_input_type}" data-field-name="${fieldName}" data-table-name="${tableName}" data-display-name="${option.display_name}" aria-hidden="true">
													<span>and</span>
													<input class="query-option-input-field double-value-field high-value-field datetime-query-option" type="${option.html_input_type}" data-field-name="${fieldName}" data-table-name="${tableName}" data-display-name="${option.display_name}" aria-hidden="true">
												</div>
											</div>
										</div>
									`);
									break;
								case 'select':
									//collection of checkboxes
									
									$optionContent = $(`
										<div class="query-option-container hidden">
											<div class="query-option-condition-container checkbox-option-group">
												<select id="query-option-${fieldName}" class="input-field query-option-input-field select2-no-tag" multiple="multiple" data-field-name="${fieldName}" data-table-name="${tableName}" data-display-name="${option.display_name}">
												</select>
											</div>
										</div>
									`);
									var $selectOptions;
									if (option.display_name === 'Encounter ID') {
										// map an <option> from each ID
										$selectOptions = $(this.encounterIDs.map((id) => {return `<option value=${id}>${id}</option>`}).join(''));
									} else {
										const $select = $('#' + option.html_id);
										$selectOptions = $select.find('option')
											.filter((_, el) => {return el.value != ''});
									}
									$optionContent.find('select').append($selectOptions.clone());
									break;
								default:
									console.log(`Could not understand html_input_type ${option.html_input_type}`)
							}
							//reactions will need to be sequential series of selects

							// Add the option group and insert a header above it
							//$optionContent.appendTo($optionGroup.find('.query-option-group-container-body'))
							$optionContent.appendTo($tab.find('.tab-content'))
								.prepend(`
									<div class="query-option-condition-header">
										<label class="query-option-label">${option.display_name}</label>
										<button class="icon-button remove-query-option-button">
											<i class="fas fa-lg fa-times"></i>
										</button>
									</div>
								`);

						}
					}



					$('.select2-no-tag').select2({
						tokenSeparators: [',', ' '],
						dropdownCssClass: 'bhims-query-select2-dropdown-container',
						width: 'element'
					});

					// Add the query option when the plus button is clicked
					$('.add-field-query-option-button').click(e => {
						const $button = $(e.target).closest('.add-field-query-option-button');
						const $target = $($button.data('target'));
						const $container = $target.closest('.query-option-container').removeClass('hidden');
						$button.closest('.field-list-item').addClass('hidden');
					});

					$('.remove-query-option-button').click(e => {
						const $button = $(e.target).closest('.remove-query-option-button');
						const $container = $button.closest('.query-option-container')
							.addClass('hidden');
							//.fadeOut(500, (_, el) => {$(el).addClass('hidden')})
						
						const dataAttributes = $container.find('.query-option-input-field').data();
						const tableName = dataAttributes.tableName;
						const fieldName = dataAttributes.fieldName;

						$(`#button-add-${fieldName}`)
							.closest('.field-list-item')
							.removeClass('hidden');

						// Reset the inputs
						//	reset all regular selects to their default value
						for (const el of $container.find($('select:not(.select2-no-tag)'))) {
							const $select = $(el);
							$select.val($select.find('option').first().attr('value'));
						}
						
						// 	reset sliders
						const $sliderContainer = $container.find('.slider-container');
						const $sliderInputs = $sliderContainer.find('input.slider-value')
						const $lowerValueInput = $sliderInputs.first();
						const $upperValueInput = $sliderInputs.last();
						const min = $lowerValueInput.attr('min');
						const max = $lowerValueInput.attr('max');
						$lowerValueInput.last().val(min);
						$upperValueInput.last().val(max);
						$sliderContainer.slider('values', [min, max]);
						
						// reset all text/datetime fields
						$container.find(`
							.query-option-input-field.string-match-query-option, 
							.query-option-input-field.datetime-query-option
						`).val('')
						.filter('.string-match-query-option, .single-value-field')
							.removeClass('hidden');
						$('.query-option-double-value-container').addClass('hidden');

						// reset multi-selects
						$container.find('.select2-no-tag').val(null).trigger('change');

						//remove option from query
						delete _this.queryOptions.where[tableName][fieldName];

						_this.onQueryOptionChange(e);
					});

					$('.query-option-operator.datetime-query-option').change(e => {
						/*toggle the double or single value field*/
						const $target = $(e.target);
						const operatorValue = $target.val();
						const showDoubleValue = operatorValue === 'BETWEEN';
						$target.siblings('.single-value-field')
							.toggleClass('hidden', showDoubleValue)
							.attr('aria-hidden', showDoubleValue);
						$target.siblings('.query-option-double-value-container')
							.toggleClass('hidden', !showDoubleValue)
							.find('.double-value-field')
								.attr('aria-hidden', !showDoubleValue);
					});

					//** Capture query condition on change **//
					//	String fields
					$('.string-match-query-option').change(e => {
						const $target = $(e.target);
						const $operatorField = $target.parent().find('select.query-option-operator');
						const $valueField = $target.parent().find('input.query-option-input-field');
						const operatorValue = $operatorField.val();
						const tableName = $valueField.data('table-name');
						const fieldName = $valueField.data('field-name');
						const value = $valueField.val();
						const isNullOperator = operatorValue.endsWith(' null');

						// Show/hide the value field depending on whether the operator requires a value
						$valueField.toggleClass('hidden', isNullOperator);

						// exit if the user hasn't entered a value yet
						if (!isNullOperator && (value == null || value === '')) {
							delete this.queryOptions.where[tableName][fieldName];
							return;
						}	

						var queryClause = '';
						switch (operatorValue) {
							case 'equals':
								queryClause = {value: `'${value}'`, operator: '=', type: 'text'};
								break;
							case "notEqual":
								queryClause = {value: `'${value}'`, operator: '<>', type: 'text'};
								break;
							case 'startsWith':
								queryClause = {value: `'${value}%'`, operator: 'LIKE', type: 'text'};
								break;
							case 'endsWith':
								queryClause = {value: `'%${value}'`, operator: 'LIKE', type: 'text'};
								break;
							case 'contains':
								queryClause = {value: `'%${value}%'`, operator: 'LIKE', type: 'text'};
								break;
							case 'is null':
								queryClause = {value: 'NULL', operator: 'IS', type: 'text'};
								break;
							case 'is not null':
								queryClause = {value: 'NULL', operator: 'IS NOT', type: 'text'};
								break;
							default:
								console.log(`Could not underatnd operator ${$operatorField.val()} from #${operatorField.attr('id')}`)
						}
						
						this.queryOptions.where[tableName][fieldName] = queryClause;
					});

					$('input.slider-value').change(e => {
						/*Set the slider values when the input changes*/
						const $input = $(e.target);
						const index = $input.index();
						var value = parseInt($input.val());
						const dbMin = parseInt($input.attr('min'));
						const dbMax = parseInt($input.attr('max'));
						if (index == 0 && value < dbMin) {
							showModal(`The value entered is less than the minimum value found in the database. Try entering a value greater than ${dbMin}.`, 'Invalid value entered');
							value = dbMin;
							$input.val(dbMin);
						} else if (index == 1 && value > dbMax) {
							showModal(`The value entered is greater than the minimum value found in the database. Try entering a value less than ${dbMax}.`, 'Invalid value entered');
							$input.val(dbMax);
							value = dbMax;
						}
						const $parent = $input.closest('.query-option-condition-container');
						$parent.find('.slider-container')
							.slider('values', index, value);

						const $sliderRange = $parent.find('.slider-container').first();
						_this.setSliderHandleLabel($sliderRange, index, value);

						// Set query option
						const tableName = $sliderRange.data('table-name');
						const fieldName = $sliderRange.data('field-name');
						var values = $input.parent().find('input.slider-value').map((_, el) => {return el.value});
						_this.queryOptions.where[tableName][fieldName] = {value: `${values[0]} AND ${parseInt(values[1]) + 1}`, operator: 'BETWEEN'};
						_this.onQueryOptionChange(e);
					}).keyup(e => {
						/* Change the width of the input when the length of it changes*/
						$target = $(e.target)
						const $sliderRange = $target.closest('.slider-container');
						const index = $target.index();
						const value = $target.val();
						_this.setSliderHandleLabel($sliderRange, index, value);
					}).each((_, el) => {
						// Set the width of each slider label
						const $input = $(el);
						const index = $input.index();
						const value = $input.val();
						const $sliderRange = $input.closest('.query-option-condition-container')
							.find('.slider-container').first();
						_this.setSliderHandleLabel($sliderRange, index, value);
					});

					// Date fields
					$('.datetime-query-option').change(e => {
						const $container = $(e.target).closest('.query-option-condition-container');
						const $operatorField = $container.find('.query-option-operator');
						const operatorValue = $operatorField.val();
						const $valueField = $container.find('.query-option-input-field.single-value-field');
						const tableName = $valueField.data('table-name');
						const fieldName = $valueField.data('field-name');
						var queryClause = '';
						if (operatorValue == 'BETWEEN') {
							const lowValue = $container.find('.double-value-field.low-value-field').val();
							const highValue = $container.find('.double-value-field.high-value-field').val();
							
							// exit if the user hasn't entered a value for both fields yet
							if (lowValue == null || highValue == null || lowValue === '' || highValue === '') return;

							queryClause = {value: `'${lowValue}' AND '${highValue}'`, operator: 'BETWEEN'};//`${tableName}.${fieldName} BETWEEN '${lowValue}' AND '${highValue}'`;
						} else {
							const value = $valueField.val(); 
							
							// exit if the user hasn't entered a value yet
							if (value == null || value === '') {
								if (operatorValue.includes('null')) {
									
								} else {
									return;
								}
							}
							queryClause = {value: `'${value}'`, operator: operatorValue};//`${tableName}.${fieldName} ${operatorValue} '${value}'`
						}
						this.queryOptions.where[tableName][fieldName] = queryClause;
					});

					// selects
					$('.select2-no-tag').change(e => {
						const $select = $(e.target);
						const tableName = $select.data('table-name');
						const fieldName = $select.data('field-name');
						const valueString = $select.val().join(',');
						
						// If it's empty, remove the query option
						if (!valueString.length) {
							delete this.queryOptions.where[tableName][fieldName];
							return;
						}
						this.queryOptions.where[tableName][fieldName] = {value: `(${valueString})`, operator: 'IN'}
						_this.onQueryOptionChange(e);
					});

					// When a query option input loses focus, hide/show the copy-permalink button, depending on 
					//	whether the user has any query options specified
					$('.query-option-input-field').blur(_this.onQueryOptionChange);

					// When the user clicks the case-sensitive switch, run the result count query
					$('#case-sensitive-slider-container input[type=checkbox]').change(e => {
						this.countQueryEncounters();
						this.toggleCopyQueryLinkButton();
					});

					//Select the first tab
					$('.tabs').find('input[type="radio"]').first().click();

					// make sure all other export collapses collapse when a new one is clicked
					$('.export-data-tab-button').click(e => {
						const $button = $(e.target).closest('.export-data-tab-button');
						const $tab = $button.closest('.data-export-table-tab');
						
						// If this tab isn't selected, deselect the currently selected one
						if (!$tab.is('.selected')) {
							$('.data-export-table-tab.selected').removeClass('selected');
						}
						$tab.toggleClass('selected');

						const targetCollapseID = $button.data('target');
						$(`.export-tab-content.collapse.show:not(${targetCollapseID})`).collapse('hide');
					});

					// Event handlers to toggle removed/included tables and fields
					// 	The user is not allowed to remove the encounters table because it's required in the exported data 
					$('.remove-table-tab-button:not([data-target="#removed-table-encounters"])').click(e => {
						const $button = $(e.target).closest('button');
						const $tab = $button.closest('.data-export-table-tab').addClass('hidden');
						const $collapse = $($tab.find('.export-data-tab-button').data('target'))
							.addClass('hidden');
						const $removedTableTarget = $($button.data('target'));
						$removedTableTarget.removeClass('hidden');
					});
					// Instead of just disabling or removing the remove-table button, tell the user why they can't exclude it
					$('.remove-table-tab-button[data-target="#removed-table-encounters"]').click(() => {
						showModal(
							'The Encounters table is required in the export and cannot be excluded. You can, however, exclude specific fields from the Encounters table (except for Encounter ID, which is also required).', 
							'Encounters table required');
					})
					$('.include-export-table-button').click(e => {
						const $button = $(e.target).closest('button');
						$button.closest('.field-list-item').addClass('hidden');
						const $tab = $($button.data('target')).removeClass('hidden');
						const $collapse = $($tab.find('.export-data-tab-button').data('target'))
							.removeClass('hidden');
						const $removedTableTarget = $($button.data('target'));
						$removedTableTarget.removeClass('hidden');
					});
					// Same thing as the encounters table: the encounter id field is required
					$('.remove-export-field-button:not([data-field-name="id"])').click(e => {
						const $button = $(e.target).closest('button');
						$button.closest('.field-list-item').addClass('hidden');
						const $removedFieldTarget = $($button.data('target'));
						$removedFieldTarget.removeClass('hidden');
						// Show the header for the removed fields, since one was removed
						$button.closest('.export-tab-content')
							.find('.removed-fields-list > .field-list-header')
							.removeClass('hidden');
					});
					$('.remove-export-field-button[data-field-name="id"]').click(() => {
						showModal('The Encounter ID field is required in the export and cannot be excluded.', 'Encounter ID field required');
					});
					$('.include-export-field-button').click(e => {
						const $button = $(e.target).closest('button');
						$button.closest('.field-list-item').addClass('hidden');
						const $includeFieldTarget = $($button.data('target'));
						$includeFieldTarget.removeClass('hidden');
						// Toggle the header as visible or not depending on if there are any visible removed fields
						$button.closest('.export-tab-content')
							.find('.removed-fields-list > .field-list-header')
							.toggleClass('hidden', !$('.removed-fields-list .field-list-item:not(.hidden)').length);
					});
				}
				
				// Make sure a tab of the field export options tabs is shown
				$('.export-data-tab-button').first().click();

				configurationComplete.resolve(true);
				hideLoadingIndicator();
			})
		});

		return configurationComplete;
	}

	/*
	Show each section as a card in an accordion to allow the user 
	to more easily navigate to a section of interest
	*/
	Constructor.prototype.sectionsToAccordion = function() {

		$formSections = $('#row-details-pane').addClass('accordion')
			.find('.form-section')
				.addClass('card');
		
		for (const section of $formSections) {
			const $card = $(section); // this is now a card
			const $title = $card.find('.section-title');
			const titleText = $title.text();
			const sectionID = section.id;
			const $cardHeader = $(`
				<div class="card-header row-details-card-header" id="cardHeader-${sectionID}">
					<a class="card-link collapsed" data-toggle="collapse" href="#collapse-${sectionID}" data-target="#collapse-${sectionID}" aria-expanded="false">
						<div class="card-link-content card-link-title row-details-card-link-content">
							<h4 class="card-link-label row-details-card-link-label">${titleText}</h4>
						</div>
						<!--<div class="card-link-content row-details-card-card-link-content">
							<i class="fa fa-chevron-down pull-right fa-lg"></i>
						</div>-->
						<div class="card-link-content row-details-card-card-link-content">
							<div class="card-link-chevron"></div>
						</div>
					</a>
				</div>
			`).prependTo($card); // add the header to the card section
			
			$title.remove();

			const $collapse = $(`
				<div id="collapse-${sectionID}" class="collapse card-collapse row-details-card-collapse" aria-labelledby="cardHeader-${sectionID}">
				</div>
			`).appendTo($card);
			
			// Move section content to the collapse
			const $sectionContent = $card.find('.form-section-content')
				.addClass('card-body row-details-card-body')
				.appendTo($collapse);

		}
	}

	/* Helper method to retrieve user-specified query options */
	Constructor.prototype.getQueryOptions = function() {
		var options = {
			where: {},
			case_sensitive: $('#case-sensitive-slider-container input[type=checkbox]').prop('checked')
		};
		for (const tableName in _this.queryOptions.where) {
			const tableOptions = _this.queryOptions.where[tableName];
		    if (Object.keys(tableOptions).length) options.where[tableName] = {...tableOptions};
		}

		return options;
	}


	Constructor.prototype.prepareExport = function() {

		showLoadingIndicator('prepareExport');

		const sqlCriteria = this.getQueryOptions();
		const exportDBCodes = $('#input-export_codes').val() === 'yes';
		const exportAllFields = $('#input-select_fields').val() === 'all';
		
		var exportFields = {};
		const $tabs = $('#data-export-modal .data-export-table-tab' + (exportAllFields ? '' : ':not(.hidden)'));
		for (const tab of $tabs) {
			const $tab = $(tab);
			const tableName = $tab.data('table-name');
			const $tabContent = $(`.export-tab-content[data-table-name="${tableName}"]`);
			
			// If any fields were removed for this table, find out which ones to include
			const fieldSelector = exportAllFields ? 
				'.export-fields-list .remove-export-field-button' :
				'.export-fields-list .field-list-item:not(.hidden) .remove-export-field-button'
			;
			const fields = $tabContent.find(fieldSelector)
				.map((_, el) => $(el).data('field-name'))
				.get();
			exportFields[tableName] = fields;
		}

		const exportParams = JSON.stringify({
			include_codes: exportDBCodes,
			criteria: sqlCriteria,
			fields: exportFields 
		});

		return $.ajax({
			url: 'flask/export_data',
			method: 'POST',
			data: {action: 'exportData', exportParams: exportParams},
			cache: false
		}).done(resultString => {
			if (resultString.trim().startsWith('Traceback') || queryReturnedError(resultString)) {
				showModal('An unexpected error with the export occurred: ' + resultString, 'Export error')
				console.log(resultString)
			} else {
				window.location.href = resultString.trim();
			}
		}).fail((xhr, status, error) => {
			console.log(error)
		}).always(() => {
			hideLoadingIndicator();
		});
	}


	/*
	Configure the page
	*/
	Constructor.prototype.configureQuery = function() {

		showLoadingIndicator();

		// fillFieldValues dispatches a custom event indicating that all fields are filled
		//	After that happens, wait for .change events to finish, then remove the .dirty classs
		window.addEventListener('fields-full', e => {
			console.log(e.detail);
			setTimeout(
				()=>{
					$('.input-field').removeClass('dirty');
					_this.fieldsFull = true;
					hideLoadingIndicator('loadSelectedEncounter');
				}, 
				2000
			);
		})

		// Get username
		$.ajax({
			url: 'bhims.php',
			method: 'POST',
			data: {action: 'getUser'},
			cache: false
		}).done(function(resultString) {
			if (queryReturnedError(resultString)) {
				throw 'User role query failed: ' + resultString;
			} else {
				const result = $.parseJSON(resultString);
				$('#username').text(result[0].username);
			}
		});



		// Data export modal: when the field selection tabs are shown, expand the modal
		$('#input-select_fields').change(e => {
			const value = e.target.value;
			$('.data-export-modal-dialog').toggleClass('expanded', value === 'subset');
		})

		this.queryResultMap = this.configureMap('query-result-map');
		
		$('#show-query-options-button').click(this.onShowQueryOptionsClick);
		$('#run-query-button').click(this.onRunQueryClick);
		$('#copy-query-link-button').click(() => {
			const options = this.getQueryOptions();
			const url = encodeURI(`${window.location.href.split('?')[0]}?${JSON.stringify(options)}`);
			copyToClipboard(url, `Permalink for this query successfully copied to clipboard`);
		});

		// Set attribute to indicate that the initial .change event triggered by fillFieldValues() has or 
		//	has not been triggered. This is neessary so the .change event registered below knows whether 
		//	or not to add the .dirty class
		$('.input-field').data('manual-change-triggered', false);
		
		$.when(
			this.getTableSortColumns(),
			...this.getLookupValues(), 
			entryForm.configureForm(mainParentID='#row-details-pane', isNewEntry=false),
			this.getJoinedDataTables(),
			this.queryEncounterIDs()
		).always(() => {
			
			this.sectionsToAccordion();
			const configurationComplete = this.configureQueryOptions();
			
			if (window.location.search) {
				this.urlQueryToSQL(configurationComplete);
			} else {
				$('#show-query-options-container').addClass('open');

			}

			// Make changes to form to redo/undo some of the entry configuration stuff
			//	Remove the lock from any locked sections
			$('.form-section.locked').removeClass('locked').find('.unlock-button').remove();
			
			//	The mic button shouldn't be visible because it would be too easy 
			//	to overwrite what someone already wrote/dictated
			$('.mic-button-container').addClass('hidden');

			$('.short-distance-select').change(this.onShortDistanceUnitsFieldChange);

			// When a user changes an input, add .dirty class
			$('.input-field')
				.filter(
					(_, el) => {return !$(el).is('.ignore-on-insert, .short-distance-select')}
				).change(e => {
					// Add the .dirty class only if the fillFieldValues has called the .change event on this input-field
					const $target = $(e.target);
					const manualChangeAlreadyTriggered = $target.data('manual-change-triggered');
					if (!manualChangeAlreadyTriggered && manualChangeAlreadyTriggered !== undefined) {
						$target.removeClass('.dirty');
						$target.data('manual-change-triggered', true);
					} else {
						$target.addClass('dirty');
					}
				});

			// Add an element that shows the value of null fields as such when styled as uneditable
			$('.input-field').siblings('.field-label').after('<span class="null-input-indicator">&lt; null &gt;</span>');

			// Add an element for every .units-field-container, too, so the units for those fields can be displayed
			//	next to the input's value when uneditable
			$('.units-field-container')
				.siblings('.flex-field-container')
					.append(`
						<span class="uneditable-units-text"></span>
					`);
		});

		$('.data-export-button').click(() => {
			$('#data-export-modal').modal({backdrop: 'static'})
		});

		$('#prepare-export-button').click(() => {
			this.prepareExport();
		});

		$('.sidebar-collapse-button').click((e) => {
			$('.sidebar-collapse-button, nav.sidebar').toggleClass('collapsed');
			_this.queryResultMap.invalidateSize();
		});
		customizeQuery();
		//getFieldInfo();
	}

	// Intended to be overridden in bhims-custom.js
	Constructor.prototype.beforeSaveCustomAction = function() {};
	Constructor.prototype.afterSaveCustomAction = function() {};

	/***end of BHIMSQuery module***/
	return Constructor;
})();


function customizeConfiguration() {
	/* Dummy function. */
}