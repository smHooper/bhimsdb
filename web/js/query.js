
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
		this.queryOptions = {};
		this.tableSortColumns = {};
		_this = this; // scope hack for event handlers that take over "this"
	}


	/*
	Get the query result for the selected encounter and fill fields in the entry form
	*/
	Constructor.prototype.fillFieldsFromQuery = function() {

		//entryForm.fieldValues = this.queryResult[this.selectedID];
		entryForm.fillFieldValues(this.queryResult[this.selectedID]);//entryForm.fieldValues);

		// All distance values in the DB should be in meters so make sure the units match that
		$('.short-distance-select').val('m')

		// fillFieldValues() will trigger .change() events, including adding the .dirty class
		//	to all .input-fields so undo that. For some reason, reaction fields take a while
		// 	to set so their change events will fire after the .dirty class is removed, so 
		//	do this after a 1 second delay
		setTimeout(()=>{
			$('.input-field').removeClass('dirty');
			hideLoadingIndicator('loadSelectedEncounter');
		}, 1000);
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
			WHERE table_schema='public' AND column_name='encounter_id'
		;`;
		return queryDB(tablesSQL).done( tableQueryResultString => {
			const rightSideTables = $.parseJSON(tableQueryResultString);
			for (const row of rightSideTables) {
				const tableName = row.table_name;
				this.joinedDataTables.push(tableName);
			}
		});
	}

	/*

	*/
	Constructor.prototype.setEncounterMarkerState = function() {
		if (entryForm.markerIsOnMap()) {

		}
	}


	/* Query all data tables */
	Constructor.prototype.runDataQuery = function(sqlQueryParameters) {

		showLoadingIndicator();

		// Remove any items from a previous query
		$('#query-result-list').empty();
		//this.queryResultMapData.remove();
		this.queryResult = {};

		// for some reason accordions also occasionally get cleared before being reloaded with new data, so do that manually
		$('.accordion.form-item-list .card:not(.cloneable)').remove();

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
		var encountersWhereClauses = [];
		var joinClauses = [];
		var whereClauses = {};
		for (const tableName in sqlQueryParameters) {
			for (const fieldName in sqlQueryParameters[tableName]) {
				// Initiate array for this table only if there's at least one param
				if (whereClauses[tableName] == undefined) whereClauses[tableName] = [];
				
				const value = sqlQueryParameters[tableName][fieldName].value;
				var operator = sqlQueryParameters[tableName][fieldName].operator;
				const clause = `${tableName}.${fieldName} ${operator} ${value}`;
				whereClauses[tableName].push(clause);
				encountersWhereClauses.push(clause);
			}
			if (whereClauses[tableName]) {
				if (whereClauses[tableName].length && tableName !== 'encounters') {
					joinClauses.push(`LEFT JOIN ${tableName} ON encounters.id=${tableName}.encounter_id`);
				}
			}
		}

		/*for (const fieldName in sqlQueryParameters.encounters) {
			const value = sqlQueryParameters.encounters[fieldName].value;
			var operator = sqlQueryParameters.encounters[fieldName].operator;
			const clause = `encounters.${fieldName} ${operator} ${value}`;
			encountersWhereClauses.push(clause)
		}*/
		const encountersWhereStatement = 'WHERE ' + encountersWhereClauses.join(' AND ');
		var encountersDeferred = queryDB(`SELECT DISTINCT encounters.* FROM encounters ${joinClauses.join(' ')} ${encountersWhereStatement}`)//LIMIT 50`)
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
						const url = encodeURI(`${window.location.href}?{"encounters": {"id": {"value": ${encounterID}, "operator": "="}}}`);
						copyToClipboard(url, `Permalink for encounter ${encounterID} successfully copied to clipboard`);
					})
				}
			}
		).then(() => {

			// Get all table names from accordions
			const oneToManyTables = $('.accordion').map((_, el) => {return $(el).data('table-name')}).get();
			const encounterIDClause = `encounters.id IN (${Object.keys(this.queryResult).join(',')})`
			for (const tableName of this.joinedDataTables) {
				/*var tableWhereClauses = [];
				for (const fieldName in sqlQueryParameters[tableName]) {
					const value = sqlQueryParameters[tableName][fieldName].value;
					var operator = sqlQueryParameters[tableName][fieldName].operator;
					const clause = `${tableName}.${fieldName} ${operator} ${value}`;
					encountersWhereClauses.push(clause);
				}*/
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
						for (const row of result) {
							const encounterID = row.encounter_id;
							if (!this.queryResult[encounterID]) {
								a = 1;
							}
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
				this.loadSelectedEncounter();
				this.addMapData();
				hideLoadingIndicator();
			});
		});

		return deferreds;

	}


	/* 
	Parse a URL query into an SQL query and process the result 
	*/
	Constructor.prototype.urlQueryToSQL = function() {

		var queryParams = decodeURIComponent(window.location.search.slice(1));

		// 
		$.when(
			this.runDataQuery(queryParams)
		).then( () => {

			//this.setReactionFieldsFromQuery();
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
		const styleFunc = (feature) => {
			return {
				radius: 8,
				weight: 1,
				opacity: 1,
				fillOpacity: 0.8,
				fillColor: getColor(feature.id),
				color: getColor(feature.id)
			}
		}

		this.queryResultMapData = L.geoJSON(
				features, 
				{
					//onEachFeature: onEachPoint,
					style: styleFunc,
					pointToLayer: featureToMarker
				}
		).on('click', (e) => {
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

		// Zoom to fit data on map
		this.queryResultMap
			.fitBounds(this.queryResultMapData.getBounds())
			.setZoom(Math.min(this.queryResultMap.getZoom(), 15));
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
		$('.map .leaflet-marker-pane .leaflet-marker-icon').toggleClass('leaflet-marker-draggable', allowEdits);
		const markerContainer = $('.marker-container.collapse');
		if (allowEdits && !entryForm.markerIsOnMap()) {
			markerContainer.show();
		} else {
			markerContainer.hide();
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
		const fileName = attachmentInfo.thumbnail_filename || attachmentInfo.file_path.split('\\').pop();
		
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
		 	.text(attachmentInfo.client_file_name);

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
	*/
	Constructor.prototype.loadSelectedEncounter = function() {
		
		// close any open cards
		/*$('#row-details-pane').find('.row-details-card-collapse.show')
			.removeClass('show')
			.siblings()
				.find('.card-link')
				.addClass('collapsed');*/

		showLoadingIndicator('loadSelectedEncounter');

		const selectedEncounterData = this.queryResult[this.selectedID];
		
		this.getReactionByFromReactionCodes().then(() => {
			this.fillFieldsFromQuery();
			this.setAllImplicitBooleanFields();
			this.setDescribeLocationByField();
			this.selectResultMapPoint();

			// Load any attachments
			const attachments = selectedEncounterData.attachments || [];
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

			// Make sure the reactions select is visible (might not be if either initial_human_activity or initial_bear_activity is filled in)
			$('#reactions-accordion').removeClass('hidden').addClass('show');
		});

	}

	/*
	Load a new encounter after an encounter has already been selected. This needs 
	to be separated from the onResultItemClick ecent handler to enable control flow 
	from modal asking user to confirm edit saves
	*/
	Constructor.prototype.switchEncounterRecord = function(newRecordItemID) {

		// Reset the form
		//	clear accordions
		$('.accordion .card:not(.cloneable, .form-section)').remove();
		
		// 	Reset the entry form map
		if (entryForm.markerIsOnMap()) entryForm.encounterMarker.remove();
		$('#input-location_type').val('Place name');
		$('.coordinates-ddd, .coordinates-ddm, .coordinates-dms').val(null);
		bhimsQuery.resetSelectDefault($('#input-location_accuracy'));//use bhimsQuery because it needs to reference the global from query.html
		$('#input-datum').val(1); //WGS84

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
			if ($dirtyInputs.length) {
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
		$.ajax({
			url: 'bhims.php',
			method: 'POST',
			data: {
				action: 'deleteEncounter',
				encounterID: encounterID
			},
		}).done(deleteResultString => {
			if (queryReturnedError(deleteResultString)) {
				showModal('A problem occurred that prevented the server from deleting the encounter. Please try again later.');
				return [];
			} else {
				const $deletedEncounterElement = $('#query-result-item-' + encounterID)
					.fadeOut(500, (_, el) => {
						$(el).remove();
					})
				const filesToDelete = this.queryResult[this.selectedID].attachments
					.map(attachmentRow => {return attachmentRow.file_path})
				$deletedEncounterElement
					.next()
					.click();
				return filesToDelete;
			}
		}).fail((xhr, status, error) => {
			console.log(`An unexpected error occurred while deleting encounter ${encounterID}: ${error}`)
		})
		// Delete any attached files
		.then(filesToDelete => {
			var failedFiles = [];
			for (const filePath of filesToDelete) {
				$.ajax({
					url: 'bhims.php',
					method: 'POST',
					data: {action: 'deleteFile', filePath: filePath},
					cache: false,
				}).done(result => {
					if (result.trim() !== 'true') {
						failedFiles.push(filePath);
					}
				}).fail((xhr, status, error) => {
					console.log(`Failed to delete ${filePath} because ${error}`)
				})
			}
		});


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
		var sortedFields = Object.keys(fieldValues).sort();
		var parameters = sortedFields.map(f => fieldValues[f]);
		parametized = [];
		for (const index in sortedFields) {
			parametized.push(`${sortedFields[index]}=$${parseInt(index) + 1}`);
		}
		const sql = `UPDATE ${tableName} SET ${parametized.join(', ')} WHERE ${idField}=${id};`
		
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
		
		const $dirtyInputs = $('.input-field.dirty:not(.ignore-on-insert)');
		var selectedEncounterData = this.queryResult[this.selectedID];

		var oneToOneUpdates = {};
		var oneToManyUpdates = {};
		for (const input of $dirtyInputs) {
			const $input = $(input);
			const inputValue = $input.val();
			const fieldName = $input.attr('name');
			const $accordion = $input.closest('.accordion.form-item-list');

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
				//	table, oneToManyUpdates[tableName] will be undefined
				if (!oneToManyUpdates[tableName]) oneToManyUpdates[tableName] = {};
				const tableUpdates = oneToManyUpdates[tableName];

				// Get the index of this card within the accordion
				const index = $input.attr('id').match(/\d+$/)[0];
				
				if (!tableUpdates[index]) tableUpdates[index] = {id: undefined, values: {}};
				const dbID = entryForm.fieldValues[tableName][index].id; // will be undefined if this is a new card
				tableUpdates[index].id = dbID;
				tableUpdates[index].values[fieldName] = inputValue;
				//selectedEncounterData[tableName][index][fieldName] = inputValue;
			} else {
				if (!oneToOneUpdates[tableName]) oneToOneUpdates[tableName] = {};
				oneToOneUpdates[tableName][fieldName] = inputValue;
				// Save result to in-memory query result, so when this encounter is reloaded, it shows the 
				//selectedEncounterData[fieldName] = inputValue;
			}
		}

		// Add meta fields to encounters table
		if (!('encounters' in oneToOneUpdates)) oneToOneUpdates.encounters = {};
		oneToOneUpdates.encounters.last_edited_by = entryForm.username;
		oneToOneUpdates.encounters.datetime_last_edited = getFormattedTimestamp();
		
		const sqlStatements = [];
		const sqlParameters = [];
		for (const tableName in oneToOneUpdates) {
			const updates = oneToOneUpdates[tableName];
			// If this is just a normal table update (not part of a 1-to-many relationship), 
			//	just construct the UPDATE statement
			const idField = tableName === 'encounters' ? 'id' : 'encounter_id';
			var [sql, parameters] = _this.getUpdateSQL(tableName, updates, idField, _this.selectedID);
			sqlStatements.push(sql);
			sqlParameters.push(parameters);
		} 
		for (const tableName in oneToManyUpdates) {
			// Otherwise either UPDATE the proper row or INSERT if this is a new row
			const updates = oneToManyUpdates[tableName];
			for (const cardID in updates) {
				const dbID = updates[cardID].id;
				var values = updates[cardID].values;
				if (dbID === undefined) {
					// new row that needs to be INSERTed
					// Add the encounter_id field, since all related records need this
					values['encounter_id'] = _this.selectedID;
					
					const sortedFields = Object.keys(values).sort();
					var parameters = sortedFields.map(f => values[f]);
					parametized = '$' + sortedFields.map(f => sortedFields.indexOf(f) + 1).join(', $');
					sql = `INSERT INTO ${tableName} (${sortedFields.join(', ')}) VALUES ${parametized}`;
					sqlStatements.push(sql);
					sqlParameters.push(parameters);
				} else {
					// just a regular UPDATE
					var [sql, parameters] = _this.getUpdateSQL(tableName, values, 'id', dbID);
					sqlStatements.push(sql);
					sqlParameters.push(parameters);			
				}
			}
		}

		// Send queries to server
		$.ajax({
			url: 'bhims.php',
			method: 'POST',
			data: {action: 'paramQuery', queryString: sqlStatements, params: sqlParameters},
			cache: false
		}).done((queryResultString) => {
			queryResultString = queryResultString.trim();

			//hideLoadingIndicator();

			if (queryResultString !== 'success') {
				showModal(`An unexpected error occurred while saving data to the database: ${queryResultString}.`, 'Unexpected error')
				return;
			} else {
				$dirtyInputs.removeClass('dirty');
				// Set values in the in-memory queried data so when this record is reloaded, it has the right values
				for (const tableName in oneToOneUpdates) {
					const updates = oneToOneUpdates[tableName];
					for (const fieldName in updates) {
						selectedEncounterData[fieldName] = updates[fieldName];
					}
				}
				for (const tableName in oneToManyUpdates) {
					const updates = oneToManyUpdates[tableName];
					for (const index in updates) {
						const rowValues = updates[index].values;
						const selectedRowData = selectedEncounterData[tableName][index];
						for (fieldName in rowValues) {
							if (fieldName in selectedRowData) {
								selectedRowData[fieldName] = rowValues[fieldName];
							}
						}
					}
				}
				
			}
		}).fail((xhr, status, error) => {
			showModal(`An unexpected error occurred while saving data to the database: ${error}.`, 'Unexpected error');
		}).always(() => {hideLoadingIndicator()}); 
	}


	/*
	Event handler for .save-button
	*/
	Constructor.prototype.onSaveButtonClick = function(e) {
		
		e.stopPropagation();
		saveEdits();
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
		for (const tableName in _this.queryOptions) {
			if (Object.keys(_this.queryOptions[tableName]).length) {
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
		if ($('.input-field.dirty:not(.ignore-on-insert)').length) {
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
			}
			$(targetField).val(collapsed ? 0 : 1).change();
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
				const reactionRows = this.queryResult[this.selectedID].reactions;
				if (reactionRows.length) {
					for (const i in reactionRows) {
						// Get reaction code
						const reaction = reactionRows[i];

						// Determine reaction_by and fill value
						reactionRows[i].reaction_by = reactionCodesTable[reaction.reaction_code].action_by;
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
		const conversionFactor = 3.2808399;
		const $valueField = $target.closest('.field-container')
			.find('.flex-field-container')
				.find('.input-field');
		const distanceInMeters = entryForm.fieldValues[$valueField.attr('name')];
		$valueField.val(
			units === 'm' ? 
			distanceInMeters : 
			Math.round(distanceInMeters * conversionFactor)
		);
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
					(table_name IS NOT NULL OR css_class LIKE '%boolean-collapse-trigger%') 
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
						{id: 999, table_name: 'attachments', field_name: 'client_file_name', html_input_type: 'text', html_id: 'input-client_file_name', display_name: 'File name', description: 'Name of the attached file'},
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
						this.queryOptions[tableName] = {};
						const $tab = $(`
							<li>
								<input id="tab-${tableName}" class="tab-button" type="radio" name="tabs">
								<label id="tab-label-${tableName}" for="tab-${tableName}"
									class="tab-label" 
									role="tab" 
									aria-selected="true" 
									aria-controls="tab-content-${tableName}" 
									tabindex="0">
									${tableName[0].toUpperCase()}${tableName.slice(1).replace('_', ' ')}
							    </label>
							    <div id="tab-content-${tableName}" 
									class="tab-content" 
									role="tabpanel" 
									aria-labelledby="tab-label-${tableName}" 
									aria-hidden="false"
								>
									<div class="tab-field-list-container"></div
								</div>
							</li>
						   `).appendTo('#query-options-drawer-body > .tabs');

						for (option of queryOptionConfig[tableName]) {
							const fieldName = option.field_name;
							var $optionContent = null;

							$(`
								<label class="field-list-item">
									<button id="button-add-${option.field_name}" class="icon-button add-field-query-option-button" data-target="#query-option-${option.field_name}" aria-label="Add query option">
										<i class="fa fa-plus" aria-hidden="true"></i>
									</button>
									<span>${option.display_name}</span>
								</label>
							`).appendTo($tab.find('.tab-field-list-container'));

							// Configure option depending on html_input_type
							switch (option.html_input_type) {
								case 'text':
								case 'textarea':
								case 'email':
								case 'tel':
									$optionContent = $(`
										<div class="query-option-container hidden">
											<div class="query-option-condition-container">
												<select class="query-option-operator string-match-query-option" value="equals">
													<option value="equals">equals</option>
													<option value="startsWith">starts with</option>
													<option value="endsWith">ends with</option>
													<option value="contains">contains</option>
													<option value="is null">is null</option>
													<option value="is not null">is not null</option>
												</select>
												<input id="query-option-${option.field_name}" class="query-option-input-field string-match-query-option" type="text" data-field-name="${fieldName}" data-table-name="${tableName}" data-display-name="${option.display_name}">
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
												<div id="query-option-${option.field_name}" class="slider-container query-option-input-field" data-field-name="${fieldName}" data-table-name="${tableName}" data-display-name="${option.display_name}">
													<div class="query-slider-label-container">
														<input class="slider-value slider-value-low" type="number" value=${thisMin} min=${thisMin} max=${thisMax}>
														<input class="slider-value slider-value-high" type="number" value=${thisMax} min=${thisMin} max=${thisMax}>
														<!--<label class="query-slider-label">${thisMin}</label>
														<label class="query-slider-label">${thisMax}</label>-->
													</div>
												</div>
												<!-- text boxes
												<div class="slider-value-input-container">
													<input class="slider-value slider-value-low" type="number" value=${thisMin} min=${thisMin} max=${thisMax}>
													<input class="slider-value slider-value-high" type="number" value=${thisMax} min=${thisMin} max=${thisMax}>
												</div>-->
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
											this.queryOptions[tableName][fieldName] = {value: `${slider.values[0]} AND ${slider.values[1] + 1}`, operator: 'BETWEEN'};//`${tableName}.${fieldName} BETWEEN ${slider.values[0]} AND ${slider.values[1] + 1}`;

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
												</select>
												<input id="query-option-${option.field_name}" class="query-option-input-field single-value-field datetime-query-option" type="${option.html_input_type}" data-field-name="${fieldName}" data-table-name="${tableName}" data-display-name="${option.display_name}" >
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
									const $select = $('#' + option.html_id);
									const $selectOptions = $select.find('option')
										.filter((_, el) => {return el.value != ''});
									//const selectOptionValues = $selectOptions.map((_, el) => {return {value: el.value, text: el.innerHTML}});
									/*const selectOptionHTML = $selectOptions.map((_, el) => {
										return `<option value="${el.value}">${el.innerHTML}</option>`
									}).join('\n');*/
									$optionContent = $(`
										<div class="query-option-container hidden">
											<div class="query-option-condition-container checkbox-option-group">
												<select id="query-option-${option.field_name}" class="input-field query-option-input-field select2-no-tag" multiple="multiple" data-field-name="${fieldName}" data-table-name="${tableName}" data-display-name="${option.display_name}">
												</select>
											</div>
										</div>
									`);
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

					toggleCopyQueryLinkButton = () => {
						// If this was the last query option, hide the copy-permalink button
						var queryOptionsSpecified = false;
						for (const tableName in _this.queryOptions) {
							if (Object.keys(_this.queryOptions[tableName]).length) queryOptionsSpecified = true;
						}
						$('#copy-query-link-button').toggleClass('hidden', !queryOptionsSpecified);
					}

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
						delete _this.queryOptions[tableName][fieldName];

						toggleCopyQueryLinkButton();
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
							delete this.queryOptions[tableName][fieldName];
							return;
						}	

						var queryClause = '';
						switch (operatorValue) {
							case 'equals':
								queryClause = {value: `'${value}'`, operator: '='};//`${tableName}.${fieldName} = '${value}'`;
								break;
							case 'startsWith':
								queryClause = {value: `'${value}%'`, operator: 'LIKE'};// `${tableName}.${fieldName} LIKE '${value}%'`;
								break;
							case 'endsWith':
								queryClause = {value: `'%${value}'`, operator: 'LIKE'};//`${tableName}.${fieldName} LIKE '%${value}'`;
								break;
							case 'contains':
								queryClause = {value: `'%${value}%'`, operator: 'LIKE'};//`${tableName}.${fieldName} LIKE '%${value}%'`;
								break;
							case 'is null':
								queryClause = {value: 'NULL', operator: 'IS'};// `${tableName}.${fieldName} IS NULL`;
								break;
							case 'is not null':
								queryClause = {value: 'NULL', operator: 'IS NOT'};//`${tableName}.${fieldName} IS NOT NULL`;
								break;
							default:
								console.log(`Could not underatnd operator ${$operatorField.val()} from #${operatorField.attr('id')}`)
						}
						
						this.queryOptions[tableName][fieldName] = queryClause;
					});

					$('input.slider-value').change(e => {
						/*Set the slider values when the input changes*/
						const $input = $(e.target);
						const index = $input.index();
						var value = $input.val();
						const dbMin = $input.attr('min');
						const dbMax = $input.attr('max');
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
							if (value == null || value === '') return;

							queryClause = {value: value, operator: operatorValue};//`${tableName}.${fieldName} ${operatorValue} '${value}'`
						}
						this.queryOptions[tableName][fieldName] = queryClause;
					});

					// selects
					$('.select2-no-tag').change(e => {
						const $select = $(e.target);
						const tableName = $select.data('table-name');
						const fieldName = $select.data('field-name');
						const valueString = $select.val().join(',');
						
						// If it's empty, remove the query option
						if (!valueString.length) {
							delete this.queryOptions[tableName][fieldName];
							return;
						}
						this.queryOptions[tableName][fieldName] = {value: `(${valueString})`, operator: 'IN'}
						toggleCopyQueryLinkButton();
					});

					// When a query option input loses focus, hide/show the copy-permalink button, depending on 
					//	whether there user has any query options specified
					$('.query-option-input-field').blur(() => {
						toggleCopyQueryLinkButton();
					});

					//Select the first tab
					$('.tabs').find('input[type="radio"]').first().click();
				}
				hideLoadingIndicator();
			})
		})
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


	/*
	Configure the page
	*/
	Constructor.prototype.configureQuery = function() {

		showLoadingIndicator();

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

		this.queryResultMap = this.configureMap('query-result-map');
		
		$('#show-query-options-button').click(this.onShowQueryOptionsClick);
		$('#run-query-button').click(this.onRunQueryClick);
		$('#copy-query-link-button').click(() => {
			var options = {};
			for (const tableName in _this.queryOptions) {
				const tableOptions = _this.queryOptions[tableName];
			    if (Object.keys(tableOptions).length) options[tableName] = {...tableOptions};
			}
			const url = encodeURI(`${window.location.href.split('?')[0]}?${JSON.stringify(options)}`);
			copyToClipboard(url, `Permalink for this query successfully copied to clipboard`);
		});

		$.when(
			...this.getLookupValues(), 
			entryForm.configureForm(mainParentID='#row-details-pane', isNewEntry=false),
			this.getJoinedDataTables(),
			this.getTableSortColumns()
		).then(() => {
			
			this.sectionsToAccordion();

			if (window.location.search) {
				this.urlQueryToSQL();
				// Set value for all boolean fields that show/hide accordions
				/*for (const el of $('.accordion.collapse')) {
					this.setImplicitBooleanField($(el));
				}
				this.setReactionFieldsFromQuery();*/

				//update result map
			} else {
				$('#show-query-options-container').addClass('open');

			}

			this.configureQueryOptions();

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
					$(e.target).addClass('dirty');
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

		$('.sidebar-collapse-button').click((e) => {
			$('.sidebar-collapse-button, nav.sidebar').toggleClass('collapsed');
			_this.queryResultMap.invalidateSize();
		});
		customizeQuery();
		//getFieldInfo();
	}

	/***end of BHIMSQuery module***/
	return Constructor;
})();


function customizeConfiguration() {
	/* Dummy function. */
}