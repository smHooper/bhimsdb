const BHIMSAnalysis  = (function() {
	
	var _this;
	var Constructor = function() {
		_this = this;

		_this.result = [];
		_this.ancillaryResult = []; // for things like briefings that go along with 
		_this.countEncountersBySelectMap = { // mapping #count_encounters-count_field values to SELECT statements for readability
			encounter_id: `SELECT DISTINCT ON (encounter_id) * FROM {schema}.analysis_query_view`,
			improper_reaction_id: `SELECT DISTINCT ON (improper_reaction_id) * FROM {schema}.analysis_query_view`,
			property_damage_id:  `SELECT DISTINCT ON (property_damage_id) * FROM {schema}.analysis_query_view`,
			structure_interaction_id:   `SELECT DISTINCT ON (structure_interaction_id) * FROM {schema}.analysis_query_view`,
		}
		_this.minDragbarPageY = 220; // min height to prevent user from covering query title when resizing param container
		_this.booleanResponseFields = [
			'bear_did_charge',
			'bear_obtained_food',
			'bear_spray_was_used',
			'bear_spray_was_effective',
			'did_react_properly',
			'was_making_noise'
		];
		_this.observationManagementClassCode = 1;
		_this.queries = {

			count_encounters: {
				sql: `
					SELECT {outer_select}
					FROM ({inner_select} {where_clauses}) _ 
					{joins}
					{group_by}
				`,
				numericColumns: [
					'age',
					'trip_length_days'
				],
				columns: [
					'Count'
				]
			}
		};
		
		
	
	}

	Constructor.prototype.configureMainContent = function() {
		// $('.main-content-wrapper').append(`

		// `);
		// When the user clicks the expand or contract sidebar button, expand or contract it accordingly
		$('.change-query-option-sidebar-size-button').click(e => {
			const $sideBar = $('.query-options-sidebar');
			const isCollapsed = $sideBar.is('.collapsed');
			$sideBar.toggleClass('collapsed', !isCollapsed);

			const $i = $(e.target).closest('button').find('i');
			// Delay changing icon until transition is finished
			setTimeout(() => {
				const isCollapsed = !$i.is('.fa-arrow-right')
				$i.toggleClass('fa-arrow-right fa-arrow-from-left', isCollapsed)
				$i.siblings('.icon-button-label').text(isCollapsed ? 'show' : 'hide')
			}, 200);
		})

		//Event handler for selects
		$('select').change(e => {
			const $select = $(e.target);
			onSelectChange($select);
		});

		// filter query options when the user searches
		$('#query-option-search-input').keyup(e => {
			_this.onSearchBarKeyUp(e);
		});

		// Show query parameters (if there are any) when a query option is clicked
		$('.query-option').click(e => {_this.onQueryOptionClick(e)});
		
		$('#run-query-button').click(() => {
			_this.onRunQueryButtonClick();
		});

		$('#reset-query-climbers-climbs-button').click(e => {
			_this.onResetQueryCountEncountersClick(e);
		});

		$('.bhims-select2').change(e => {_this.onSelect2Change(e)});

		$('.show-query-parameter-button').click(e => {
			this.onShowQueryParameterButtonClick(e)
		});

		$('.hide-query-parameter-button').click(e => {
			this.onHideQueryParameterButtonClick(e)
		});

		// $('#open-reports-modal-button').click(() => {
		// 	$('#exports-modal').modal();
		// });

		$('#export-data-button').click(() => {
			this.onExportDataButtonClick();
		});

		$('.input-field').change(e => {
			this.onInputChange(e);
		});

		$('#query-parameter-dragbar').mousedown(e => {
			this.onDragbarMouseDown(e);
		})
		// mouseup and mousedown events only fire if the mouse gesture occurs while 
		//	the cursor is over the element the event listener is attached to. So it 
		//	needs to be attached to the body, not that dragbar since the event 
		//	fires before the dragbar moves
		$('body').mouseup(e => {
			this.onDragbarMouseUp(e);
		});

		$('.datetime-query-operator').change(e => {
			this.onDatetimeQueryOperatorChange(e)
		});

		$('.add-remove-all-multiselect-options-button').click(e => {
			this.onAddAllMultiselectOptionsClick(e);
		})

		$(document).on('click', '.sort-column-button', e => {
			this.onSortDataButtonClick(e);
		});
		
		// Record current value for .revertable inputs so the value can be reverted after a certain event
		$('.input-field.revertable', e => {
			const $target = $(e.target);
			$target.data('current-value', $target.val());
		});
		// Make sure the group by and pivot fields don't contain the same value or the SQL will break
		$('#count_encounters-group_by_fields, #count_encounters-pivot_field').change(e => {
			this.onGroupByPivotFieldChange(e);
		})

		$('#copy-query-link-button').click(e => {
			this.onCopyQueryLinkButtonClick(e)
		});

		$('#count_encounters-summary_or_records').change(() => {
			this.onCountEncountersQueryByChange()
		});

		// When the user changes the include_observations or mgmt class filter, check to see 
		// 	if they should be warned that these two fields conflict semanticatlly
		$(`
			#count_encounters-include_observations,
			#count_encounters-management_classification_code
		`).change(() => {
			this.showIncludeObservationWarning();
		});
		// Also perform this check when the mgmt class filter is shown in case there were previously 
		// 	selected filter options and they were previously hidden and therefore ignored
		$('.show-query-parameter-button[data-field-name=management_classification_code]').click(() => {
			this.showIncludeObservationWarning({checkIfManagementClassVisiable: false});
		});

		// prepared query handlers
		$('#encounters-per-bear-behavior-query-button').click(() => {
			this.onEncountersPerBearBehaviorClick();
		});
		$('#backcountry-encounters-per-bear-behavior-query-button').click(() => {
			this.onBackcountryEncountersPerBearBehaviorClick();
		});
		$('#frontcountry-encounters-per-bear-behavior-query-button').click(() => {
			this.onFrontcountryEncountersPerBearBehaviorClick();
		});
		$('#encounters-per-mgmt-classification-query-button').click(() => {
			this.onEncountersPerMgmtClassificationClick();
		});
		$('#backcountry-encounters-per-mgmt-classification-query-button').click(() => {
			this.onBackcountryEncountersPerMgmtClassificationClick();
		});
		$('#frontcountry-encounters-per-mgmt-classification-query-button').click(() => {
			this.onFrontcountryEncountersPerMgmtClassificationClick();
		});
		$('#encounters-with-improper-reactions-query-button').click(() => {
			this.onEncountersWithImproperReactionsClick();
		});
		$('#improper-reactions-count-query-button').click(() => {
			this.onImproperReactionsCountClick();
		});
		$('#improper-reactions-per-user-group-query-button').click(() => {
			this.onImproperReactionsPerUserGroupClick();
		});
		$('#improper-vs-improper-reactions-query-button').click(() => {
			this.onProperVsImproperReactionsClick();
		});
		$('#east-fork-improper-vs-improper-reactions-query-button').click(() => {
			this.onEastForkProperVsImproperReactionsClick();
		});
		$('#encounters-per-backcountry-unit-query-button').click(() => {
			this.onEnctountersPerBackcountryUnitClick();
		});
		$('#encounters-per-place-name-query-button').click(() => {
			this.onEnctountersPerPlaceNameClick();
		});
		$('#encounters-per-place-name-mgmt-classification-query-button').click(() => {
			this.onEnctountersPerPlaceNameMgmtClassClick();
		});
		$('#encounters-per-human-activity-query-button').click(() => {
			this.onEnctountersPerUserGroupClick();
		});
		$('#frontcountry-encounters-per-human-activity-query-button').click(() => {
			this.onFrontcountryEnctountersPerUserGroupClick();
		});
		$('#management-classification-per-human-activity-query-button').click(() => {
			this.onMgmtClasssPerUserGroupClick();
		});
	}

	/*
	Make the values of any input fields with the same name attribute consistent
	*/
	Constructor.prototype.onInputChange = function(e) {
		const $target = $(e.target);
		const name = $target.attr('name');
		// Some fields have name attributes that make invalid jQuery expressions and throw and error
		try {
			$(`.input-field[name=${name}]`).not($target)
				.not('.no-name-auto-update')
				.val($target.val())	
		} catch {
			return
		}
	}


	Constructor.prototype.filterQueryOptions = function({searchString=''}={}) {
		let $queryOptions = $('.query-option');
		const $noMatchMessage = $('#no-query-match-message').ariaHide(true);
		const $queryList = $('#query-option-list').ariaHide(false);

		// make sure matches aren't case-sensitive
		searchString = searchString.toLowerCase();
		
		// If the search string is blank, show all queries
		if (!searchString.length) {
			$queryOptions.ariaHide(false);
		} else {
			// first try to find all queries that include the search string
			let $matches = $queryOptions.filter(
				(_, el) => el.innerHTML.toLowerCase().includes(searchString)
			);

			// next find all query options that have a tag that matches the search string
			$matches = $matches.add($queryOptions.filter(
				(_, el) => {
					const tags = $(el).data('tags').split(',').map(tag => tag.trim().toLowerCase());
					return tags.includes(searchString);
				}
			))
			.ariaHide(false); // show all matches

			if ($matches.length) {
				// hide all that aren't matches
				$queryOptions.not($matches).ariaHide(true);
			} else {
				// if there aren't any matches show the null match message
				$noMatchMessage.ariaHide(false);
				$queryList.ariaHide(true);
			}
			
		}
	}

	/*
	Reset the Query Encounters query options
	*/
	Constructor.prototype.resetQueryCountEncounters = function($container) {
		$container.find('.field-container.collapse')
			.collapse('hide');

		$('.stat-field-row:not(.cloneable)').remove();

		_this.clearInputFields({parent: $container});

		// show dependent fields if there are any. Do this after a half second because
		//	the .collapse() transitions are still happening and will interfere otherwise
		setTimeout(() => {$('#count_encounters-summary_or_records').change()}, 500);
	}


	Constructor.prototype.onResetQueryCountEncountersClick = function(e) {
		const $container = $(e.target).closest('.query-parameters-container');
		_this.resetQueryCountEncounters($container);
	}

	Constructor.prototype.onSearchBarKeyUp = function(e) {
		const $searchBar = $(e.target);
		const searchString = $searchBar.val();
		_this.filterQueryOptions({searchString: searchString});
	}

	/*Set CSS style based on select value*/
	Constructor.prototype.onSelect2Change = function(e) {
		const $target = $(e.target);
		const $select2 = $target.siblings('.select2-container');
		const valueLength = $target.val().length;
		$select2.toggleClass('is-empty', !valueLength);

		// Show/hide the .field-label of select2s by manually toggling the .default class 
		//	based on the select's value
		$target.toggleClass('default', !valueLength);

		// Set the add/remove all button text, depedning on whether all options are selected or not
		const $addRemoveButton = $target.siblings('.add-remove-all-multiselect-options-button')
		$addRemoveButton.text(
			$target.val().length === _this.getAllSelectOptions($target).length ?
				'remove all' :
				'add all'
		);
	}


	/*
	Show the query parameters for the clicked query
	*/
	Constructor.prototype.onQueryOptionClick = function(e) {
		// Deselect previous selection
		const $previousOption = $('.query-option.selected').removeClass('selected');
		
		// Hide previous inputs
		$(`.query-details-container [data-query-name="${$previousOption.data('query-name')}"]`).ariaHide(true);
		
		// Select clicked option and show assoicated inputs
		const $option = $(e.target).addClass('selected');
		const $container = $(`.query-parameters-container[data-query-name="${$option.data('query-name')}"]`).ariaHide(false);

		// Make sure:
		$('#run-query-button').ariaHide(false); 		// the run button is visible
		$('#export-data-button, .table-row-counter-wrapper').ariaHide(true); // export button is hidden
		$('.query-result-container').empty();			// any previous result is deleted
		$('.query-parameters-container')                // parameter container height is reset
			.css('max-height', 'var(--query-parameter-container-height)'); 

		// The dragbar should only be visible if the query allows it
		$('#query-parameter-dragbar').ariaHide($option.is('.not-expandable'))
			.data('last-dragged-y', window.screen.height);
	}


	/*
	Because I can't figure out a clean way to have multiple dependent targets/values for a single field,
	the search day start and end fields (only relevant for day/day of year GROUP BY queries) need to be
	toggled on and off via Javascript when the #count_encounters-summary_or_records field changes
	*/
	Constructor.prototype.onCountEncountersQueryByChange = function() {
		const $groupByField = $('#count_encounters-group_by_fields');
		const $dayStartField = $('#count_encounters-day_search_start');
		const dependentValue = $dayStartField.data('dependent-value').split('|');
		$dayStartField.closest('.collapse').collapse(
			// If this is a count of climbers/climbs AND
			$('#count_encounters-summary_or_records').val() === 'summary' && 
			// day/day of year is selected as a GROUP BY field
			$groupByField.val().some(v => dependentValue.includes(v)) ? 
			// then show it.
			'show' : 
			// If either is not true, hide it
			'hide'
		)
	}

	/*
	Check if the observation/mgmt class filter parameters conflict and if so, warn the user
	*/
	Constructor.prototype.showIncludeObservationWarning = function({checkIfManagementClassVisiable=true}={}) {
		// add parameter to check .collapse.show class or not
		// Only check the value if the mgmt class field is visible
		const inlcudeObservations = $('#count_encounters-include_observations').val() === 'yes';
		const $managementClassField = $(`${checkIfManagementClassVisiable ? '.collapse.show' : ''} #count_encounters-management_classification_code`);
		const filterValues =  ($managementClassField.val() || []).map(v => parseInt(v));
		
		// If there aren't any management class values, just exit because the showModalWarning gate will 
		// 	evaluate to true if includeObservations === true
		if (!filterValues.length) return;

		const showModalWarning = (
			(!filterValues.includes(this.observationManagementClassCode) && inlcudeObservations) ||
			(filterValues.includes(this.observationManagementClassCode) && !inlcudeObservations) 
		)
		if (showModalWarning) {
			const message = (inlcudeObservations ?
				'You have selected to include observations but your Management Classification filter options exclude them.' :
				'You have selected to exclude observations but your Management Classification filter options include them.') +
				' Be aware that the <strong>query results will not show reports classified as "Observation"</strong> as a result.';
			
			showModal(message, 'WARNING: Conflicting Field Filters');
		}
	}



	/*
	Helper function to set default options for canned count_encounters derative queries
	*/
	Constructor.prototype.setCountEncountersParameters = function({
			queryTarget='summary', 
			countBy='climbers',
			year=this.MAX_YEAR || Math.max(...$('#count_encounters-encounter_year option').map((_, el) => el.value).get()), 
			groupByFields=[], 
			pivotField=''
		}={}) {
		
		const $groupBy = $('#count_encounters-group_by_fields')
			// set null first so it doesn't trigger the conflict message 
			// 	if the pivot field is included in the groupByFields
			.val([]);
		const $pivot = $('#count_encounters-pivot_field').val('');

		// Set basic SQL parameter fields
		$('#count_encounters-summary_or_records').val(queryTarget).change();
		$('#count_encounters-count_field').val(countBy).change();
		$groupBy.val(groupByFields).change();
		$pivot.val(pivotField).change();

		const $container = $('.query-parameters-container[data-query-name="count_encounters"]')
		
		// Hide all where-clause fields
		$('.where-clause-field').closest('.field-container').removeClass('show');

		// Unhide all parameter show/hide buttons to reset to default
		$container.find('.show-query-parameter-button').ariaHide(false);
		if (year) {
			$container.find('.show-query-parameter-button[data-field-name="encounter_year"]').click();
			$('#count_encounters-encounter_year').val([year.toString()]).change();
		}
	}

	/*
	Event handlers to prepare canned queries
	*/
	Constructor.prototype.onEncountersPerBearBehaviorClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ["probable_cause_code"]
		});
	}

	/*
	Helper method to set a filter field either to specified values or everything 
	but those values
	*/
	Constructor.prototype.setFilterField = function(field_name, {values=[], equalTo=true}={}) {
		
		const $container = $('.query-parameters-container[data-query-name="count_encounters"]');
		$container.find(
			`.show-query-parameter-button[data-field-name="${field_name}"]`
		).click();
		
		const $filter = $(`#count_encounters-${field_name}`);
		if (equalTo) {
			$filter.val(values).change();
		} else {
			const equalToValues = $filter
				.find('option')
					.map((_, el) => 
						// if it's not the placeholder
						el.value !== '' && 
							// check if it's included
							!values.includes(
								// if the option value can be converted to an int,
								//	do that so the comparison is 1:1
								isNaN(parseInt(el.value)) ? el.value : parseInt(el.value)
							) ? 
						// include it
						el.value : 
						// exclude it
						null
					)
					.get()
			$filter.val(equalToValues).change();
		}
	}

	Constructor.prototype.onBackcountryEncountersPerBearBehaviorClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ["probable_cause_code"]
		});

		// Set human activity to just BC hiking and camping
		this.setFilterField('general_human_activity_code', {values: [1,2]});
	}

	Constructor.prototype.onFrontcountryEncountersPerBearBehaviorClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ["probable_cause_code"]
		});

		// Set human activity to everything but BC hiking and camping
		this.setFilterField(
			'general_human_activity_code', 
			{
				values: [1,2],
				equalTo: false
			}
		);
	}

	Constructor.prototype.onEncountersPerMgmtClassificationClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ["management_classification_code"]
		});
	}

	Constructor.prototype.onBackcountryEncountersPerMgmtClassificationClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ["management_classification_code"]
		});

		// Set human activity to just BC hiking and camping
		this.setFilterField('general_human_activity_code', {values: [1,2]});

	}

	Constructor.prototype.onFrontcountryEncountersPerMgmtClassificationClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ["management_classification_code"]
		});

		// Set human activity to everything but BC hiking and camping
		this.setFilterField(
			'general_human_activity_code', 
			{
				values: [1,2],
				equalTo: false
			}
		);
	}

	Constructor.prototype.onEncountersWithImproperReactionsClick = function() {
		this.setCountEncountersParameters({
			countBy: 'improper_reaction_id', 
			groupByFields: ['encounter_id']
		});

		const $container = $('.query-parameters-container[data-query-name="count_encounters"]');
		
		// Show the did_react_properly field and set to "No"
		$container.find('.show-query-parameter-button[data-field-name="did_react_properly"]').click();
		$('#count_encounters-did_react_properly').val([0]).change();
	}

	Constructor.prototype.onImproperReactionsCountClick = function() {
		this.setCountEncountersParameters({
			countBy: 'improper_reaction_id', 
			groupByFields: ['improper_reaction_code']
		});
	}

	Constructor.prototype.onImproperReactionsPerUserGroupClick = function() {
		this.setCountEncountersParameters({
			countBy: 'improper_reaction_id', 
			groupByFields: ['general_human_activity_code']
		});

		const $container = $('.query-parameters-container[data-query-name="count_encounters"]');
		
		// Show the did_react_properly field and set to "No"
		$container.find('.show-query-parameter-button[data-field-name="did_react_properly"]').click();
		$('#count_encounters-did_react_properly').val([0]).change();
	}

	Constructor.prototype.onProperVsImproperReactionsClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ['did_react_properly']
		});
	}

	Constructor.prototype.onEastForkProperVsImproperReactionsClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ['did_react_properly']
		});
	
		const $container = $('.query-parameters-container[data-query-name="count_encounters"]');
		
		// Show the place_name_code field and set to "East Fork Toklat"
		$container.find('.show-query-parameter-button[data-field-name="place_name_code"]').click();
		$('#count_encounters-place_name_code').val([26]).change();

	}

	Constructor.prototype.onEnctountersPerBackcountryUnitClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ['backcountry_unit_code']
		});

		// Set human activity to everything but BC hiking and camping
		this.setFilterField(
			'backcountry_unit_code', 
			{
				values: ['null'],
				equalTo: false
			}
		);
	}

	Constructor.prototype.onEnctountersPerPlaceNameClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ['place_name_code']
		});

		// Set human activity to everything but BC hiking and camping
		this.setFilterField(
			'place_name_code', 
			{
				values: ['null'],
				equalTo: false
			}
		);
	}

	Constructor.prototype.onEnctountersPerPlaceNameMgmtClassClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ['place_name_code'],
			pivotField: 'management_classification_code'
		});

		// Set human activity to everything but BC hiking and camping
		this.setFilterField(
			'place_name_code', 
			{
				values: ['null'],
				equalTo: false
			}
		);
	}

	Constructor.prototype.onEnctountersPerUserGroupClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ['general_human_activity_code']
		});
	}

	Constructor.prototype.onFrontcountryEnctountersPerUserGroupClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ['general_human_activity_code']
		});

		// Set human activity to everything but BC hiking and camping
		this.setFilterField(
			'general_human_activity_code', 
			{
				values: [1,2],
				equalTo: false
			}
		);
	}

	Constructor.prototype.onMgmtClasssPerUserGroupClick = function() {
		this.setCountEncountersParameters({
			countBy: 'encounter_id', 
			groupByFields: ['general_human_activity_code'],
			pivotField: 'management_classification_code'
		});
	}


	/*
	When the window is resized, set inline CSS height because some queries need to to make scrolling work properly
	*/
	Constructor.prototype.onWindowResize = function(e) {
		const queryName = $('.query-option.selected').data('query-name');
		const $container = $(`.query-parameters-container[data-query-name="${queryName}"]`);
		$container.height($container.height()); //.height() is syntactic sugar for element.scrollHeight
	}


	/*
	Event handler for .show-query-parameter-button (where clauses for count_encounters)
	*/
	Constructor.prototype.onShowQueryParameterButtonClick = function(e) {
		const $button = $(e.target).ariaHide(true);
		const fieldName = $button.data('field-name');

		const $container = $button.closest('.query-parameters-container');

		// Show the field
		$container.find(`.input-field[name=${fieldName}]`).closest('.field-container.collapse').collapse('show');
	}


	/*
	Event handler for .hide-query-parameter-button (where clauses for count_encounters)
	*/
	Constructor.prototype.onHideQueryParameterButtonClick = function(e) {
		const $fieldContainer = $(e.target).closest('.field-container').collapse('hide');
		
		// since datetime fields have multuple input-fields, but only one has the name attribute,
		//	filter for .input-fields that have a truthy name
		const fieldName = $fieldContainer.find('.input-field')
			.filter((_, el) => el.name) 
			.attr('name');

		$fieldContainer.closest('.query-parameters-container')
			.find(`.show-query-parameter-button[data-field-name=${fieldName}]`)
			.ariaHide(false);
	}


	/*
	When a user changes the gorup by or pivot field, make sure that the values of each field 
	DO NOT overlap. Also, when the group by or pivot field is backcountry_location_codes, 
	make sure is_backcountry_yes_no is set
	*/
	Constructor.prototype.onGroupByPivotFieldChange = function(e) {
		const $target = $(e.target);
		const targetIsGroupBy = $target.attr('name') === 'group_by_fields';

		const targetValue = $target.val();
		const targetValueText = targetIsGroupBy ? 
			$target.find('option:selected').map((_, el) => [el.innerHTML]).get() :
			$target.find(`option[value="${targetValue}"]`).text();
		const targetLabelText = $target.siblings('.field-label').text();

		let $otherField = targetIsGroupBy ? 
			$('#count_encounters-pivot_field') : 
			$('#count_encounters-group_by_fields');
		const otherValueText = $otherField.find(`option[value="${$otherField.val()}"]`).text();
		const otherLabelText = $otherField.siblings('.field-label').text();
		
		// The string.include('') evaluates to true, so if either string is empty, do nothing 
		if (targetValueText === '' || otherValueText === '') return;

		const showMessage = targetIsGroupBy ? 
			targetValueText.includes(otherValueText) : 
			otherValueText.includes(targetValueText);
		if (showMessage) {
			$target.val($target.data('current-value'));
			const message = `The "${otherLabelText}" field ${targetIsGroupBy ? 'is already set to' : 'already includes'} "${otherValueText}". Either` + 
				` choose a different "${targetLabelText}" value or change the "${otherLabelText}" value.`;
			showModal(message, `Invalid ${targetLabelText} value`);
		}
	}


	/*
	Toggle between showing the single and double value field if the operator is "BETWEEN"
	*/
	Constructor.prototype.onDatetimeQueryOperatorChange = function(e) {
		const $target = $(e.target);
		const isBetween = $target.val() === 'BETWEEN';
		$target.siblings('.single-value-field').ariaHide(isBetween);
		$target.siblings('.query-option-double-value-container').ariaHide(!isBetween);
		$target.closest('.field-container').toggleClass('is-between', isBetween);
	}


	/*
	Helper function to get all selects options of a multi-select
	*/
	Constructor.prototype.getAllSelectOptions = function($select) {
		return $select.find('option').map((_, el) => el.value).get().filter(v => v !== '');
	}


	Constructor.prototype.onAddAllMultiselectOptionsClick = function(e) {
		const $button = $(e.target).closest('button');
		const $select = $button.siblings('select');
		const allOptionsAdded = $button.text() === 'remove all';
		if (allOptionsAdded) {
			$select.val([]).change();
			$button.text('add all');
		} else {
			$select.val(_this.getAllSelectOptions($select)).change();
			$button.text('remove all');
		}
	}

	Constructor.prototype.resizeQueryParameterContainer = function(e) {
		const mouseYCoordinate = e.pageY;
		const $container = $('.query-parameters-container:not(.hidden)');
		const $dragbar = $('#query-parameter-dragbar');
		const lastDraggedYCoordinate = $dragbar.data('last-dragged-y') || window.screen.height;

		// if the container no longer needs to scroll, don't let the user keep expanding it
		if (	
				// user is trying to expand the div
				lastDraggedYCoordinate < mouseYCoordinate && 
				// the container is as tall as its contents
				$container[0].scrollHeight <= $container[0].offsetHeight
			) {
			return;
		}

		// Also make sure the result table will show at least 1 row
		const maxMouseYCoordinate = $('.main-content-wrapper')[0].offsetHeight 
			- $('.query-details-container').css('padding').replace('px', '') // make sure padding is accommodated for
			- (($(':root').css('--climberdb-data-table-row-height') || '60').replace('px', '') * 2); // make sure header and 1 row of table is visible
		if (mouseYCoordinate > maxMouseYCoordinate) {
			return;
		}
		
		const currentHeight = parseInt($container.css('height').replace('px', ''));
		const offset = _this.minDragbarPageY - $('#run-query-button')[0].offsetHeight;
		const newHeight = (mouseYCoordinate - offset) + 'px';
		$container
			.css('height', newHeight)
			.css('max-height', newHeight);

		$dragbar.data('last-dragged-y', mouseYCoordinate);
	}


	/*
	Helper function to reset the values/classes of all inputs within a given parent to their defaults
	*/
	Constructor.prototype.clearInputFields = function({
		parent='body', 
		triggerChange=true, 
		removeAccordionCards=false,
		excludeClass='.ignore-on-clear'
	}={}) {
		
		const $parent = $(parent);

		// if removing cards, do that first since that might remove 
		if (removeAccordionCards) {
			$parent.find('.accordion .card:not(.cloneable)').remove();
		}

		for (const el of $parent.find(`.input-field:not(${excludeClass})`)) {
			const $el = $(el);

			// Skip any input-fields with a cloneable parent can't filter these out in .find() 
			//	because inputs that are the descendants of .cloneables aren't the **immediate** 
			//	descendants of .cloneables so there's always a non-.clineable parent in 
			//	between the .cloneable and the input. Those inputs, therefore, don't get filtered out
			if ($el.closest('.cloneable').length) continue;

			const defaultValue = $el.data('default-value')
			if ($el.is('.input-checkbox')) {
				$el.prop('checked', defaultValue || false); 
			} else if ($el.is('select')) {
				// add the default option back in
				const placeholderText = $el.attr('placeholder')
				if (placeholderText && !$el.find('option[value=""]').length) {
					$(`<option value="">${placeholderText}</option>`)
						.insertBefore(
							$el.find('option:first-child')
						);
				}
				el.value = defaultValue || '';
				$el.toggleClass('default', !defaultValue);
					//.change();
			} else {
				el.value = defaultValue || null;
			}

			$el.removeData('table-id')
				// call this too because removeData() only removes things that 
				//	were set via .data(), not attr('data-*'): 
				//	https://api.jquery.com/removeData/
				.removeAttr('data-table-id'); 

			if (triggerChange) $el.change();
		}
	}


	Constructor.prototype.onAddNumericStatButtonClick = function() {
		_this.addNumericStatField();
	}

	Constructor.prototype.onRemoveNumericStatButtonClick = function(e) {
		$(e.target).closest('.stat-field-row').remove();
	}

	/*
	When a user clicks the dragbar, 
	*/
	Constructor.prototype.onDragbarMouseDown = function(e) {
		e.preventDefault();
		const $dragbar = $('#query-parameter-dragbar').addClass('resizing');
		$('body').mousemove(e => {
			_this.resizeQueryParameterContainer(e)
		});
	}

	/*
	When the user releases the dragbar, remove the mousemove event and the .resizing class
	*/
	Constructor.prototype.onDragbarMouseUp = function(e) {
		$('#query-parameter-dragbar').removeClass('resizing');
		$('body').off('mousemove');
	}


	Constructor.prototype.queryCountEncounters = function() {

		if (!this.validateFields('count_encounters')) return;

		const $container = $('.query-parameters-container[data-query-name="count_encounters"]');
		const $whereFields = $container.find(`
				.field-container.collapse.show .where-clause-field:not(.hidden), 
				.field-container.collapse.show .where-clause-field.datetime-query-option
			`)
			.filter((_, el) => !$(el).closest('.collapse:not(.show)').length)
		let whereClauses = $whereFields.map((_, el) => {
				const $el = $(el);
				// If this is a datetime query option, need to combine it with the operator value
				if ($el.is('.datetime-query-option')) {
					const operator = $el.siblings('.query-option-operator').val();
					const $betweenFields = $el.siblings('.query-option-double-value-container').find('.double-value-field');
					const whereValue = operator === 'BETWEEN' ? 
						$betweenFields.map((_, f) => `'${f.value}'`).get().join(' AND ') :
						`'${$el.val()}'`;
					return `${el.name} ${operator} ${whereValue}`;
				} 
				// Otherwise, it's a normal field. In this case, multiple select values need to be gathered in an array, whereas normal fields just need 'fieldname = value'
				else {
					return this.whereFieldToClause(el);
				}
			}).get();
		
		// DENA staff regularly toggle observations in or out of queries, so this should be a separate option
		//	to make including/excluding them more explicit
		if ($('#count_encounters-include_observations').val() === 'no') {
			whereClauses.push(`management_classification_code <> ${this.observationManagementClassCode}`)
		}

		// If there were any WHERE clauses, add the "WHERE" to the beginning
		let whereClausesString = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
		
		
		// const includeObservationsClause = $('#count_encounters-include_observations').val() === 'no' ?
		// 	` ${whereClausesString.startsWith('WHERE') ? ' AND': 'WHERE'} management_classification_code <> ${this.observationManagementClassCode}` :
		// 	'';
		// whereClausesString
		
		// Get field/value pairs to be able to get human-readable values
		const whereFields = Object.fromEntries(
			$whereFields.map(
				(_, el) => 
					[[el.name, $(el).data('validation-field-name') || 
					$(el).siblings('.field-label').text()]]
			).get()
		);

		let pivotField = '',
			pivotAlias = '',
			groupBySelectFields = [],
			groupByAliases = [],
			additionalStats = '',
			outerSelectClause = '',
			innerSelectStatement = '',
			joins = '',
			groupByClause = '';
		
		const returnData = $('#count_encounters-summary_or_records').val()
		//if (returnData === 'summary') {
		// Collect the group by fields in an object with key/value pairs as field_name: alias 
		const groupByFields = Object.fromEntries(
			$('#count_encounters-group_by_fields').val()
				.map(field => [field, $(`#count_encounters-group_by_fields option[value="${field}"]`).text()])
		);

		innerSelectStatement = this.countEncountersBySelectMap[$('#count_encounters-count_field').val()];
		if (!innerSelectStatement) {
			console.error('Invalid selectFrom option: ' + $('#count_encounters-count_field').val());
			return;
		}



		// Get pivot field
		const $pivotFieldSelect = $('#count_encounters-pivot_field');
		pivotField = $pivotFieldSelect.val();
		pivotAlias = pivotField ? $pivotFieldSelect.find(`option[value=${pivotField}]`).text() : '';
		const booleanPivotFieldCase = `CASE
			WHEN ${pivotField} = 1 THEN 'Yes'
			WHEN ${pivotField} = 0 THEN 'No'
			WHEN ${pivotField} = -1 THEN 'Unknown'
			ELSE ${pivotField}::text
		END As "${pivotAlias}" 
		`;
		const pivotSelect = 
			pivotField.endsWith('_code') ? 
				`${pivotField}s.name AS "${pivotAlias}"` :
			this.booleanResponseFields.includes(pivotField) ? 
				booleanPivotFieldCase :
			`${pivotField} AS "${pivotAlias}"`
			;

		for (const field in groupByFields) {
			if (field.endsWith('_code')) {
				joins += `LEFT JOIN ${field}s ON ${field}=${field}s.code `;
			} else if (this.booleanResponseFields.includes(field)) {
				joins += `LEFT JOIN boolean_response_codes b_${field} ON ${field} = b_${field}.code `;
			}
		}
		if (pivotField && pivotField.endsWith('_code')) joins += `LEFT JOIN ${pivotField}s ON ${pivotField}=${pivotField}s.code `;

		// get string of the fields to select with aliases (e.g., SELECT field AS alias, ...). For lookup fields, show the display name from the *_codes table rather than the numeric code
		groupBySelectFields = Object.entries(groupByFields).map(this.fieldToSelectAlias).join(', ');
		const groupByFieldSelects = pivotField ? `${pivotSelect}, ${groupBySelectFields}` : groupBySelectFields;
		outerSelectClause = `${groupByFieldSelects} ${additionalStats}, count(*) AS "Count"`;
		groupByAliases = Object.values(groupByFields);
		let groupByAliasString = pivotField ? 
			`"${pivotAlias}", "${groupByAliases.join('", "')}"` : 
			`"${groupByAliases.join('", "')}"`;
		groupByClause = `GROUP BY ${groupByAliasString} ORDER BY ${groupByAliasString}`;

		const pivotAndGroupByAliases = groupByAliases.concat([pivotAlias])
		if (['Day', 'Day of year'].some(alias => pivotAndGroupByAliases.includes(alias))) {
			const startSearchDate = $('#count_encounters-day_search_start').val();
			const endSearchDate = $('#count_encounters-day_search_end').val();
			joins += ` INNER JOIN (SELECT generate_series('${startSearchDate}', '${endSearchDate}', interval '1 day') AS day) days ON day BETWEEN actual_departure_date AND actual_return_date`
		}

		// The columns of the result will change with each query, so set it here
		this.queries.count_encounters.columns = groupByAliases.concat(['Count']);
		this.queries.count_encounters.hrefs = {} // reset in case a raw-data query was run before

		// Get stat fields
		for (const el of $('.stat-field-row:not(.cloneable)')) {
			const $row = $(el);
			const $statNameSelect = $row.find('.numeric-stat-name');
			const $fieldNameSelect = $row.find('.numeric-stat-field-name');
			const stat = $statNameSelect.val();
			const fieldName = $fieldNameSelect.val();
			const fieldDisplayName = $fieldNameSelect.find(`option[value="${fieldName}"]`).text();
			const statDisplayName = $statNameSelect.find(`option[value="${stat}"]`).text();
			const columnName = `${statDisplayName} ${fieldDisplayName}`;
			outerSelectClause += `, round(${stat}(${fieldName}), 1) AS "${columnName}"`;
			this.queries.count_encounters.columns.push(columnName);
		}

		if ('encounter_id' in groupByFields) {
			this.queries.count_encounters.hrefs = {
				'Report ID': 'query.html?id={Report ID}'
			}
		}

		/*} else { // otherwise this is a raw-data query

			// Add joins for lookup tables so the "WHERE"-criteria fields 
			//	can show human-readable values, not numeric codes
			for (const field of Object.keys(whereFields)) {
				if (field.endsWith('_code')) {
					joins += `LEFT JOIN ${field}s ON ${field}=${field}s.code `
				}
			}
			// Get aliases to add to query info .columns property
			const whereFieldAliases = Object.values(whereFields);
			// Get WHERE-criteria field part of SELECT clause because this will be the same 
			//	regardless of which raw-data query is run
			const whereFieldSelectString = Object.entries(whereFields).map(this.fieldToSelectAlias).join(', '); 
			
			this.queries.count_encounters.columns = ['Report ID', ...whereFieldAliases];
			outerSelectClause = 'encounter_id AS "Report ID", climber_id, ' + whereFieldSelectString;
			innerSelectStatement = this.countEncountersBySelectMap[$('#count_encounters-count_field').val()];
			this.queries.count_encounters.hrefs = {
				'Report ID': encodeURI('query.html?{"encounters": {"id": {"value": {encounter_id}, "operator": "="}}}')
			}
		
		}*/

		let sql = this.queries.count_encounters.sql
			.replace('{outer_select}', outerSelectClause)
			.replace('{inner_select}', innerSelectStatement)
			.replace('{where_clauses}', whereClausesString)
			.replace('{joins}', joins)
			.replace('{group_by}', groupByClause);

		this.submitQuery(
			sql, 
			{
				queryName: 'count_encounters', 
				showResult: !groupBySelectFields.length || !pivotField //only show the result with the default display function if the result shouldn't be pivoted (raw data or simple group-by)
			}
		).done(response => {
			if (pivotField && !pythonReturnedError(response)) {
				const result = response.data || [];
				let groupValues = {};
				let pivotValues = [];
				for (const row of result) {

					const groupByValues = Object.fromEntries(groupByAliases.map(alias => [alias, row[alias]]));
					const groupByValueString = Object.values(groupByValues).toString();
					const pivotValue_ = row[pivotAlias];
					const count = Object.fromEntries([[pivotValue_, row.Count]]);
					groupByValues.idString = groupByValueString;
					groupValues[groupByValueString] = {...groupValues[groupByValueString] || groupByValues, ...count}
					pivotValues.push(pivotValue_)
				}

				let pivotedResult = []
				pivotValues = [...new Set(pivotValues)].sort();
				// Fill nulls with 0 for each row
				for (const pivotedRow of Object.values(groupValues)) {
					for (const pivotValue_ of pivotValues) {
						if (!pivotedRow[pivotValue_]) pivotedRow[pivotValue_] = 0;
					}
					pivotedResult.push(pivotedRow);
				}

				this.queries.count_encounters.columns = groupByAliases.concat(pivotValues);
				this.result = sortDataArray(pivotedResult, 'idString');

				this.showResult(this.result, 'count_encounters');
			}
		});
	}

	Constructor.prototype.showResult = function(
		result, 
		{
			queryName= $('.query-option.selected').data('query-name'), 
			dataOnly=false
		}={}
	) {

		const queryInfo = _this.queries[queryName];
		const hrefs = queryInfo.hrefs || {};
		const columns = queryInfo.columns;
		const columnsHTML = columns.map(c => `
			<th>	
				<button class="text-only-button sort-column-button" data-field-name="${c}">
					<span>${c}</span>
					<i class="fa fa-solid fa-sort fa-circle-sort-up"></i>
				</button>
			</th>	
			`).join('');
		var rowsHTML = '';
		
		const cssClasses = queryInfo.cssColumnClasses || {};

		// Iterate through results and build row HTML
		for (const row of result) {
			let cells = '';
			// Loop through columns in order
			for (const c of columns) {
				// default to cell content just being the result text
				let cellContent = row[c];
				if (!(c in row)) continue;

				// If this column has an href entry, make the cell content an anchor tag
				if (hrefs[c]) {
					let urlString = hrefs[c];
					// Find the 
					for (const match of urlString.match(/\{[\w\s]+\}/g)) {
						urlString = urlString
							.replaceAll(
								match, 
								row[match.replaceAll(/\{|\}/g, '')]
							)
					}
					cellContent = `<a href="${urlString}" target="_blank">${row[c]}</a>`;
				} 
				cells += 
					`<td>
						<span 
							class="cell-content ${cssClasses[c] || ''}">
								${cellContent}
						</span>
					</td>`;
			}
			
			rowsHTML += `<tr>${cells}</tr>`;
		}

		if (dataOnly) {
			$('.query-result-container tbody')
				.empty()
				.append(rowsHTML);
		} else {
			// Empty the result container
			$('.query-result-container')
				.empty()
				.append(`
					<table class="climberdb-data-table">
						<thead>
							<tr>${columnsHTML}</tr>
						</thead>
						<tbody>
							${rowsHTML}
						</tbody>
					</table>
				`);
		}
		// Show the export button
		$('#export-data-button, .table-row-counter-wrapper').ariaHide(false);
		$('.table-row-counter').text(result.length)

	}


	Constructor.prototype.validateFields = function(queryName) {
		validateFields($(`.query-details-container [data-query-name=${queryName}]`));
		// If the field has a .cloneable ancestor, remove the error field
		let $errors = $('.error');
		for (const el of $errors) {
			const $input = $(el);
			if ($input.closest('.cloneable').length) $input.removeClass('error');
		}
		const isValid = $('.error').length === 0;
		if (!isValid) {
			const $firstErrorField = $errors.first();
			const firstErrorFieldName = $firstErrorField.data('validation-field-name') || $firstErrorField.siblings('.field-label').text();
			const message = `The field <strong>${firstErrorFieldName}</strong> must be filled` +
				' in before you can run this query.';
			const eventHandler = () => {$('#alert-modal .confirm-button').click(() => {$firstErrorField.focus()})}
			showModal(message, 'Missing Parameter', {modalType: 'alert', eventHandlerCallable: eventHandler})
			$errors.removeClass('error');
		}

		return isValid;
	}


	/*
	Helper to show/hide the loading indicator when a query is running. This hides the 
	"run query" button so users can't click it again until the query finishes
	*/
	Constructor.prototype.toggleQueryLooadingIndicator = function({hide=true}={}) {
		$('#run-query-loading-indicator').ariaHide(hide);
		$('#run-query-button').ariaHide(!hide);
	}


	/*
	Helper function to submit SQL and optionally show result. This needs to be separated from runQuery() so that custom 
	query processing functions can still use the same code
	*/
	Constructor.prototype.submitQuery = function(sql, {sqlParameters={}, queryName=$('.query-option.selected').data('query-name'), showResult=true}={}) {

		_this.toggleQueryLooadingIndicator({hide: false})

		return queryDB({sql: sql, sqlParameters: sqlParameters})
			.done(response => {
				const queryDisplayName = $('.query-option.selected').text();
				const errorMessage = `There was a problem with the '${queryDisplayName}' query.`
				if (pythonReturnedError(response, {errorExplanation: errorMessage})) {
					return;
				} else if (showResult) {
					_this.result = response.data || [];
					_this.ancillaryResult = [];
					
					const queryInfo = _this.queries[queryName];
					// If this query has a custom result handler, call that. Otherwise, fallback to the default handler
					if (queryInfo.customResultHandler) {
						queryInfo.customResultHandler(_this.result);
					} else {
						_this.showResult(_this.result, queryName);
					}
				}
			}).always(() => {
				_this.toggleQueryLooadingIndicator({hide: true})
			})
	}


	/*
	Execut a simple query. Anything surrounded by {} is assumed to be a field name that should be replaced with the value of the field whose name attribute is field
	*/
	Constructor.prototype.runQuery = function(queryName, {sqlParameters={}, showResult=true}={}) {

		if (!_this.validateFields(queryName)) return;

		const queryInfo = _this.queries[queryName];
		var sql = queryInfo.sql;
		for (const el of $(`.query-parameters-container[data-query-name=${queryName}] .input-field`)) {
			sql = sql.replaceAll(`{${el.name}}`, _this.getInputFieldValue($(el)));
		}

		return _this.submitQuery(sql, {sqlParameters: sqlParameters, queryName: queryName, showResult: showResult});
	}


	Constructor.prototype.onSortDataButtonClick = function(e) {
		const $button = $(e.target).closest('.sort-column-button');

		// if the column was already sorted and descending, then make it ascending. 
		//	Otherwise, the column will be sorted ascending
		let sortAscending;
		const isSorted = $button.is('.sorted');
		if (isSorted) {
			sortAscending = $button.is('.descending');
		} else {
			sortAscending = true;
		}
		

		const fieldName = $button.data('field-name');
		
		_this.result = sortDataArray(_this.result, fieldName, {ascending: sortAscending});
		const queryName = $('.query-option.selected').data('query-name');
		_this.showResult(_this.result, queryName, {dataOnly: true});

		//$('.sort-column-button').removeClass('sorted');
		$(`.sort-column-button[data-field-name="${fieldName}"]`).addClass('sorted')
			.toggleClass('descending', !sortAscending);
	}


	Constructor.prototype.fieldToSelectAlias = function([field, alias]) {
		return field.endsWith('_code') ? 
				`${field}s.name AS "${alias}"` : 
			_this.booleanResponseFields.includes(field) ?
				`b_${field}.name AS "${alias}"` :
			`${field} AS "${alias}"`;
	}


	Constructor.prototype.whereFieldToClause = function(el) {
		const value = $(el).val();
		const fieldName = el.name;
		let clause = '';
		if (el.multiple) { 
			// If the value includes null and other values, add IS NULL OR statement
			let isNullClause = '';
			if (value.includes('null')) isNullClause = `${fieldName} IS NULL`;

			// Make the field IN () clause for all selected options except null
			let nonNullClause = '';
			const nonNullValues = value.filter(v => v !== 'null');
			if (nonNullValues.length) nonNullClause = `${fieldName} IN (${nonNullValues.join(',')})`;
			clause = 
				isNullClause && !nonNullClause ? isNullClause : //just IS NULL
				!isNullClause && nonNullClause ? nonNullClause : // just IN ()
				`(${isNullClause} OR ${nonNullClause})`; // else both
		} else {
			clause = `${fieldName} = ${value}`
		}

		return clause;
	}


	Constructor.prototype.onRunQueryButtonClick = function() {
		const queryName = $('.query-option.selected').data('query-name');
		if (queryName === 'count_encounters') {
			_this.queryCountEncounters();
		} else {
			_this.runQuery(queryName);
		}
	}

	Constructor.prototype.fillYearSelects = function() {
		const sql = `
			SELECT 
				extract(
					year FROM 
					generate_series(
						min(start_date), 
						max(start_date), 
						'1 year'
					)
				) AS year 
			FROM {schema}.encounters 
			ORDER BY 1 DESC`;
		return queryDB({sql: sql})
			.done(response => {
				if (!pythonReturnedError(response)) {
					$('.year-select-field.nullable').append(`<option value=" IS NOT NULL">All</option>`);
					for (const row of response.data || []) {
						$('.year-select-field:not(.nullable)').append(`<option value=${row.year}>${row.year}</option>`);
						// .nullable fields have to include everything except the left side of the expression 
						//	(e.g., just " IS NOT NULL" of "year IS NOT NULL"), so the value of each <option>
						//	is actually "= <year>"
						$('.year-select-field.nullable').append(`<option value="= ${row.year}">${row.year}</option>`);
					}
					this.MAX_YEAR = Math.max(response.data.map(({year}) => year));
				}
			})

	}


	/*
	Default option to handler export button clicks
	*/
	Constructor.prototype.defaultExportHandler = function(queryName) {

		const queryInfo = _this.queries[queryName];
		return $.post({
			url: 'flask/analysis/export',
			data: {
				query_name: $('.query-option.selected').data('export-name') || queryName,
				export_type: 'excel',//$('#input-export_type').val(),
				columns: JSON.stringify(queryInfo.columns),
				query_data: JSON.stringify(_this.result),
				ancillary_data: JSON.stringify(_this.ancillaryResult),
				excel_start_row: queryInfo.excelStartRow || 0,
				excel_write_columns: queryInfo.excelWriteColumns || false,
				query_url: _this.queryToURL()
			}
		})
	}


	Constructor.prototype.onExportDataButtonClick = function() {
		showLoadingIndicator('export');
		const queryName = $('.query-option.selected').data('query-name');
		const queryInfo = _this.queries[queryName];
		let deferred;
		if (queryName === 'guide_company_client_status' || queryName === 'guided_company_briefings') {
			deferred = _this.guideCompanyExportHandler(queryName);
		} else {
			deferred = _this.defaultExportHandler(queryName);
		}

		// Handle the response
		const exportType = $('#input-export_type').val();
		deferred.done(resultString => {
			if (pythonReturnedError(resultString, {errorExplanation: 'An unexpected error occurred while exporting the data.'})) {
				$('#exports-modal').modal('hide');
				return;
			} else {
				resultString = resultString.trim()
				// Either prompt a download if the file is an Excel doc
				//if (exportType === 'excel') {
				window.location.href = resultString;
				// or open the file in a new browser tab if it's a PDF
				// } else if (exportType === 'pdf') {
				// 	window.open(resultString, '_blank');
				// } else {
				// 	print('export type not understood: ' + exportType)
				// }
			}	
		}).fail( (xhr, status, error) => {
			$('#exports-modal').modal('hide');
			_this.showModal(`An unexpected error occurred while exporting the data: ${error}.${_this.getDBContactMessage()}`, 'Unexpected Error');
		}).always(() => {
			hideLoadingIndicator();
		})
	}


	/*
	Load query parameters from the URL query parameters
	*/
	Constructor.prototype.loadQueryFromURL = function() {
		const urlParams = parseURLQueryString();

		// If neither the queryName or queryID were given, exit
		if (!('queryName' in urlParams || 'queryID' in urlParams)) return;

		const $queryButton = $(`[data-query-name="${urlParams.queryName}"],#${urlParams.queryID}`)
			.first();

		// If neither the queryName or the queryID were valid, just exit
		if ($queryButton.length === 0) return;

		$queryButton.click();

		// query params are a JSON string, so parse it
		const queryParams = $.parseJSON(urlParams.queryParams || '{"statFields": []}');
		
		for (const {fieldName, statistic} of (queryParams.statFields || {})) {
			const $row = _this.addNumericStatField();
			$row.find('.numeric-stat-field-name').val(fieldName).change();
			$row.find('.numeric-stat-name').val(statistic).change();
		}

		// Remove since the key isn't an ID
		delete queryParams.statFields;

		// Loop through each query param and set the associated input-field value
		for (const id in queryParams) {
			let paramValue = queryParams[id];
			const $paramInput = $('#' + id);
			// If this is a select with potentially multiple selected options,
			//	the value from the URL will be a CSV string
			if ($paramInput.is('[multiple]')) {
				paramValue = paramValue.split('|').map(s => s.trim());
			}
			$paramInput.val(paramValue).change();

			const fieldName = (
				$paramInput.is('.double-value-field.datetime-query-option') ? 
					$paramInput.closest('.where-clause-date-field-container')
						.find('.single-value-field.datetime-query-option') :
					$paramInput
			).attr('name');
			$(`.show-query-parameter-button[data-field-name=${fieldName}]`).click();
		}

		return urlParams.queryName || urlParams.queryID;
	}


	/*
	Save query parameters as a URL for the query page
	*/
	Constructor.prototype.queryToURL = function() {

		var urlParams = {};
		const $selectedQuery = $('#query-option-list > .query-option.selected');
		const queryID = $selectedQuery.attr('id');
		const queryName = $selectedQuery.attr('data-query-name');

		const $container = $(`.query-parameters-container[data-query-name="${queryName}"]`)
		// find inputs that have a value entered/selected and that aren't hidden
		var queryParams = {};
		for (const el of $container.find('.input-field:not(:placeholder-shown):not(.default)')) {
			const $input = $(el);
			
			// If the param field isn't visible or it's a stat field, skip it
			if ($input.closest('.hidden,.collapse:not(.show),.stat-field-row').length) continue;
			
			const inputID = $input.attr('id');
			const rawValue = $input.val();
			
			// if this is a select with potentially multiple options selected, join them
			//	all as a CSV string
			const paramValue = $input.is('[multiple]') ? rawValue.join('|') : rawValue;
			queryParams[inputID] = paramValue;
		}

		// collect stat fields as an array of objects
		queryParams.statFields = [];
		for (const el of $('.stat-field-row:not(.cloneable)')) {
			const $row = $(el);
			queryParams.statFields.push({
				fieldName: $row.find('.numeric-stat-field-name').val(),
				statistic: $row.find('.numeric-stat-name').val()
			})
		}


		urlParams.queryParams = JSON.stringify(queryParams);
		
		// make the query params into a JSON string
		return encodeURI(
			window.location.href.split('?')[0] +
			`?queryName=${queryName}&queryParams=${JSON.stringify(queryParams)}`
		)
	}


	/*
	Event handler for copy-query-link-button click
	*/
	Constructor.prototype.onCopyQueryLinkButtonClick = function(e) {
		const url = _this.queryToURL();
		copyToClipboard(
			url, 
			{
				modalMessage: `Permalink for this query successfully copied to clipboard`
			});
	}


	Constructor.prototype.checkUserRole = function(e) {
		return getUserInfo()
			.then(userInfo => {
				// _this.username = userInfo.username;
				// _this.userRole = userInfo.role;
				$('#username').text(userInfo.username);
				// If this is the query page, check if the user has permission to access it
				const canAccessData = DATA_ACCESS_USER_ROLES.includes(parseInt(userInfo.role))
				if (!canAccessData) {
					showPermissionDeniedAlert();
				}
			});
	}


	Constructor.prototype.init = function() {
		// Call super.init()
		showLoadingIndicator('init');

		_this.configureMainContent();
		// Initialize select2s individually because the width needs to be set depending on the type of select
		
		_this.initDeferred = $.when(
			_this.checkUserRole(), 
			...fillAllSelectOptions(), 
			_this.fillYearSelects()
		)
		.then(() => {
			$('.has-null-option').append('<option value="null">Null</option>');

			// Initialize select2s individually because the width needs to be set depending on the type of select
			for (const el of $('.bhims-select2')) {
				const $select = $(el);
				$select.select2({
					width: $select.siblings('.hide-query-parameter-button').length ? 'calc(100% - 28px)' : '100%',
					placeholder: $select.attr('placeholder')
				});
				// .select2 removes the .default class for some reason
				$select.addClass('default');
			}

			// Parse the URL query string if there is one and load a query from the URL.
			//	If there isn't a query string, this method does nothing. In that case,
			//	just select the first query option
			_this.loadQueryFromURL() || $('#query-option-list .query-option').first().click();
		})
		.always(() => {
			hideLoadingIndicator();
		});

		return _this;
	}

	return Constructor;
})()