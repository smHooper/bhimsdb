
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
		_this = this; // scope hack for event handlers that take over "this"
	}


	Constructor.prototype.configureQueryOptions = function() {
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
				// Add slight delay because sometimes the deferred doesn't get pushed to the array
				//	before the trigger gets resolved
				//setTimeout(() => {valueRangeTrigger.resolve()}, 100);
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
											this.queryOptions[tableName][fieldName] = `${fieldName} BETWEEN ${slider.values[0]} AND ${slider.values[1] + 1}`;
											
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
									$optionContent.find('select').append($selectOptions);
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
						delete _this.queryOptions[tableName][fieldName];
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
								queryClause = `${fieldName} = '${value}'`;
								break;
							case 'startsWith':
								queryClause = `${fieldName} LIKE '${value}%'`;
								break;
							case 'endsWith':
								queryClause = `${fieldName} LIKE '%${value}'`;
								break;
							case 'contains':
								queryClause = `${fieldName} LIKE '%${value}%'`;
								break;
							case 'is null':
								queryClause = `${fieldName} IS NULL`;
								break;
							case 'is not null':
								queryClause = `${fieldName} IS NOT NULL`;
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

							queryClause = `${fieldName} BETWEEN '${lowValue}' AND '${highValue}'`;
						} else {
							const value = $valueField.val(); 
							
							// exit if the user hasn't entered a value yet
							if (value == null || value === '') return;

							queryClause = `${fieldName} ${operatorValue} '${value}'`
						}
						this.queryOptions[tableName][fieldName] = queryClause;
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

					//Select the first tab
					$('.tabs').find('input[type="radio"]').first().click();
				}
			})
		})
	}

	Constructor.prototype.setSliderHandleLabel = function($sliderContainer, handleIndex, handleValue) {
		
		const $sliderRange = $sliderContainer.find('.ui-slider-range').first();
		const rangeLeft = $sliderRange.css('left');
		const rangeWidth = $sliderRange.css('width');
		// $sliderContainer.find('.query-slider-label-container')
		// 	.css('left', `calc(${rangeLeft} - .6em`)
		// 	.css('width', `calc(${rangeWidth} + 1.2em`);

		// Set the value of the slider handle's label
		$label = $($sliderContainer.find('.query-slider-label')[handleIndex]);
		$label.text(handleValue);



		const $input = $($sliderContainer.find('input.slider-value')[handleIndex]);
		$input.val(handleValue);
		$input.css('width', (($input[0].value.length + 1) * 8) + 'px');
		
	}

	
	// Add a pill button
	Constructor.prototype.addQueryOption = function(tableName, fieldDisplayName) {

	}


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

		

		this.queryResultMap = this.configureMap('query-result-map');
		
		$('#show-query-options-container button').click(this.onShowQueryOptionsClick);

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
				hideLoadingIndicator();
				$('#show-query-options-container > button').click();

			}

			this.configureQueryOptions();

			// Make changes to form to redo/undo some of the entry configuration stuff
			//	Remove the lock from any locked sections
			$('.form-section.locked').removeClass('locked').find('.unlock-button').remove();
			
			//	The mic button shouldn't be visible because it would be too easy 
			//	to overwrite what someone already wrote/dictated
			$('.mic-button-container').addClass('hidden');

		});

		customizeQuery();
		//getFieldInfo();
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


	/*
	Get the query result for the selected encounter and fill fields in the entry form
	*/
	Constructor.prototype.fillFieldsFromQuery = function() {

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


	/*

	*/
	Constructor.prototype.setEncounterMarkerState = function() {
		if (entryForm.markerIsOnMap()) {

		}
	}


	/* Query all data tables */
	Constructor.prototype.runDataQuery = function(whereClause, tableSortColumns) {

		var deferreds = [$.Deferred()];
		// Get encounters table
		//deferreds.push(
		var encountersDeferred = queryDB(`SELECT * FROM encounters WHERE ${whereClause}`)
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
								<li class="query-result-list-item" data-encounter-id="${encounter.id}">
									<strong>Form number:</strong> ${encounter.park_form_id}, <strong>Bear group type:</strong> ${bearGroupType}
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
				}
			}
		).then(() => {

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

						//this.setReactionFieldsFromQuery();
					});
				}
			});
			
			
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
				'#f56761' : //red
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
	*/
	Constructor.prototype.loadSelectedEncounter = function() {
		//const markerWasOnMap = entryForm.markerIsOnMap();

		this.getReactionByFromReactionCodes().then(() => {
			this.fillFieldsFromQuery();
			this.setAllImplicitBooleanFields();
			this.setDescribeLocationByField();
			this.selectResultMapPoint();

			const selectedEncounterData = this.queryResult[this.selectedID];
			if (!(selectedEncounterData.latitude && selectedEncounterData.longitude)) {
				$('#encounter-marker-container').slideDown(0);//.collapse('show')
			}

			/*const $nullSelects = $('select').filter((_, el) => {
				const dataValue = selectedEncounterData[el.name];
				return !dataValue;
			});
			$nullSelects.addClass('default');
			*/

			// Run any extended functions
			for (func of this.dataLoadedFunctions) {
				try {
					func()
				} catch (e) {
					console.log(`failed to run ${func.name} after loading data: ${e}`)
				}
			}
		});

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

	/*
	Set onclick event for newly created result list items
	*/
	Constructor.prototype.onResultItemClick = function(e) {
		
		// Reset the form
		//	clear accordions
		$('.accordion .card:not(.cloneable)').remove();
		
		// 	Reset the entry form map
		if (entryForm.markerIsOnMap()) entryForm.encounterMarker.remove();
		$('#input-location_type').val('Place name');
		$('.coordinates-ddd, .coordinates-ddm, .coordinates-dms').val(null);
		_this.resetSelectDefault($('#input-location_accuracy'));
		$('#input-datum').val(1); //WGS84

		// Deselect the currently selected encounter and select the clicked one
		$('.query-result-list-item.selected').removeClass('selected');
		const $selectedItem = $(e.target).closest('li').addClass('selected');
		_this.selectedID = $selectedItem.data('encounter-id');

		// Load data
		_this.loadSelectedEncounter();

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


	Constructor.prototype.onShowQueryOptionsClick = function(e) {
		$(e.target).closest('.header-menu-item-group').toggleClass('open');
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