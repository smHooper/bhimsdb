/*Custom jQuery selector for selecting sections and section indicators*/
$.expr[':'].isSection = function(element, index, meta) {
	//meta[3] is the param passed in isSection(<page-index>)
	return $(element).data('page-index') == meta[3];
}


function isInViewport(el) {
	const rect = el.getBoundingClientRect();
	return (
		rect.top >= 0 &&
		rect.left >= 0 &&
		rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
		rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
		(rect.top || rect.bottom) &&
		(rect.left || rect.right)
	);
}

const FEET_PER_METER = 3.2808399;

var BHIMSEntryForm = (function() {
	
	/*
	Main Constructor
	*/
	var _this;
	var Constructor = function() {
		// Map stuff
		this.maps = {
			main: {
				map: null,
				mileposts: null,
				roads: {}
			}, 
			modal: {
				map: null,
				mileposts: null,
				roads: {}
			}	
		};
		this.encounterMarker = new  L.marker(
			[0, 0], 
			{
				draggable: true,
				autoPan: true,
			}
		).on('dragend', this.setCoordinatesFromMarker);

		//Other globals
		this.attachmentFiles = {};
		this.fieldInfo = {};
		this.fieldValues = {};
		this.username = '';
		this.userRole = 1;
		this.backcountryUnitCoordinates = {};
		this.placeNameCoordinates = {};
		this.acceptedAttachmentExtensions = {};
		this.confirmLocationSelectChange = false; //set to true after fillFieldValues runs
		this.serverEnvironment = '';
		this.initialNarrativeText = '';
		this.presentMode = false;
		_this = this;
	}


	/* 
	Configure the form using meta tables in the database
	*/
	Constructor.prototype.configureForm = function(mainParentID=null, isNewEntry=true) {

		var config = {},
			pages = {},
			sections = {},
			accordions = {},
			fieldContainers = {},
			fields = {};

		getEnvironment()
			.done(resultString => {
				this.serverEnvironment = resultString.trim();
			})

		const queryParams = parseURLQueryString();
		this.presentMode = queryParams.present === 'true'


		const processQueryResult = (obj, result) => {
			const queryResult = $.parseJSON(result);
			if (queryResult) {
				for (const row of queryResult) {
					obj[row.id] = {...row};
				};
			} 
		}

		//var _this = this; //this hack needed for scope of anonymous functions to reach the Constructor object

		// Query configuration tables from database
		var deferred = $.Deferred();
		$.when(
			this.getFieldInfo(),
			queryDB('SELECT * FROM data_entry_config;')
				.done(result => {
					const queryResult = $.parseJSON(result);
					if (queryResult) {
						config = {...queryResult[0]};
					}
				}),
			queryDB('SELECT * FROM data_entry_pages ORDER BY page_index;')
				.done(result => {processQueryResult(pages, result)}),
			queryDB('SELECT * FROM data_entry_sections WHERE is_enabled ORDER BY display_order;')
				.done(result => {processQueryResult(sections, result)}),
			queryDB('SELECT * FROM data_entry_accordions WHERE is_enabled AND section_id IS NOT NULL ORDER BY display_order;')
				.done(result => {processQueryResult(accordions, result)}),
			queryDB('SELECT * FROM data_entry_field_containers WHERE is_enabled AND (section_id IS NOT NULL OR accordion_id IS NOT NULL) ORDER BY display_order;')
				.done(result => {processQueryResult(fieldContainers, result)}),
			queryDB('SELECT * FROM data_entry_fields WHERE is_enabled AND field_container_id IS NOT NULL ORDER BY display_order;')
				.done(result => {processQueryResult(fields, result)}),
			// Query accepted file attachment extensions for each file type
			queryDB(`SELECT code, accepted_file_ext FROM file_type_codes WHERE sort_order IS NOT NULL;`)
				.then(
					doneFilter=function(queryResultString){
						if (queryReturnedError(queryResultString)) {
							throw 'Accepted file extension query failed: ' + queryResultString;
						} else {
							const queryResult = $.parseJSON(queryResultString);
							for (const object of queryResult) {//queryResult.forEach(function(object) {
								_this.acceptedAttachmentExtensions[object.code] = object.accepted_file_ext;
							}
						}
					},
					failFilter=function(xhr, status, error) {
						console.log(`Accepted file extension query failed with status ${status} because ${error}`)
					}
				)
		).then(() => {
			if (isNewEntry) {
				if (Object.keys(config).length) {
					$('#title-page-title').text(config.entry_form_title);
					$('#title-page-subtitle').text(config.park_unit_name);
					$('.form-page.title-page .form-description').html(config.entry_form_description_html);
					$('#pre-submit-message').text(config.entry_pre_submission_message);
					$('#post-submit-message').text(config.entry_post_submission_message);
				} else {
					alert('Error retrieving data_entry_config');
					return;
				}

				// Add all pages
				if (Object.keys(pages).length) {
					for (const id in pages) {
						const pageInfo = pages[id];
						const index = pageInfo.page_index;
						$(`
							<div id="page-${index}" class="${pageInfo.css_class}" data-page-index="${index}" data-page-name="${pageInfo.page_name}"></div>
						`).insertBefore('.form-page.submit-page');
						$(`
							<li>
								<button class="indicator-dot" type="button" data-page-index="${index}" aria-label="${pageInfo.page_name}">
									<!--<div class="tip">
										<h6>${pageInfo.page_name}</h6>
										<i class="tooltip-arrow"></i>
									</div>-->
								</button>
							</li>
						`).appendTo('.section-indicator.form-navigation')
					}
				} else {
					alert('Error retrieving data_entry_pages');
					return;
				}
			}

			// Add sections
			if (Object.keys(sections).length) {
				for (const id in sections) {
					const sectionInfo = sections[id];
					
					// Skip any section that don't have a page_id defined
					if (!sectionInfo.page_id && isNewEntry) continue;

					const pageInfo = pages[sectionInfo.page_id];
					const titleHTMLTag = sectionInfo.title_html_tag;
					$(`
						<section id="section-${id}" class="${sectionInfo.css_class} ${sectionInfo.is_enabled ? '' : 'disabled'}" >
							<${titleHTMLTag} class="${sectionInfo.title_css_class}">
								${titleHTMLTag == 'div' ? `<h4>${sectionInfo.section_title}</h4>` : sectionInfo.section_title}
							</${titleHTMLTag}>
							<div class="form-section-content"></div>
						</section>
					`).appendTo(isNewEntry ? '#page-' + pageInfo.page_index : mainParentID);
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
											<button class="delete-button delete-card-button icon-button" type="button" data-item-name="${accordionInfo.item_name}" aria-label="Delete ${accordionInfo.item_name}">
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
							<button class="generic-button add-item-button" type="button" onclick="entryForm.onAddNewItemClick(event)" data-target="${accordionHTMLID}" ${dependentAttributes}>
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

							var inputFieldAttributes = `id="${fieldInfo.html_id}" class="${fieldInfo.css_class}" name="${fieldInfo.field_name || ''}" data-table-name="${fieldInfo.table_name || ''}" placeholder="${fieldInfo.placeholder}" title="${fieldInfo.description}"`;
							
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
							const required = fieldInfo.required === 't';
							$(`
								<div class="${fieldInfo.parent_css_class}">
									<${inputTag} ${inputFieldAttributes} ${required ? 'required' : ''}>${inputTagClosure}
									${required ? '<span class="required-indicator">*</span>' : ''}
									${fieldLabelHTML}
								</div>
							`).appendTo($parent);
						}
					}
				}
			}

			// Remove any field conainters that don't have any enabled fields
			$('.field-container:empty').remove();
			$('.units-field-container > .required-indicator, .units-field-container > .field-label').remove();


			// Add event handlers
			//onAddNewItemClick
			//$('.card-header .delete-button').click(this.onDeleteCardClick)
			$('.delete-card-button').click(_this.onDeleteCardClick);

			// Add stuff that can't easily be automated/stored in the DB
			// Do stuff with utility flag classes
			$('.input-field.money-field').before('<span class="unit-symbol unit-symbol-left">$</span>');
			
			const lockedSectionTitles = $('.form-section.admin-section.locked').find('.section-title');
			lockedSectionTitles.append(`
				<button class="unlock-button icon-button" type="button" onclick="onlockSectionButtonClick(event)" aria-label="Unlock">
					<i class="fas fa-lock"></i>
				</button>
			`);
			lockedSectionTitles.after(`
				<div class="locked-section-screen">
					<div>
						<h5>For administrative use only</h5>
						<h6>Click lock button to unlock</h6>
					</div>
				</div>
			`);

			// Add "Describe location by" field
			const locationTypeFieldInfo = this.fieldInfo.location_type;
			if (locationTypeFieldInfo) {
				$(`
					<div class="${locationTypeFieldInfo.parent_css_class}">
						<label class="field-label inline-label" for="input-location_type">Describe location by:</label>
						<select class="${locationTypeFieldInfo.css_class}" id="input-location_type" value="Place name" name="location_type">
							<option value="Place name">Place name</option>
							<option value="Backcountry unit">Backcountry unit</option>
							<option value="Road mile">Road mile</option>
							<option value="GPS coordinates">GPS coordinates</option>
						</select>
					</div>
				`).prependTo('#section-4 .form-section-content');
			}

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
					<div class="marker-container collapse show" id="encounter-marker-container">
						<label class="marker-label">Type coordinates manually above or drag and drop the marker onto the map</label>
						<img id="encounter-marker-img" src="https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png" class="draggable-marker" alt="drag and drop the marker">
					</div>
					
					<div id="expand-map-button-container">
						<button id="expand-map-button" class="icon-button"  title="Expand map" aria-label="Expand map">
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
							<img class="file-thumbnail hidden" src="#" alt="thumbnail" onclick="onThumbnailClick(event, ${isNewEntry})" alt="clickable thumbnail of uploaded file">
						</div>
						<div class="attachment-file-input-container col-6">
							<label class="filename-label"></label>
							<label class="generic-button text-center file-input-label" for="attachment-upload">select file</label>
							<input class="input-field hidden attachment-input" id="attachment-upload" type="file" accept="" name="uploadedFile" data-dependent-target="#input-file_type" data-dependent-value="!<blank>" onchange="entryForm.onAttachmentInputChange(event)" required>
						</div>
					</div>
				`);
			const $attachmentsAccordion = $('#attachements-accordion');

			// Configure narrative field
			const $narrativeField = $('#input-narrative');
			if ($narrativeField.length) {
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
			}

			if (isNewEntry) {
				// Add page indicator for submit page
				$(`
					<li>
						<button class="indicator-dot" type="button" data-page-index="4" aria-label="Submission page">
							<!--<div class="tip">
								<h6>Submit</h6>
								<i class="tooltip-arrow"></i>
							</div>-->
						</button>
					</li>
				`).appendTo('.section-indicator.form-navigation');

				// Set on click for continue button (shown only in title section).
				//	In addition to going to next section, show required indicator explanation
				$('#title-page-continue-button').click((e) => {
					_this.onPreviousNextButtonClick(e, 1);
					$('.form-header').removeClass('hidden');
				})

				$('#previous-button').click(e => {
					_this.onPreviousNextButtonClick(e, -1);
				});
				$('#next-button').click(e => {
					_this.onPreviousNextButtonClick(e, 1);
				});
				$('#submit-button').click(_this.onSubmitButtonClick);
				$('.indicator-dot').click(_this.onIndicatorDotClick);
				$('#reset-form-button').click(_this.onResetFormClick);
				$('#new-submission-button').click(e => {
					e.preventDefault();
					_this.resetForm();
				});
				$('#disable-required-slider-container input[type=checkbox]').change(e => {
					const $checkbox = $(e.target);
					$('.field-container .required-indicator').toggleClass('hidden', $checkbox.is(':checked'));
					$('.input-field.error').removeClass('error');
				});

				// query.js will hide the loading indicator on its own
				hideLoadingIndicator();

			}
			
			$('#expand-map-button').click(_this.onExpandMapButtonClick);

			// Do all other configuration stuff
			// Get field info

			// Some accordions might be permanetnely hidden because the form is simplified, 
			//	but the database still needs to respect the one-to-many relationship. In 
			//	these cases, make sure the add-item-container is also hidden
			$('.accordion.form-item-list.hidden:not(.collapse)')
				.siblings('.add-item-container')
				.addClass('hidden');

			// fill selects
			let deferreds = $('select').map( (_, el) => {
				const $el = $(el);
				const placeholder = $el.attr('placeholder');
				const lookupTable = $el.data('lookup-table');
				const lookupTableName = lookupTable ? lookupTable : $el.attr('name') + 's';
				const id = el.id;
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
				if (isNewEntry) {
					_this.setDefaultInputValues();
					_this.fillFieldValues(_this.fieldValues);
					_this.confirmLocationSelectChange = true;
					// If the user does not have previous data saved, add the first card here in 
					//	case this same form is used for data viewing. If there is saved data, the 
					//	form and all inputs will be restored from the previous session
					$('.accordion.form-item-list').each((_, el) => {
						const tableName = $(el).data('table-name');
						if (!(tableName in _this.fieldValues)) _this.addNewCard($(el));
					});

					// go to the last form paage the user was on
					// *** currently conflicts with addSidebarMenu() and page doesn't scroll
					// const pageName = window.location.pathname.split('/').pop();
					// const currentStorage =  window.localStorage[pageName] ? JSON.parse(window.localStorage[pageName]) : {};
					// const lastPageIndex = currentStorage.selectedPage;
					// if ((lastPageIndex !== undefined) && (lastPageIndex !== -1)) {
					// 	$('.form-footer .form-navigation').removeClass('hidden');
					// 	$('#title-page-continue-button').addClass('hidden');
					// 	$('.form-header').removeClass('hidden');
					// 	_this.goToPage(lastPageIndex + 1, true);
					// } 
				}

				// Indicate that configuring form finished
				deferred.resolve();
			});

			$('select').change(this.onSelectChange);
			
			// Add distance measurement units to unit selects
			$('.short-distance-select')
				.empty()
				.append(`
					<option value="ft">feet</option>
					<option value="m">meters</option>
				`).val('ft');
				//.change(this.onShortDistanceUnitsFieldChange); //When a field with units changes, re-calculate


			// Set additional change event for initial action selects
			//$('#input-initial_human_action, #input-initial_bear_action').change(this.onInitialActionChange);

			// When an input changes, save the result to the this.fieldValues global object so data are persistent
			$('.input-field').change(this.onInputFieldChange);


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
					const $collapse = $(this);
					if (!$collapse.is('.show')) $collapse.addClass('hidden');
				})
				.on('show.bs.collapse', function () {
					$(this).removeClass('hidden');
				});

			// When any card-label-fields change, try to set the parent card label
			$(document).on('change.onCardLabelFieldChange', '.input-field.card-label-field', e => {this.onCardLabelFieldChange($(e.target))});

			// When the user types anything in a field, remove the .error class (if it was assigned)
			$('.input-field').on('keyup change', this.onInputFieldKeyUp);

			// Set up coordinate fields to update eachother and the map
			$('.coordinates-ddd').change(this.onDDDFieldChange);
			$('.coordinates-ddm').change(this.onDMMFieldChange);
			$('.coordinates-dms').change(this.onDMSFieldChange);
			$('#input-coordinate_format').change(this.onCoordinateFormatChange);
			$('#input-road_mile').change(this.onRoadMileChange);

			// Set up the map
			this.configureMap('encounter-location-map', this.maps.main);
			this.configureMap('modal-encounter-location-map', this.maps.modal)
			this.maps.modal.map.on('moveend', e => { // on pan, get center and re-center this.maps.main.map
					const modalMap = e.target;
					this.maps.main.map.setView(modalMap.getCenter(), modalMap.getZoom());
				}).scrollWheelZoom.enable();

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
			$('#modal-video-preview').on('loadedmetadata', function(e){
				const el = e.target;
				const aspectRatio = el.videoHeight / el.videoWidth;
				
			});
			
			$('#modal-audio-preview').on('loadedmetadata', function(e){
				// Set width so close button is on the right edge of video/audio
				const $el = $(e.target);
				
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
			$(window).on('beforeunload', e => {
				if (isNewEntry) {
					if (Object.keys(_this.fieldValues).length) {//this.fieldValues is cleared on submit
						const pageName = window.location.pathname.split('/').pop();
						var currentStorage = $.parseJSON(window.localStorage[pageName] || '{}');

						// Get the page the user is currently on
						const formPageIndex = parseInt($('.form-page.selected').data('page-index'));
						if (formPageIndex >= 0) currentStorage.selectedPage = formPageIndex;

						// Record map extent
						currentStorage.encounterMapInfo = {
							center: _this.markerIsOnMap() ? _this.encounterMarker.getLatLng() : _this.maps.main.map.getCenter(),
							zoom: _this.maps.main.map.getZoom()
						}

						// Record field values
						currentStorage.fieldValues = {..._this.fieldValues};
						
						// Save
						window.localStorage[pageName] = JSON.stringify(currentStorage);
					}
				} else {
					// Check if editing and warn the user if there are unsaved edits
				}
			});

			// Get username and store for INSERTing data in addition to filling the entered_by field
			this.getUsername()
				.then(() => {
					// Set the view of the form according to user role
					if (this.userRole < 2) { // >2 === assessment or admin
						// Remove the asseessment section bcecause this user doesn't have 
						//	the permission to assess the encounter
						$('form-section.requires-assessment-role').remove();
					} else {
						// Remove locks on admin sections
						$('.unlock-button, .locked-section-screen').remove();
						$('.form-section.admin-section, .form-section.requires-assessment-role').removeClass('locked');
						//$('#input-assessed_by').val(this.username);
						
						if (isNewEntry) {
							addSidebarMenu();
							$('#disable-required-slider-container').removeClass('hidden');
							$('.main-content-wrapper').appendTo('.main-container-with-sidebar');
							$('#username').text(this.username);
							
						}
					}
				});

			// Fill datetime_entered field
			const $datetimeEnteredField = $('#input-datetime_entered');
			if ($datetimeEnteredField.length) { // could be disabled
				const now = new Date();
				//	calculate as a numeric timestamp with the appropiate timezone offset
				//		* 60000 because .getTimezoneOffset() returns offset in minutes
				//		but the numeric timestamp needs to be in miliseconds 
				// Also round to the nearest minute
				const nowLocalTimestamp = Math.round((now.getTime() - (now.getTimezoneOffset() * 60000)) / 60000) * 60000;
				$datetimeEnteredField[0].valueAsNumber = nowLocalTimestamp;
				$datetimeEnteredField.change()
			}

			// Get coordinates for BC units and place names
			queryDB(`SELECT code, latitude, longitude FROM backcountry_unit_codes WHERE sort_order IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;`)
				.then(
					doneFilter=function(queryResultString){
						if (queryReturnedError(queryResultString)) {
							throw 'Backcountry unit coordinates query failed: ' + queryResultString;
						} else {
							const queryResult = $.parseJSON(queryResultString);
							queryResult.forEach(function(object) {
								_this.backcountryUnitCoordinates[object.code] = {lat: object.latitude, lon: object.longitude};
							})
						}
					},
					failFilter=function(xhr, status, error) {
						console.log(`Backcountry unit coordinates query failed with status ${status} because ${error}`)
					}
				);
			queryDB(`SELECT code, latitude, longitude FROM place_name_codes WHERE sort_order IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;`)
				.then(
					doneFilter=function(queryResultString){
						if (queryReturnedError(queryResultString)) {
							throw 'Backcountry unit coordinates query failed: ' + queryResultString;
						} else {
							const queryResult = $.parseJSON(queryResultString);
							queryResult.forEach(function(object) {
								_this.placeNameCoordinates[object.code] = {lat: object.latitude, lon: object.longitude};
							})
						}
					},
					failFilter=function(xhr, status, error) {
						console.log(`Backcountry unit coordinates query failed with status ${status} because ${error}`)
					}
				);

			window.addEventListener('fields-full', e => {
				customizeEntryForm();//setTimeout(() => {customizeEntryForm()}, 5000);
			});

		})
		
		return deferred;
	}


	/*
	Helper function to set default values on inputs from the config table in the database
	*/
	Constructor.prototype.setDefaultInputValues = function() {
		for (const info of Object.values(entryForm.fieldInfo).filter(i => i.default_value != null) ) {
			// Use the name attribute so that inputs in accordions get their values set
			$(`.input-field[name='${info.field_name}']`).val(info.default_value).change();
		}
	}


	/* 
	Fill data entry fields from saved (window.storage) or loaded (from the DB) data 
	*/
	Constructor.prototype.fillFieldValues = function(fieldValues) {

		var key, index, fieldName;//initialize vars instantiated in for statements

		const fieldsFullEvent = new CustomEvent('fields-full', {detail: Date()});

		for (const key in fieldValues) {
			const value = fieldValues[key];
			
			 // reactions are set manually below whereas attachment data is never saved
			if (key === 'reactions' || key === 'attachments') continue;

			// Value is either a string/number corresponding to a single field or an object 
			//	containing a series of values corresponding to an accordion with potentially 
			//	several cards
			if (typeof(value) === 'object' && value !== null) { // corresponds to an accordion
				// Loop through each object and add a card/fill fields 
				const $accordion = $('.accordion:not(.hidden)')
					.filter((_, el) => {return $(el).data('table-name') === key})
				if (!$accordion.length) continue;//if the accordion is hidden, ignore it
				for (const index in value) {
					const $card = this.addNewCard($accordion, index);
					const inputValues = value[index];
					for (const fieldName in inputValues) {
						const thisVal = inputValues[fieldName];
						
						// Find input where the name === to this field
						var $input;
						try {
							$input = $card
								.find('.input-field')
								.filter((_, el) => {return ($(el).attr('name') || '').startsWith(fieldName)});
						} catch {
							console.log($card)
						}
						
						// If this is a checkbox, set the checked property. Otherwise,
						//	just set the val directly
						if ($input.is('.input-checkbox')) {
							$input.prop('checked', thisVal);
						} else {
							$input.val(thisVal);
						}
						//This will unnecessarily call onInputFieldChange() but this is probably
						//	the best way to ensure that all change event callbacks are get called
						$input.change();
					}
				}
			} else { // it's an input, select, or checkbox
				// If this is a checkbox, set the checked property. Otherwise,
				//	just set the val directly
				const $input = $('.input-field')
					.filter((_, el) => {
						return ($(el).attr('name') || '').startsWith(key)})
					.removeClass('default');
				if ($input.is('.input-checkbox')) {
					$input.prop('checked', value);
				} else {
					$input.val(value);
				}

				$input.change();//call change event callbacks
			}
		}

		// Set the text of the contenteditable narrative div
		if ('narrative' in fieldValues) $('#recorded-text-final').text(fieldValues.narrative);

		// Because the reaction select options are based on the reaction-by select and 
		//	the order in which inputs are filled is random, the reaction val might be 
		//	set before the reaction-by val. That makes the reaction val null and also 
		//	messes up setting the card label. The solution here is just to set each 
		//	reaction manually.
		if ('reactions' in fieldValues) {
			const $reactionsAccordion = $('#reactions-accordion');
			const reactions = fieldValues.reactions;
			for (index in reactions) {
				const $card = this.addNewCard($reactionsAccordion, index);
				const $reaction = $('#input-reaction-' + index);
				const $reactionBy = $('#input-reaction_by-' + index)
					.val(reactions[index].reaction_by)
					.change();
				this.updateReactionsSelect($reactionBy)
					.then(() => {
						// For some reason the index var doesn't correspond to the appropriate 
						//	iteration of the for loop (even though $reaction does). Get the 
						//index from the id to set the select with the right val
						const thisIndex = $reaction.attr('id').match(/\d+$/)[0]
						$reaction
							.val(reactions[thisIndex].reaction_code)
							.change();
					});

			}
			
		} 

		window.dispatchEvent(fieldsFullEvent);
	}


	/* 
	Get info from the database about each field 
	*/
	Constructor.prototype.getFieldInfo = function() {
		const pageName = window.location.pathname.split('/').pop();
		const fieldValueString = window.localStorage[pageName] ? window.localStorage[pageName] : null;
		if (fieldValueString) this.fieldValues = $.parseJSON(fieldValueString).fieldValues;

		const sql = `
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

		return queryDB(sql).done(
			queryResultString => {
				const queryResult = $.parseJSON(queryResultString);
				if (queryResult) {
					for (const row of queryResult) {
						const columnName = row.field_name;
						this.fieldInfo[columnName] = {};
						for (const property in row) {
							this.fieldInfo[columnName][property] = row[property];
						}
					};
				}
			}
		).fail(
			(xhr, status, error) => {
			showModal(`An unexpected error occurred while connecting to the database: ${error} from query:\n${sql}.\n\nTry reloading the page.`, 'Unexpected error')
		})//.always(() => {hideLoadingIndicator()});
		/*// Check if the user has a field values from a saved session


		// Determine which table each column belongs to
		const sql = `
			SELECT 
				table_name,
				column_name,
				data_type 
			FROM information_schema.columns 
			WHERE 
				table_schema='public' AND 
				table_name NOT LIKE '%_codes' AND 
				column_name NOT IN ('encounter_id', 'id')
			;
		`;
		queryDB(sql)
			.done(
				queryResultString => {
					const queryResult = $.parseJSON(queryResultString);
					if (queryResult) {
						const hasSavedSession = Object.keys(this.fieldValues).length;
						queryResult.forEach( (row) => {
							const columnName = row.column_name;
							this.fieldInfo[columnName] = {};
							this.fieldInfo[columnName].tableName = row.table_name;
							this.fieldInfo[columnName].dataType = row.data_type;
						});
					}
				}
			).fail(
				(xhr, status, error) => {
				showModal(`An unexpected error occurred while connecting to the database: ${error} from query:\n${sql}.\n\nTry reloading the page.`, 'Unexpected error')
			});*/
	}


	/* 
	Skip to the section of the form.
	@param movement: number of sections to jump to (positive=right or negative=left)
	*/
	Constructor.prototype.goToPage = function(movement=1, preventScroll=false) {
	
		const $currentPage = $('.form-page.selected');
		const currentIndex = parseInt($currentPage.data('page-index'));
		const nextIndex = currentIndex + movement;
		const nextElementID = `#page-${nextIndex}`;
		const $nextPage = $(nextElementID);

		// Set style/selection on pages
		$currentPage.removeClass('selected');
		$nextPage.addClass('selected');

		$(`.indicator-dot:isSection(${currentIndex})`).removeClass('selected');
		$(`.indicator-dot:isSection(${nextIndex})`).addClass('selected');
		_this.setPreviousNextButtonState(nextIndex);

		// If there's an accordion in the new section, find any shown cards and
		//	collapse them, then show them again after a delay
		const $shown = $nextPage.find('.card:not(.cloneable) .card-collapse.show')
			.removeClass('show');
		if ($shown.length) {
			setTimeout(function() {
				$shown.collapse('show');//siblings('.card-header')
				// 	.find('.card-link')
				// 	.click()
			}, 800);
		}

		// if user settings prefer no motion, go directly to the section. 
		//	Otherwise, scroll to it
		const preventMotion = preventScroll || window.matchMedia('(prefers-reduced-motion)').matches;
		if (preventMotion) {
			window.location.hash = nextElementID;
			// Prevent jump link from appearing in URL (so user can't reload or 
			//	use back button to go directly to a section, presumably by accident)
			window.history.replaceState(null, document.title, document.URL.split('#')[0])
		} else {
			document.getElementById(nextElementID.replace('#', '')).scrollIntoView();
			//window.location.hash = nextElementID;
		}
		
		$('.form-header').toggleClass('hidden', $nextPage.is('.submit-page'));

		return nextIndex;

	}


	/* 
	Toggle the disabled attribute on the next or previous button 
	if the user is at the first or last section

	@param nextIndex [integer]: the section index that the user is moving to
	*/
	Constructor.prototype.setPreviousNextButtonState = function(nextIndex) {
		$('#previous-button').prop('disabled', nextIndex === 0)
		$('#next-button').prop('disabled', nextIndex === $('.form-page:not(.title-page)').length - 1)
	}


	/*
	Helper function to warn the user that there's at least one empty/invalid field
	*/
	Constructor.prototype.showInvalidFieldsMessage = function() {
		showModal(
			'There is at least one field on this page that is not valid or is not filled in.' + 
				' You must fill all required fields (has <span style="color:#b70606;">* </span>' + 
				' to the left of the field) before continuing to the next page. You can hover' +
				' over each field for more information.', 
			'Invalid/incomplete fields'
		)
	}

	/*
	Event handler for the previous and next buttons
	*/
	Constructor.prototype.onPreviousNextButtonClick = function(e, movement) {

		e.preventDefault();//prevent form from reloading
		const $button = $(e.target);
		if ($button.prop('disabled')) return;//shouldn't be necessary if browser respects 'disabled' attribute

		if (movement > 0) {
			if ($button.attr('id') !== 'title-page-continue-button') {
				const $parents = $('.form-page.selected .validate-field-parent:not(.cloneable)')
					.filter((_, el) => {
						let $closestCollapse = $(el).closest('.collapse');
						while ($closestCollapse.length) {
							if (!$closestCollapse.is('.show')) return false;
							$closestCollapse = $closestCollapse.parent().closest('.collapse');
						}
						
						return true;
					});
				const allFieldsValid = $parents
					.map(
						(_, el) => this.validateFields($(el))
					).get()
					.every((isValid) => isValid);
				if (!allFieldsValid) {
					this.showInvalidFieldsMessage();
					return;
				}
			}
			const allFieldsValid = $('.form-page.selected .validate-field-parent')
						.map( (_, el) => _this.validateFields($(el)) )
							.get()
							.every((isValid) => isValid);
					if (!allFieldsValid) {
						_this.showInvalidFieldsMessage();
						return;
					}
		}

		const nextIndex = this.goToPage(movement);

		// The form navigation is initially hidden (other than the continue button) 
		//	so show it once that button is clicked and hide the 'continue' button
		if ($button.attr('id') === 'title-page-continue-button') {
			$('.form-footer .form-navigation').removeClass('hidden');
			$button.addClass('hidden');
		} else {
			// Enable/disable nav buttons
			this.setPreviousNextButtonState(nextIndex);
		}

	}


	/*
	Event handler for click events on the progress indicator dots
	*/
	Constructor.prototype.onIndicatorDotClick = function(e) {
	
		e.preventDefault();
		$dot = $(e.target);
		if ($dot.hasClass('selected')) return;

		// validate fields for the currently selected section only if this is the production site
		if (!(_this.presentMode || _this.serverEnvironment === 'dev')) {
			const allFieldsValid = $('.form-page.selected .validate-field-parent')
			.map( (_, el) => _this.validateFields($(el)) )
				.get()
				.every((isValid) => isValid);
			if (!allFieldsValid) {
				_this.showInvalidFieldsMessage();
				return;
			}
		}

		const currentIndex = parseInt($('.indicator-dot.selected').data('page-index'));
		const nextIndex = parseInt($dot.data('page-index'));

		_this.goToPage(nextIndex - currentIndex);

		//_this.setPreviousNextButtonState(nextIndex);

	}


	/*
	Helper method to set the in-memory value from an input. Other than in 
	onInputFieldChange(), the only other place this is useful is when saving data, 
	the in-memory values from.short-distance-fields need to be converted to meters.
	*/
	Constructor.prototype.setInMemorydValue = function($input, value) {

		const fieldName = ($input.attr('name') || '')
			.replace(/\-\d+$/g, '');

		// If the field is inside an accordion, it belongs to a 1-to-many relationship and 
		//	there could, therefore, be multiple objects with this column. In that case,
		//	append it to the appropriate object (as IDed by the index of the card)
		const $accordion = $input.closest('.accordion:not(.query-result-pane)');
		if ($accordion.length) {

			const tableName = $accordion.data('table-name');//fieldInfo.tableName;

			// If this is the first time a field has been changed in this 
			//	accordion, this.fieldValues[tableName] will be undefined
			if (!_this.fieldValues[tableName]) _this.fieldValues[tableName] = {};
			const tableRows = _this.fieldValues[tableName];
			
			// Get the index of this card within the accordion
			const index = $input.attr('id').match(/\d+$/)[0];
			if (!tableRows[index]) tableRows[index] = {};
			tableRows[index][fieldName] = value;
		} else {
			_this.fieldValues[fieldName] = value;
		}
	}


	/*
	Handle entry field change events
	*/
	Constructor.prototype.onInputFieldChange = function(e) {
		
		const $input = $(e.target);
		if ($input.closest('.cloneable').length) return;//triggered manually and should be ignored

		const $accordion = $input.closest('.accordion:not(.query-result-pane)');

		// Don't save any attachments data. window.localStorage limit for most browsers 
		//	is 5mb which is probably too small to save the attachment data. Since the 
		//	attachment, therefore, can't reliably be loaded, it doesn't make sense to 
		//	save any other data about attachments
		if ($accordion.attr('id') === 'attachments-accordion') return;

		// Get the name attribute from the field, which should be the corresponding column name
		const fieldName = ($input.attr('name') || '')
			.replace(/\-\d+$/g, '');//fields in accordions have the accordion index appended
		if (!fieldName) {
			console.log(`name attribute for ${$input.attr('id')} not defined`);
			return;
		}
		
		const value = $input.is('.input-checkbox') ? $input.prop('checked') : $input.val();

		const fieldInfo = _this.fieldInfo[fieldName];
		if (!fieldInfo) {
			console.log(`${fieldName} not in this.fieldInfo. ID: ${$input.attr('id')}`);
			_this.fieldValues[fieldName] = value;
			//return;
		} 
		
		//_this.setInMemorydValue($input, value);
		
		if ($accordion.length) {

			const tableName = $accordion.data('table-name');//fieldInfo.tableName;

			// If this is the first time a field has been changed in this 
			//	accordion, this.fieldValues[tableName] will be undefined
			if (!_this.fieldValues[tableName]) _this.fieldValues[tableName] = {};
			const tableRows = _this.fieldValues[tableName];
			
			// Get the index of this card within the accordion
			const index = $input.attr('id').match(/\d+$/)[0];
			if (!tableRows[index]) tableRows[index] = {};
			tableRows[index][fieldName] = value;
		} else {
			_this.fieldValues[fieldName] = value;
		}
	}


	/*
	Validate all fields currently in view
	*/
	Constructor.prototype.validateFields = function($parent, focusOnField=true) {
		
		// If the user has disabled validation, just return true to indicate that they're all valid
		if ($('#disable-required-slider-container input[type=checkbox]').is(':checked')) return true;

		const $fields = $parent
			.find('.field-container:not(.disabled)')
			.find('.input-field:required, .required-indicator + .input-field').not('.hidden').each(
			(_, el) => {
				const $el = $(el);
				const $hiddenParent = $el.parents('.collapse:not(.show, .row-details-card-collapse), .card.cloneable, .field-container.disabled, .hidden');
				if (!$el.val() && $hiddenParent.length === 0) {
					$el.addClass('error');
				} else {
					$el.removeClass('error');
				}
		});

		if ($fields.filter('.error').length) {
			// Search the parent(s) for any .collapse elements that aren't shown. 
			//	If one is found, show it
			for (const el of $parent) {//.each(function() {
				const $el = $(el);
				if ($el.hasClass('collapse') && !$el.hasClass('show')) {
					$el.siblings('.card-header')
						.find('.card-link')
						.click();
					return false;
				}
			}
			if (focusOnField) $fields.first().focus();
			return false;
		} else {
			return true;
		}
	}


	/*
	Helper function to recursively hide/show fields with data-dependent-target attribute
	*/
	Constructor.prototype.toggleDependentFields = function($select) {

		const selectID = '#' + $select.attr('id');

		// Get all the elements with a data-dependent-target 
		const dependentElements = $(`
			.collapse.field-container .input-field, 
			.collapse.accordion, 
			.collapse.add-item-container .add-item-button,
			.collapse.export-field-options-container
			`).filter((_, el) => {return $(el).data('dependent-target') === selectID});
		//const dependentIDs = $select.data('dependent-target');
		//var dependentValues = $select.data('dependent-value');
		dependentElements.each((_, el) => {
			const $thisField = $(el);
			if (el.id == 'input-input-recovered_value-0') {
				let a=0;
			}
			var dependentValues = $thisField.data('dependent-value').toString();
			if (dependentValues) {
				var $thisContainer = $thisField.closest('.collapse.field-container, .collapse.accordion, .collapse.add-item-container, .collapse.export-field-options-container');
				
				// If there's a ! at the beginning, 
				const notEqualTo = dependentValues.startsWith('!');
				dependentValues = dependentValues
					.toString()
					.replace('!', '')
					.split(',').map((s) => {return s.trim()});
				
				var selectVal = ($select.val() || '').toString().trim();

				var show = notEqualTo ? 
					!dependentValues.includes(selectVal) :
					dependentValues.includes(selectVal);
				if (!dependentValues[0] === '<blank>') {
					show = show || selectVal !== '';
				}

				if (show) {
					//$thisContainer.removeClass('hidden');
					$thisContainer.collapse('show');
					_this.toggleDependentFields($thisField, hide=false)
				} else {
					$thisContainer.collapse('hide');
					//$thisContainer.addClass('hidden');
					_this.toggleDependentFields($thisField, hide=true)
				}
			}
		});
	}


	/*
	Event handler for selects
	*/
	Constructor.prototype.onSelectChange = function(e) {
		// Set style depending on whether the default option is selected
		const $select = $(e.target);

		if ($select.val() === '') {
			$select.addClass('default');

		} else {
			$select.removeClass('default error');
			// the user selected an actual option so remove the empty default option
			// **** DENA staff didn't want option removed ****
			// for (const el of $select.find('option')) {//.each(function(){
			// 	const $option = $(el);
			// 	if ($option.val() == '') {
			// 		$option.remove();
			// 	}
			// }
		}

		// If there are any dependent fields that should be shown/hidden, 
		//	toggle its visibility as necessary
		_this.toggleDependentFields($select);
	}


	/*
	Rather than using the dependent-target/value attributes, the interactions 
	accordion should only be shown when both inital action fields are filled
	*/
	Constructor.prototype.onInitialActionChange = function() {

		var fieldsFull;
		$('#input-initial_human_action, #input-initial_bear_action').each((_, el) => {
			fieldsFull = !!$(el).val(); //if it hasn't been filled yet it'll be '' (empty string)
			return fieldsFull;//if false, this will break out of .each() loop
		})

		if (fieldsFull) {
			$('#reactions-accordion')
				.collapse('show')
				.siblings('.add-item-container')
					.collapse('show');
		}
	}


	/*
	Rather than using the dependent-target/value attributes, the previous 
	coordinate fields should be hidden immediately to avoid the brief but 
	disorienting moment when 2 sets of coordinate fields are visible
	*/
	Constructor.prototype.onCoordinateFormatChange = function(e) {

		const $select = $(e.target);
		const format = $select.val();

		// Get the collapse to show. If this already shown, that means this function 
		//	was triggerred manually with .change(), and shouldn't actually be hidden
		const $currentCollapse = $('.coordinates-' + format).closest('.collapse:not(.row-details-card-collapse)');
		if ($currentCollapse.is('.show')) return;

		// Hide all coordinate fields (which is really just the currently visible one)
		$('.coordinates-ddd, .coordinates-ddm, .coordinates-dms').each((_, el) => {
			$(el).closest('.collapse:not(.row-details-card-collapse)')
				.addClass('hidden')//add hidden class first
				.collapse('hide');
		})
			
		// Show the one that corresponds to the selected format
		$currentCollapse.collapse('show');
	}


	/* 
	Add a new card to the accordion. There needs to be a card with the class "cloneable", 
	which should be hidden and only used to add a new item
	*/
	Constructor.prototype.addNewCard = function($accordion, cardIndex=null) {

		const $dummyCard = $accordion.find('.card.cloneable');
		if ($dummyCard.length === 0) {
			console.log('No dummy card found');
			return;
		}

		// Close any open cards
		$accordion.find('.card:not(.cloneable) .collapse.show').each(
			function() {$(this).siblings('.card-header').find('.card-link').click()}
		);

		// Get ID suffix for all children elements. Suffix is the 
		//	<element_identifier>-<section_index>-<card_index>.
		//	This is necessary to distinguish elements from others in 
		//	other form sections and other cards within the section
		/*const sectionIndex = $accordion.closest('.form-page')
			.data('page-index');*/
		const tableName = $accordion.data('table-name');
		if (!cardIndex) {
			var cardIndex = $accordion.find('.card').length - 1;// - 1 because cloneable is 0th
			while ($(`#card-${tableName}-${cardIndex}`).length) {
				cardIndex++;
			}
		}

		const idSuffix = `${tableName}-${cardIndex}`;//`${sectionIndex}-${cardIndex}`;

		const $newCard = $dummyCard.clone(withDataAndEvents=true)
			.removeClass('cloneable hidden')
			.attr('id', `card-${idSuffix}`);
		
		//Set attributes of children
		const $newHeader = $newCard.find('.card-header');
		$newHeader
			.attr('id', `cardHeader-${idSuffix}`)
			.find('.card-link')
				.attr('href', `#collapse-${idSuffix}`)
				.attr('data-target', `#collapse-${idSuffix}`);

		const $newCollapse = $newCard.find('.card-collapse')
			.attr('id', `collapse-${idSuffix}`)
			.attr('aria-labelledby', `cardHeader-${idSuffix}`)
			.addClass('validate-field-parent');

		$newCollapse.find('.card-body')
			.find('.input-field')
			.each(function() {
				const $el = $(this);
				const newID = `${$el.attr('id')}-${cardIndex}`;
				$el.data('dependent-target', `${$el.data('dependent-target')}-${cardIndex}`);
				$el.attr('id', newID)
					.siblings()
					.find('.field-label')
						.attr('for', newID);
			})
			.filter('.error')
				.removeClass('error');
		$newCollapse.find('.field-container .file-input-label')
			.attr('for', `attachment-upload-${cardIndex}`);
		
		// Add to the accordion
		$newCard.appendTo($accordion).fadeIn();

		// Open the card after a brief delay
		//$newCard.find('.collapse:not(.show)').click();
		setTimeout(function(){
			$newCard.find('.collapse:not(.show, .row-details-card-collapse)').siblings('.card-header').find('.card-link').click();
		}, 500);

		return $newCard;
	}


	/*
	Handle click events on any "Add Item" buttons
	*/
	Constructor.prototype.onAddNewItemClick = function(e) {
		e.preventDefault();
		const $accordion = $('#' + $(e.target).data('target'));

		const itemName = $accordion.find('.delete-button').first().data('item-name');
		var isValid = true;
		$accordion.find('.card:not(.cloneable) .card-collapse').each((_, el) => {
			isValid = _this.validateFields($(el));
			if (!isValid) {

				showModal(`You have to finish filling details of all existing ${itemName ?  itemName : 'item'}s before you can add a new one.`, 'Incomplete item');
				return;
			}
		})

		if (isValid) {
			const $newCard = _this.addNewCard($accordion);
			$newCard.addClass('new-card');
		}
	}


	/*
	Helper function to handle card deletions from an accordion
	*/
	Constructor.prototype.onConfirmDeleteCardClick = function(cardID) {
		const $card = $('#' + cardID);

		$card.fadeOut(500, function(){
			const cardIndex = cardID.match(/\d+$/)[0];
			const tableName = $card.closest('.accordion').data('table-name');
			const $siblings = $card.siblings('.card:not(.cloneable)');
			
			$card.remove();

			const fieldValues = _this.fieldValues[tableName];
			if (fieldValues) {
				if (Object.keys(fieldValues).length >= cardIndex) delete fieldValues[cardIndex];
			}

			$siblings.each((_, card) => {_this.onCardLabelFieldChange($(card).find('.card-label-field').first())});
		})
	}

	/*
	Helper method to delete a card from an accordion. The meat of the event handler has to 
	be separated from the actual handler so that query.js has access to it with the ability 
	to pass a different onclick handler for the confirm button
	*/
	Constructor.prototype.deleteCard = function($deleteButton, onConfirmClickString=null) {
		
		//if the actual target clicked was the icon, bubble up to the button
		if ($deleteButton.hasClass('fas')) 
			$deleteButton = $deleteButton.closest('.delete-button');
		
		const itemName = $deleteButton.data('item-name');
		const $card = $deleteButton.closest('.card');
		const cardID = $card.attr('id');

		// Check if this this card is optional by looking for a dependent-target. 
		//	If it has one, that means it is collapsible and therefore optional
		const dependentInputID = $card.closest('.accordion')
			.data('dependent-target');
		const isLastCard = $card.siblings('.card').length === 1; //has 1 sibling because last one is the .cloneable card

		if (isLastCard && !dependentInputID) {
			showModal(`This is the only ${itemName} listed thus far, and you must enter at least one.`, `Invalid operation`);
		} else {
			// If an onConfirmClick string was provided (this is being called from the query page), use that.
			// 	Otherwise, if the user confirms the delete, fade it out after .5 sec then reset the remaining 
			//	card labels. If not, just collapse the accordion so that if the user changes their mind about 
			//	this card, the data are still loaded in memory
			const onConfirmClick = 
				onConfirmClickString || (
					isLastCard && dependentInputID ? 
					`$('${dependentInputID}').val(0).change();` : 
					`entryForm.onConfirmDeleteCardClick('${cardID}');`
				)
			;
			const footerButtons = `
				<button class="generic-button modal-button secondary-button close-modal" data-dismiss="modal">No</button>
				<button class="generic-button modal-button danger-button close-modal" data-dismiss="modal" onclick="${onConfirmClick}">Yes</button>
			`;
			showModal(`Are you sure you want to delete this ${itemName}?`, `Delete ${itemName}?`, 'confirm', footerButtons);
		}
	}


	/*
	Actual handler for card deletions from an accordion
	*/
	Constructor.prototype.onDeleteCardClick = function(e) {

		e.preventDefault();
		e.stopPropagation();

		var $deleteButton = $(e.target);
		_this.deleteCard($deleteButton);
	}


	/*
	Helper function to set the label on a card
	*/
	Constructor.prototype.setCardLabel = function($card, names, defaultText, joinCharacter=' ') {
		var labelComponents = {};
		$card.find('.input-field.card-label-field').each(function() {
			const $el = $(this);
			const thisValue = $el.is('select') && ($el.val() || '').trim() != '' ? 
				$el.find('option').filter((_, option) => {return $(option).val() === $el.val()}).html() : 
				$el.val();
			if (!thisValue && thisValue !== '') {
				console.log($el.attr('id'))
			}
			const thisName = $el.attr('name');
			if (names.includes(thisName) && (thisValue || '').length && thisValue != ' ') {
				// If the 
				let index = $el.data('card-label-index');
				index = index == undefined ? names.indexOf(thisName) : index;
				// Make sure a component isn't overwritten if the card-label-index 
				//	property is inconsistently set
				while (Object.keys(labelComponents).includes(index)) { 
					index ++;
				}
				labelComponents[index] = thisValue;
			}
		})

		// Sort the indices in case the card-label-index properties were set and 
		//	don't match the natural order of the card-label-component elements
		var sortedComponents = [];
		Object.keys(labelComponents).sort().forEach((k, i) => {
		    sortedComponents[i] = labelComponents[k];
		});

		$cardLabel = $card.find('.card-link-label');

		// If the data-label-sep attribute is defined, use that. Otherwise, use the default
		const cardHeaderSeparator = $cardLabel.data('label-sep');
		joinCharacter = cardHeaderSeparator != undefined ? cardHeaderSeparator : joinCharacter;


		const indexText = $cardLabel.is('.label-with-index') ? //if true, add the index to the label
			`${$card.index()} - ` : '';//`${parseInt($card.attr('id').match(/\d+$/)) + 1} - ` : ''
		const joinedText = indexText + sortedComponents.join(joinCharacter);

		if (sortedComponents.length === names.length) {
			$cardLabel.fadeOut(250).fadeIn(250).delay(300).text(joinedText);
		} else if ($cardLabel.text() !== defaultText) {
			$cardLabel.fadeOut(250).fadeIn(250).delay(300).text(defaultText);
		}
	}


	/*
	Handler for when a .card-label-field changes -> updates the card header text
	*/
	Constructor.prototype.onCardLabelFieldChange = function($field) {

		const $card = $field.closest('.card');
		
		var names = $card.find('.card-label-field')
			.map(function(_, el) {
	    		return $(el).attr('name');
			})
			.get(); // get returns the underlying array

		//const defaultText = $card.closest('.accordion').find('.card.cloneable.hidden .card-link-label').text();
		const defaultText = $card.find('.card-link-label').text();

		_this.setCardLabel($card, names, defaultText);
	}


	/*
	When a user types anything in a text field, remove the error class
	*/
	Constructor.prototype.onInputFieldKeyUp = function(e) {
		$(e.target).removeClass('error');
	}


	/*
	Call zipstatic API to get city and state from postal code
	*/
	Constructor.prototype.getCityAndState = function(countryCode, postalCode) {

		const deferred = $.ajax({
			url: `https://zip.getziptastic.com/v2/${countryCode}/${postalCode}`, //http://api.zippopotam.us
			cache: false,
			dataType: "json",
			type: "GET"
		})

		return deferred;
	}

	/*
	Event handler for postal code field change
	*/
	Constructor.prototype.onCountryPostalCodeChange = function(e) {

		e.preventDefault();

		const $el = $(e.target);
		const $cardBody = $el.closest('.card-body');
		const $country = $cardBody.find('select.input-field').filter((_, el) => {return $(el).attr('id').startsWith('input-country')});
		const $zipcode = $cardBody.find('input.input-field').filter((_, el) => {return $(el).attr('id').startsWith('input-zip_code')});
		const countryCode = $country.val();
		const postalCode = $zipcode.val();

		if (countryCode && postalCode) {
			this.getCityAndState(countryCode, postalCode)
				.then(function(jsonResponse) {
					if (jsonResponse.city && jsonResponse.state_short) {
						$city = $cardBody.find('input.input-field').filter((_, el) => {return $(el).attr('id').startsWith('input-city')});
						$state = $cardBody.find('select.input-field').filter((_, el) => {return $(el).attr('id').startsWith('input-state')});
						$city.val(jsonResponse.city);
						$state.val(jsonResponse.state_short).change();
					}
				});

		}
	}


	Constructor.prototype.setMapMileposts = function(mapObject) {
		const map = mapObject.map;
		const mapZoom = map.getZoom();
		const milepostGroups = mapObject.mileposts.layer;
		for (const layerZoom in milepostGroups) {
			const thisLayer = milepostGroups[layerZoom];
			// If the zoom level is high enough, add the layer
			if (layerZoom <= mapZoom && !map.hasLayer(thisLayer)) {
				map.addLayer(thisLayer);
			}
			// If the zoom level is too low, remove the layer
			else if (layerZoom > mapZoom && map.hasLayer(thisLayer)) {
				map.removeLayer(thisLayer);
			}
		}
	}


	/*
	Configure a Leaflet map given a div HTML ID
	*/
	Constructor.prototype.configureMap = function(divID, mapObject) {
		
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
			center: mapCenter || [63.2, -150.7],
			zoom: mapZoom || 7
		});

		const baseMaps = {
			'USGS Topos': L.tileLayer(
				'https://services.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}', 
				{
					attribution: `Tiles &copy; Esri &mdash; Source: <a href="http://goto.arcgisonline.com/maps/USA_Topo_Maps" target="_blank">Esri</a>, ${new Date().getFullYear()}`
				}
			).addTo(map),
			'Satellite':  L.tileLayer(
				'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 
				{
					attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
				}
			)
		};
		const layerControl = L.control.layers(baseMaps).addTo(map);

		// Add pane to get mileposts on top of roads
		map.createPane('mileposts');
		map.getPane('mileposts').style.zIndex = 1000;

		// Helper function to load geojson data to avoid repeating
		const onGeoJSONLoad = function(geojson, defaultStyle, layerName, {tooltipHandler={}, hoverStyle={}}={}) {
				const onMouseover = (e) => {
				let layer = e.target;

				layer.setStyle(hoverStyle)

				if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
					layer.bringToFront();
				}
			}
			const onMouseout = (e) => {
				layer.resetStyle(e.target);
			}
			onEachFeature = (feature, layer) => {
				layer.on({
					mouseover: onMouseover,
					mouseout: onMouseout
				})
			}

			let geojsonOptions = {
				style: defaultStyle,
				onEachFeature: onEachFeature //add mouseover and mouseout listeners
			}

			var layer; // define before calling L.geoJSON() so onMouseout event can reference
			layer = L.geoJSON(geojson, geojsonOptions)
				.bindTooltip(
					tooltipHandler,
					{
						sticky: true
					}
				).addTo(map);
			layerControl.addOverlay(layer, layerName);

			return layer;
		}

		$.get({url: 'resources/management_units.json'})
			.done(geojson => {
				const defaultStyle = {
					color: '#000',
					opacity: 0.2,
					fillColor: '#000',
					fillOpacity: 0.15 
				}
				const hoverStyle = {
					color: '#000',
					opacity: 0.4,
					fillColor: '#000',
					fillOpacity: 0.15 
				}
				const tooltipHandler = layer => layer.feature.properties.Unit + ': ' + layer.feature.properties.Name;
				onGeoJSONLoad(geojson, defaultStyle, 'Backcountry Units', {tooltipHandler: tooltipHandler, hoverStyle: hoverStyle})
			}).fail((xhr, error, status) => {
				console.log('BC unit geojson read failed: ' + error);
			})
		$.get({url: 'resources/roads.json'})
			.done(geojson => {
				const defaultStyle = {
					color: '#a72d0c',
					opacity: 0.7
				}
				const hoverStyle = {
					color: '#a72d0c',
					opacity: 0.9
				}
				const tooltipHandler =  layer => layer.feature.properties.road_name;
				const layer = onGeoJSONLoad(geojson, defaultStyle, 'Roads', {tooltipHandler: tooltipHandler, hoverStyle: hoverStyle})
				mapObject.roads = {layer: layer, geojson: geojson};

			}).fail((xhr, error, status) => {
				console.log('Road geojson read failed: ' + error);
			});
		$.get({url: 'resources/mileposts.json'})
			.done(geojson => {
				const markerOptions = {
					radius: 3,
					weight: 1,
					opacity: 0.9,
					fillOpacity: 0.7,
					fillColor: '#000',
					color: '#000',
					pane: 'mileposts'
				}

				var allMilePosts = L.layerGroup().addTo(map);
				var milepostGroups = {
					3:  L.layerGroup().addTo(allMilePosts),
					5:  L.layerGroup().addTo(allMilePosts),
					7:  L.layerGroup().addTo(allMilePosts),
					9:  L.layerGroup().addTo(allMilePosts),
					10: L.layerGroup().addTo(allMilePosts),
					11: L.layerGroup().addTo(allMilePosts)
				}


				const pointToLayer = (feature, latlon) => 
					L.circleMarker(latlon, markerOptions)
						.bindTooltip(layer => layer.feature.properties.mile.toString(), {permanent: true, className: 'leaflet-tooltip-point-label'});
				const splitIntoLayerGroups = (feature, layer) => {
					const mile = feature.properties.mile;
					if (mile == 0) return; // skip milepost 0
					const layerGroup = 
						mile % 100 === 0 ? milepostGroups[3] :
						mile % 50 === 0 ? milepostGroups[5] :
						mile % 20 === 0 ? milepostGroups[7] :
						mile % 10 === 0 ? milepostGroups[9] :
						mile % 5 === 0 ? milepostGroups[10] :
						milepostGroups[11]; // everything else
					layer.addTo(layerGroup)
				}
				var layer = L.geoJSON(
					geojson, 
					{
						pointToLayer: pointToLayer,
						onEachFeature: splitIntoLayerGroups
					}
				);
				layerControl.addOverlay(allMilePosts, 'Mileposts');

				mapObject.mileposts = {layer: milepostGroups, geojson: geojson};
				this.setMapMileposts(mapObject);

			}).fail((xhr, error, status) => {
				console.log('Milepost geojson read failed: ' + error);
			});

		// Show/hide mileposts based on zoom level
		map.on('zoom', (e) => {
			if (mapObject.mileposts) this.setMapMileposts(mapObject);
		})

		// Make the encounter marker drag/droppable onto the map
		$('#encounter-marker-img').draggable({opacity: 0.7, revert: true});//helper: 'clone'});
		$('#encounter-location-map').droppable({drop: this.markerDroppedOnMap});

		mapObject.map = map;
	}


	/*
	Convert coordinates from decimal degrees to degrees decimal 
	minutes and degrees minutes seconds and fill in the respective fields
	*/
	Constructor.prototype.fillCoordinateFields = function(latDDD, lonDDD) {

		// Set ddd fields
		const $latDDDField = $('#input-lat_dec_deg').val(latDDD);
		const $lonDDDField = $('#input-lon_dec_deg').val(lonDDD);

		// Fill global this.fieldValues in case this function was called by dragging 
		//	and dropping the marker, which won't trigger the onInputFieldChange() event
		this.fieldValues['latitude'] = latDDD;
		this.fieldValues['longitude'] = lonDDD;
		$('#input-latitude').val(latDDD);
		$('#input-longitude').val(lonDDD);

		// Set ddm fields
		const minuteStep = $('#input-lat_dec_min').attr('step');
		const minuteRounder = Math.round(1 / (minuteStep ? minuteStep : 0.001));
		const latSign = latDDD / Math.abs(latDDD)
		const latDegrees = Math.floor(Math.abs(latDDD)) * latSign
		const latDecimalMinutes = Math.round((Math.abs(latDDD) - Math.abs(latDegrees)) * 60 * minuteRounder) / minuteRounder;
		const lonSign = lonDDD/Math.abs(lonDDD)
		const lonDegrees = Math.floor(Math.abs(lonDDD)) * lonSign;
		const lonDecimalMinutes = Math.round((Math.abs(lonDDD) - Math.abs(lonDegrees)) * 60 * minuteRounder) / minuteRounder;
		$('#input-lat_deg_ddm').val(latDegrees);
		$('#input-lat_dec_min').val(latDecimalMinutes);
		$('#input-lon_deg_ddm').val(lonDegrees);
		$('#input-lon_dec_min').val(lonDecimalMinutes);

		// Set dms fields
		const secondStep = $('#input-lat_dec_sec').attr('step');
		const secondRounder = Math.round(1 / (secondStep ? secondStep : 0.1));
		const latMinutes = Math.floor(latDecimalMinutes);
		const latDecimalSeconds = Math.round((latDecimalMinutes - latMinutes) * 60 * secondRounder) / secondRounder;
		const lonMinutes = Math.floor(lonDecimalMinutes);
		const lonDecimalSeconds = Math.round((lonDecimalMinutes - lonMinutes) * 60 * secondRounder) / secondRounder;
		$('#input-lat_deg_dms').val(latDegrees);
		$('#input-lat_min_dms').val(latMinutes);
		$('#input-lat_dec_sec').val(latDecimalSeconds);
		$('#input-lon_deg_dms').val(lonDegrees);
		$('#input-lon_min_dms').val(lonMinutes);
		$('#input-lon_dec_sec').val(lonDecimalSeconds);

		// Remove error class from coordinate fields
		$('.coordinates-ddd, .coordinates-ddm, .coordinates-dms').removeClass('error');

	}

	/* 
	Helper function to check if the encounter Marker has 
	already been added to the encounter location map
	*/
	Constructor.prototype.markerIsOnMap = function() {

		var isOnMap = false;
		this.maps.main.map.eachLayer((layer) => {
			if (layer === this.encounterMarker) isOnMap = true;
		});

		return isOnMap;
	}

	/*
	Add or move the encounter Marker on the encounter location map. 
	Also update the coordinate fields accordingly. The only argument
	is an object with properties "lat" and "lng" to mirror the 
	Leaflet.event.latlng object.

	lat: latitude in decimal degrees
	lng: longitude in decimal degrees.
	*/
	Constructor.prototype.placeEncounterMarker = function({lat=0, lng=0}={}) {


		this.encounterMarker.setLatLng({lat: lat, lng: lng});//, options={draggable: true});
		
		if (!this.markerIsOnMap()) {
			this.encounterMarker.addTo(this.maps.main.map);
			this.removeDraggableMarker();
		}

		// If the marker is outside the map bounds, zoom to it
		if (!this.maps.main.map.getBounds().contains(this.encounterMarker.getLatLng())) {
			this.maps.main.map.setView(this.encounterMarker.getLatLng(), this.maps.main.map.getZoom());
		}
		
		// Make sure the coords for fields are appropriately rounded
		var [latDDD, lonDDD] = getRoundedDDD(lat, lng);

		// Fill DMM and DMS fields
		this.fillCoordinateFields(latDDD, lonDDD);
	}


	/* 
	helper function to remove the draggable marker and the label 
	*/
	Constructor.prototype.removeDraggableMarker = function() {
	
		//$('#encounter-marker-img').addClass('hidden')//.remove();
		$('#encounter-marker-container').slideUp(500);//.collapse('hide');//.slideUp(500, (_, el) => {$(el).remove()});
	}

	/*
	Place the marker when the user drops the draggable marker img on the map
	*/
	Constructor.prototype.markerDroppedOnMap = function(e) {

		e.preventDefault()
		
		// Convert pixel coordinates of the drop event to lat/lon map coordinates.
		//	Adjust for the offset of where the user grabbed the marker. It should be
		//	the distance to the center-bottom of the marger img. The underlying Leaflet
		//	API uses either .pageX or .clientX so just reset both (see
		//	https://github.com/Leaflet/Leaflet/blob/e64743f741e6d13e36dea26f494d52e960a3274e/src/dom/DomEvent.js#L141
		//	for source code)
		var originalEvent = e.originalEvent;
		const $target = $(originalEvent.target);
		originalEvent.pageX -= originalEvent.offsetX - ($target.width() / 2);
		originalEvent.pageY -= originalEvent.offsetY - $target.height();
		originalEvent.clientX -= originalEvent.offsetX - ($target.width() / 2); 
		originalEvent.clientY -= originalEvent.offsetY - $target.height();
		const latlng = _this.maps.main.map.mouseEventToLatLng(originalEvent);
		
		_this.placeEncounterMarker(latlng);

		_this.removeDraggableMarker();

		$('#input-location_accuracy').val(3).change();//== < 5km

	}

	/*
	Use encounter Merker to reset coordinate fields
	*/
	Constructor.prototype.setCoordinatesFromMarker = function() {
		

		const latlng = _this.encounterMarker.getLatLng();
		var [latDDD, lonDDD] = getRoundedDDD(latlng.lat, latlng.lng);
		_this.fillCoordinateFields(latDDD, lonDDD);

		$('#input-location_accuracy').val(3).change();//== < 5km
	}


	/* 
	If the encounter Marker is already on the map, ask the user
	(with a modal dialog) if they want to move it to [lat, lon]. 
	Otherwise, just place it at [lat, lon].
	*/ 
	Constructor.prototype.confirmMoveEncounterMarker = function(lat, lon, confirmJSCodeString='') {

		
		const onConfirmClick = `entryForm.placeEncounterMarker({lat: ${lat}, lng: ${lon}});${confirmJSCodeString}`;
		const footerButtons = `
			<button class="generic-button modal-button secondary-button close-modal" data-dismiss="modal" onclick="entryForm.setCoordinatesFromMarker()">No</button>
			<button class="generic-button modal-button close-modal" data-dismiss="modal" onclick="${onConfirmClick}">Yes</button>
		`;
		const message = `You've already placed the encounter location marker on the map. Are you sure you want to move it to a new location? Click 'No' to keep it in the current location.`
		showModal(message, `Move the encounter location?`, 'confirm', footerButtons);
	}


	/*
	Event handler for when a decimal degree field is changed
	*/
	Constructor.prototype.onDDDFieldChange = function() {
	
		const latDDD = $('#input-lat_dec_deg').val();
		const lonDDD = $('#input-lon_dec_deg').val();

		if (latDDD && lonDDD) {
			if (_this.markerIsOnMap() && _this.confirmLocationSelectChange) { 
				_this.confirmMoveEncounterMarker(latDDD, lonDDD);
			} else {
				_this.placeEncounterMarker({lat: latDDD, lng: lonDDD})
			}
		}
	}

	/*
	Event handler for when a degree decimal minute field is changed
	*/
	Constructor.prototype.onDMMFieldChange = function() {

		const latDegrees = $('#input-lat_deg_ddm').val();
		const lonDegrees = $('#input-lon_deg_ddm').val();
		const latDecimalMinutes = $('#input-lat_dec_min').val();
		const lonDecimalMinutes = $('#input-lon_dec_min').val();

		if (latDegrees && lonDegrees && latDecimalMinutes && lonDecimalMinutes) {
			var [latDDD, lonDDD] = coordinatesToDDD(latDegrees, lonDegrees, latDecimalMinutes, lonDecimalMinutes);
			if (_this.markerIsOnMap()) { 
				_this.confirmMoveEncounterMarker(latDDD, lonDDD);
			} else {
				_this.placeEncounterMarker({lat: latDDD, lng: lonDDD})
			}
		}

	}


	/*
	Event handler for when a degree decimal minute field is changed
	*/
	Constructor.prototype.onDMSFieldChange = function() {

		const latDegrees = $('#input-lat_deg_dms').val();
		const lonDegrees = $('#input-lon_deg_dms').val();
		const latMinutes = $('#input-lat_min_dms').val();
		const lonMinutes = $('#input-lon_min_dms').val();
		const latDecimalSeconds = $('#input-lat_dec_sec').val();
		const lonDecimalSeconds = $('#input-lon_dec_sec').val();

		if (latDegrees && latDecimalMinutes && lonDegrees && lonDecimalMinutes && latDecimalSeconds && lonDecimalSeconds) {
			var [latDDD, lonDDD] = coordinatesToDDD(latDegrees, lonDegrees, latMinutes, lonMinutes, latDecimalSeconds, lonDecimalSeconds);
			if (_this.markerIsOnMap()) { 
				_this.confirmMoveEncounterMarker(latDDD, lonDDD);
			} else {
				_this.placeEncounterMarker({lat: latDDD, lng: lonDDD})
			}
		}

	}


	/*
	Helper function to make sure appropriate actions are triggered when
	coordinates are set from the user selecting a location
	*/
	Constructor.prototype.confirmSetMarkerFromLocationSelect = function() {
		// Set datum code to WGS84 since the coordinates stored in the DB are WGS84
		$('#input-datum').val(1).change(); //WGS84
		$('#input-location_accuracy').val(4).change(); // == < 20km
	}


	/*
	Event handler for when either the place name or BC unit select changes. 
	try to update the location coordinates and marker from coordinates stored 
	in the DB
	*/
	Constructor.prototype.onLocationSelectChange = function(e) {


		// If the element isn't in the viewport, this function is likely being manually 
		//	triggered with .change() (when data are loaded from localStorage). In that 
		//	case, nothing should happen
		const el = e.target;
		if (!isInViewport(el)) return;

		const latDDD = $('#input-lat_dec_deg').val();
		const lonDDD = $('#input-lon_dec_deg').val();

		const code = el.value;
		const coordinates = $('#input-location_type').val() === 'Place name' ? 
			_this.placeNameCoordinates :
			_this.backcountryUnitCoordinates;

		if (code in coordinates) {
			const latlon = coordinates[code];
			if (latDDD && lonDDD && _this.confirmLocationSelectChange) {
				const onConfirm = 'entryForm.confirmSetMarkerFromLocationSelect();';
				_this.confirmMoveEncounterMarker(latlon.lat, latlon.lon, onConfirm);
			} else {
				_this.placeEncounterMarker({lat: latlon.lat, lng: latlon.lon});
				_this.confirmSetMarkerFromLocationSelect();
			}
		}
	}


	/*
	Find coordinates along a road feature given a mile marker. The mile marker can be a float or an integer
	*/
	Constructor.prototype.geocodeFromMilepost = function(roadFeature, milepostFeatures, mile) {

		// If the mile marker given is greater than the road's length, alert the user and exit
		if (mile > roadFeature.properties.length_mi) {
			const message = `You entered Road mile <strong>${mile}</strong>, but ${roadFeature.properties.road_name} is only ${parseFloat(roadFeature.properties.length_mi).toFixed(1)} miles. A Road mile must be less than the road's overall length.`;
			showModal(message, 'Invalid Milepost');
			return [null, null];
		}
		// Check if the mile given is an integer
		if (Math.round(parseFloat(mile)) === parseFloat(mile)) {
			// It is, so try to return the lat/lon of the milepost. This will only work if the milepost exists (some might be missing)
			const milepost = milepostFeatures.filter(feature => feature.properties.mile == mile);
			if (milepost.length) {
				return milepost[0].geometry.coordinates; // returns [lon, lat] array
			}
		}

		// math.min fails on large arrays
		const findMin = array => array.reduce((min, currentValue) => min > currentValue ? currentValue : min, Infinity);

		// if we've gotten here, the mile either isn't a whole number or there is no matching milepost
		// first, find lat/lon of closest vertex on road to milepost feature -- with a coarse road geometry, this would not be very accurate but it will likely be a sufficient approximation
		const milepostDifferences = milepostFeatures.map(feature => Math.abs(feature.properties.mile - mile))
		const minDifference = findMin(milepostDifferences);
		const indexOfClosest = milepostDifferences.indexOf(minDifference);
		const closestMilepost = milepostFeatures[indexOfClosest];
		// remove closest and get second closest
		milepostDifferences.splice(indexOfClosest, 1); 
		milepostFeatures.splice(indexOfClosest, 1);
		const secondMinDifference = findMin(milepostDifferences);
		const indexOfSecondClosest = milepostDifferences.indexOf(secondMinDifference);
		const secondClosestMilepost = milepostFeatures[indexOfSecondClosest];

		// calculate ratio of distance between first milepost to given mile and first milepost to second milepost
		const orderedMileposts = closestMilepost.properties.mile < secondClosestMilepost.properties.mile ?
			[closestMilepost, secondClosestMilepost] :
			[secondClosestMilepost, closestMilepost];
		// use absolute value just in case the geometry is all screwy or mileposts are improperly labeled
		const firstToMileDistance = Math.abs(mile - orderedMileposts[0].properties.mile);
		const betweenMilepostDistance = orderedMileposts[1].properties.mile - orderedMileposts[0].properties.mile;
		const distanceRatio = firstToMileDistance / betweenMilepostDistance;

		// Get closest vertex to start and end mileposts
		const calculateDistance = ([lon1, lat1], [lon2, lat2]) => ((lon2 - lon1)**2 + (lat2 - lat1)**2)**.5;
		const roadVertices = roadFeature.geometry.coordinates;
		const distancesToFirst = roadVertices.map(vertex => calculateDistance(orderedMileposts[0].geometry.coordinates, vertex));
		const startRoadIndex = distancesToFirst.indexOf(findMin(distancesToFirst));

		const distancesToSecond = roadVertices.map(vertex => calculateDistance(orderedMileposts[1].geometry.coordinates, vertex));
		const endRoadIndex = distancesToSecond.indexOf(findMin(distancesToSecond));

		// Find the cumulative distance along the road with each vertex
		var cumulativeDistance = [0];
		for (let i = startRoadIndex + 1; i <= endRoadIndex; i++) {
			const distanceToNext = calculateDistance(roadVertices[i], roadVertices[i + 1]);
			cumulativeDistance.push(cumulativeDistance[i - startRoadIndex - 1] + distanceToNext);
		}

		// Find the vertex closest to the proportional distance
		const totalDistance = cumulativeDistance[cumulativeDistance.length - 1];
		const proportionalDistance = totalDistance * distanceRatio;
		const distanceDifferences = cumulativeDistance.map(d => Math.abs(d - proportionalDistance));
		const closestVertexIndex = distanceDifferences.indexOf(findMin(distanceDifferences));

		return roadVertices[startRoadIndex + closestVertexIndex]

	}

	Constructor.prototype.onRoadMileChange = function(e) {

		const mile = e.target.value;
		const roadID = $('#input-road_name').val();
		const roadGeoJSON = _this.maps.main.roads.geojson;
		let milepostFeatures = _this.maps.main.mileposts;

		// If the layers haven't been added to the map, do nothing
		if (!milepostFeatures) return;
		if (!roadGeoJSON) return;

		let roadFeature = roadGeoJSON.features.filter(f => f.properties.road_id == roadID);
		const roadName = $(`#input-road_name option[value=${roadID}]`).text();

		// Check that there is a road feature laoded onto the map
		if (!roadFeature.length) {
			showModal(`There is no road feature on the map for the road <strong>${roadName}</strong>. You will have to manually enter coordinates or place the marker on the map.`, 'No Road Feature Found');
			return;
		}
		roadFeature = roadFeature[0];
		milepostFeatures = milepostFeatures.geojson.features.filter(f => f.properties.road_id == roadID);

		// Check that there are mileposts for this 
		if (!milepostFeatures.length) {
			const message = `There is no milepost feature on the map for the road <strong>${roadName}</strong>. You will have to manually enter coordinates or place the marker on the map.`
			showModal(message, 'No Mileposts Features Found');
			return;
		}

		// check that there are mileposts for this 
		const [lon, lat] = _this.geocodeFromMilepost(roadFeature, milepostFeatures, mile);
		if (lat == null) return; // geocoding failed for some reason

		$('#input-lat_dec_deg').val(lat);
		$('#input-lon_dec_deg').val(lon).change();
	}

	/*
	Handler for expand map button click
	*/
	Constructor.prototype.onExpandMapButtonClick = function(e) {

		e.preventDefault();

		// Create marker with event listener that does the same thing as this.encounterMarker
		const modalMarker = new L.marker(_this.encounterMarker.getLatLng(), {
				draggable: true,
				autoPan: true,
			})
			.on('dragend', () => {
				// When the modal marker is moved
				//set the form marker postion
				_this.encounterMarker.setLatLng(modalMarker.getLatLng()); 
				//set coordinate fields
				_this.setCoordinatesFromMarker();
			})
			.addTo(_this.maps.modal.map);

		$('#map-modal')
			.on('shown.bs.modal', e => {
				// When the modal is shown, the map's size is not yet determined so 
				//	Leaflet thinks it's much smaller than it is. As a result, 
				//	only a single tile is shown. Reset the size after the modal is 
				//	loaded to prevent this
				_this.maps.modal.map.invalidateSize();
				
				// Center the map on the marker
				_this.maps.modal.map.setView(
					_this.markerIsOnMap() ? _this.encounterMarker.getLatLng() : _this.maps.main.map.getCenter(), 
					_this.maps.main.map.getZoom()
				);
			})
			.on('hidden.bs.modal', e => {
				// Remove the marker when the modal is hidden
				_this.maps.modal.map.removeLayer(modalMarker);

				//center form map on the marker. Do this here because it's less jarring 
				//	for the user to see the map move to center when the modal is closed
				_this.maps.main.map.setView(
					_this.markerIsOnMap() ? _this.encounterMarker.getLatLng() : _this.maps.modal.map.getCenter(),
					_this.maps.main.map.getZoom()
				);
			})
			.modal(); // Show the modal
	}


	/*
	The reactions select options and label need to change depending on the 
	user's selection of the "action-by" select. This helper function handles those updates.
	*/
	Constructor.prototype.updateReactionsSelect = function($actionBySelect) {

		const actionBy = $actionBySelect.val();
		const cardIndex = $actionBySelect.attr('id').match(/\d+$/);
		const reactionSelectID = `input-reaction-${cardIndex}`;
		const $reactionSelect = $('#' + reactionSelectID).empty();


		const $label = $reactionSelect.siblings('.field-label');
		var labelText = '',
			title = '';
		switch (parseInt(actionBy)) {
			case 1://human
				labelText = 'What did you/another person do?';
				title = `Select your/the person's reaction`;
				break;
			case 2://bear
				labelText = 'What did the bear do?';
				title = `Select the bear's reaction`;
				break;
			case 3://dog
				labelText = 'What did the dog do?';
				title = `Select the dog's reaction`;
				break;
			case 4: //stock animal
				labelText = 'What did the stock animal do?';
				title = `Select the stock animal's reaction`;
				break;
		}
		$label.text(labelText);
		$reactionSelect.attr('placeholder', labelText)
			.addClass('default')
			.attr('title', title)
			.append(`<option class="" value="">${labelText}</option>`);
		
		// Return the deferred object so other functions can be triggered 
		//	after the select is filled
		return fillSelectOptions(reactionSelectID, 
			`
			SELECT code AS value, name 
			FROM reaction_codes 
			WHERE 
				sort_order IS NOT NULL AND 
				action_by=${actionBy} 
			ORDER BY sort_order
			`
		);
	}


	/*
	Helper function to update the "accept" attribute of the attachment file input when 
	the user selects the type of file to upload. The acceptedAttachmentExtensions 
	property gets set from the database when the page is loaded
	*/
	Constructor.prototype.updateAttachmentAcceptString = function(fileTypeSelectID) {
		
		const $fileTypeSelect = $('#' + fileTypeSelectID);
		const extensions = this.acceptedAttachmentExtensions[$fileTypeSelect.val()];
		const suffix = $fileTypeSelect.attr('id').match(/\d+$/);
		$(`#attachment-upload-${suffix}`).attr('accept', extensions);

		// Get the current value so onAttachmentType change knows whether to ask to confirm
		//	a user's selection of a new file
		$fileTypeSelect.data('previous-value', $fileTypeSelect.val());
	}


	/*
	Handler for when the user changes the attachment type
	*/
	Constructor.prototype.onAttachmentTypeChange = function(e) {

		const $fileTypeSelect = $(e.target);
		const fileTypeSelectID = $fileTypeSelect.attr('id');
		const previousFileType = $fileTypeSelect.data('previous-value');//should be undefined if this is the first time this function has been called
		const $fileInput = $fileTypeSelect.closest('.card-body').find('.file-input-label ~ input[type=file]');
		const fileInputID = $fileInput.attr('id');

		// If the data-previous-value attribute has been set and there's already a file uploaded, that means the user has already selected a file
		if (previousFileType && $fileInput.get(0).files[0]) {
			const onConfirmClick = `
				entryForm.updateAttachmentAcceptString('${fileTypeSelectID}');
				$('#${fileInputID}').click();
			`;
			const footerButtons = `
				<button class="generic-button modal-button secondary-button close-modal" data-dismiss="modal" onclick="$('#${fileTypeSelectID}').val('${previousFileType}');">No</button>
				<button class="generic-button modal-button danger-button close-modal" data-dismiss="modal" onclick="${onConfirmClick}">Yes</button>
			`;
			const fileTypeCode = $fileTypeSelect.val();
			const fileType = $fileTypeSelect.find('option')
				.filter((_, option) => {return option.value === fileTypeCode})
				.html()
				.toLowerCase();
			showModal(`You already selected a file. Do you want to upload a new <strong>${fileType}</strong> file instead?`, `Upload a new file?`, 'confirm', footerButtons);
		} else {
			_this.updateAttachmentAcceptString($fileTypeSelect.attr('id'));
		}
	}


	/*
	Read an image, video, or audio file
	*/
	Constructor.prototype.readAttachment = function(sourceInput, $destinationImg, $progressBar) {

		const $barContainer = $progressBar.closest('.attachment-progress-bar-container');
	 	const file = sourceInput.files[0];
		if (sourceInput.files && file) {
			var reader = new FileReader();
			const fileName = file.name;

			reader.onprogress = function(e) {
				// Show progress
				if (e.lengthComputable) {
					const progress = e.loaded / e.total;
					$progressBar.css('width', `${$barContainer.width() * progress}px`)
				}
			}

			reader.onerror = function(e) {
				// Hide preview and progress bar and notify the user
				$progressBar.closest('.collapse').hide();
				showModal(`The file '${fileName}' failed to upload correctly. Make sure your internet connection is consistent and try again.`, 'Upload failed');
			}

			reader.onload = function(e) {
				// Show the thumbnail and hide the progress bar
				const fileType = $barContainer.closest('.card').find('select').val();
				var blob;
				if (fileType == 2) var blob = new Blob([reader.result], {type: file.type});
				setAttachmentThumbnail(fileType, $destinationImg, blob);
				$barContainer.addClass('hidden');
				$destinationImg.closest('.card')
					.find('.card-link-label')
						.fadeOut(250)
						.fadeIn(250)
						.delay(300)
						.text(fileName);
				_this.attachmentFiles[sourceInput.id] = sourceInput.files;
				$progressBar.css('width', '0px');

				// Make sure the onclick event will show this content. This is only a concern for query.html. 
				//	For that page onThumbnailClick() needs to know to read the content from the file input, 
				//	not the server URL in the event that the user has uploaded a new file in place of an old one
				$destinationImg.attr('onclick', 'onThumbnailClick(event, loadFromMemory=true)');
			}

			if (file.type.match('image')) {
				reader.readAsDataURL(file); 
			} else {
				reader.readAsArrayBuffer(file);
			}
		}
	}


	/*
	Event handler for attachment input
	*/
	Constructor.prototype.onAttachmentInputChange = function(e) {
		
		const el = e.target; 
		const $parent = $(el).closest('.field-container');

		// If the user cancels, it resets the input files attribute to null 
		//	which is dumb. Reset it to the previous file and exit
		if (el.files.length === 0) {
			el.files = _this.attachmentFiles[el.id];
			return
		}

		$parent.find('.filename-label')
			.text(el.files[0].name);
		const $thumbnail = $parent.find('.file-thumbnail')
			.addClass('hidden'); // hide thumbnail to show progress bar
		const $progressBar = $parent.find('.attachment-progress-indicator')
		$progressBar.closest('.attachment-progress-bar-container').removeClass('hidden');// Show progress bar
		$progressBar.closest('.collapse')
				.show();// make sure the collapse that contains both is open
		
		_this.readAttachment(el, $thumbnail, $progressBar);
	}


	/*
	Denali's BHIMS form doesn't collect info on each bear, but the 
	database does, so map the selections to a list of bears
	*/
	Constructor.prototype.onDENABearFieldChange = function(e) {
		
		e.preventDefault();

		var values = {};
		for (const bearField of $('.dena-bear-field')) {
			// If the field hasn't been filled, exit
			if (!bearField.value) return;
			values[bearField.name] = bearField.value;
		}

		const bearsAgeSexCodes = {
			'1':  [	//single bear of unknown age/sex
					{bear_age_code: -1, bear_sex_code: -1}
				  ], 			
			'2':  [ // bear with 1 cub of unknown age
					{bear_age_code: 4, bear_sex_code: 1}, 
					{bear_age_code: -1, bear_sex_code: -1}
				  ], 			
			'3':  [ // bear with 2 cubs of unknown age
					{bear_age_code: 4, bear_sex_code: 1}, 
					{bear_age_code: -1, bear_sex_code: -1}, 
					{bear_age_code: -1, bear_sex_code: -1}
				  ], 		
			'4':  [ // bear with 3 cubs of unknown age
					{bear_age_code: 4, bear_sex_code: 1},  
					{bear_age_code: -1, bear_sex_code: -1}, 
					{bear_age_code: -1, bear_sex_code: -1}, 
					{bear_age_code: -1, bear_sex_code: -1}
				  ], 	
			'5':  [ // 2 adults
					{bear_age_code: 4, bear_sex_code: 1}, 
					{bear_age_code: 4, bear_sex_code: 1}
				  ],			
			'-1': [ // unknown
					{bear_age_code: -1, bear_sex_code: -1}
				  ],				
			'-2': [ // other (so unknown)
					{bear_age_code: -1, bear_sex_code: -1}
				  ]				
		};
		const ageAndSex = bearsAgeSexCodes[values.bear_cohort_code];
		
		const $accordion = $('#bears-accordion');
		
		// Clear cards
		$accordion.find('.card:not(.cloneable)').remove();

		// For each individual bear, add a card
		_this.fieldValues.bears = [];

		// Bear cohort code is a field in the encounters table, not the bears table
		delete values.bear_cohort_code;

		for (const i in ageAndSex) {
			const $card = _this.addNewCard($accordion);
			const $inputs = $card.find('.input-field');
			const bear = {...ageAndSex[i], ...values};
			bear.bear_number = parseInt(i) + 1;

			// Fill values for this card
			for (name in bear) {
				$inputs.filter((_, el) => {return el.name == name})
					.val(bear[name])
					.change();
			}

			_this.fieldValues.bears[i] = {...bear};
		
		}

	}


	/*
	When the units fields for a field measured in feet/meters changes, change the value of UI 
	*/
	Constructor.prototype.onShortDistanceUnitsFieldChange = function(e) {

		const $select = $(e.target);
		const $target = $($select.data('calculation-target'));
		const multiplyBy = $select.val() === 'ft' ? FEET_PER_METER : 1 / FEET_PER_METER;
		$target.val( trueRound($target.val() * multiplyBy) ); 
	}


	/*
	When a feet/meters data field changes, check the units and save the in-memory value in meters
	*/
	Constructor.prototype.onShortDistanceFieldChange = function(e) {

		const $input = $(e.target);
		const $unitsSelect = $(`.short-distance-select[data-calculation-target="#${$input.attr('id')}"]`);
		// If the 
		if ($select.val() === 'ft') {
			const dbValue = $input.val() * FEET_PER_METER;
			_this.setInMemorydValue($input, dbValue);
		}
	}


	/*
	Reset form back to blank state
	*/
	Constructor.prototype.resetForm = function() {

		// Remove all but one (not .cloneable) card from each accordion
		$('.accordion .card:not(.cloneable)').remove();
		for (const el of $('.accordion')) {
			_this.addNewCard($(el))
		}
		
		// Reset all input values except the ones filled with the username
		$('.input-field:not(#input-entered_by):not(select)')
			.val(null);
		
		// Remove text from the .recorded-text-container. The narrative field 
		//	is actually a textarea, which records the value of the text entered 
		//	(or dictated) and a regular div, which is what the user sees.
		$('.recorded-text-container > *').text('')

		// Set all selects to their first option, which should be the default
		for (const el of $('select')) {
			const $select = $(el);
			$select.val(
				$select.find('option')[0].value
			).change();
		}

		// reset default values
		_this.setDefaultInputValues();

		if (_this.markerIsOnMap()) {
			_this.encounterMarker.remove();
			$('#encounter-marker-container').slideDown(0);
		}

		// Clear localStorage
		_this.fieldValues = {};
		window.localStorage.clear();

		const pageIndex = parseInt($('.form-page.selected').data('page-index'));
		if (pageIndex !== 0) _this.goToPage(-pageIndex);
		
		// Reset submission page
		const $confirmationContainer = $('.submition-confirmation-container')
			.addClass('hidden');
		$confirmationContainer.find('.success-query-link');
		$confirmationContainer.siblings()
			.removeClass('hidden');

		$('.form-footer').removeClass('transparent');

		customizeEntryForm();
	}


	/*
	Confirm that users wants to reset form
	*/
	Constructor.prototype.onResetFormClick = function(e) {
		e.preventDefault();
		e.stopPropagation();
		const message = 'Are you sure you want to reset the form? Any data you have entered will be deleted.'
		const footerButtons = `
			<button class="generic-button modal-button secondary-button close-modal" data-dismiss="modal">No</button>
			<button class="generic-button modal-button danger-button close-modal" data-dismiss="modal" onclick="entryForm.resetForm()">Yes</button>
		`;
		showModal(message, 'Reset Form?', 'confirm', footerButtons);
	}

	/*
	AJAX call to the PHP script to retrieve user's AD username
	*/
	Constructor.prototype.getUsername = function() {
		return $.ajax({
			url: 'bhims.php',
			method: 'POST',
			data: {action: 'getUser'},
			cache: false
		}).done(function(resultString) {
			if (queryReturnedError(resultString)) {
				throw 'User role query failed: ' + resultString;
			} else {
				const result = $.parseJSON(resultString);
				_this.username = result[0].username;
				_this.userRole = result[0].role;
				$('#input-entered_by').val(_this.username).change();	
			}
		});
	}


	/*
	Helper function to convert unordered parameters 
	into pre-prepared SQL statement and params
	*/
	Constructor.prototype.valuesToSQL = function(values, tableName, timestamp) {

		
		var sortedFields = Object.keys(values).sort();
		var parameters = sortedFields.map(f => values[f]);
		

		var returningClause = '', 
			currvalClause = '',
			parametized = '';

		if (tableName === 'encounters') {
			// Need to add RETURNING clause to get the encounter_id
			returningClause = ' RETURNING id';
			
			sortedFields = sortedFields.concat(['last_edited_by', 'datetime_last_edited']);
			parameters = parameters.concat([this.username, timestamp]);
			parametized = '$' + sortedFields.map(f => sortedFields.indexOf(f) + 1).join(', $'); //$1, $2, ...
		} else {
			// Need to add a parameter placeholder for the encounter_id for 
			//	all tables other than encounters 
			//parametized += ', $' + (sortedFields.length + 1);
			// get parametized string before adding enconter_id since currvalClause will take the place of a param
			parametized ='$' + sortedFields.map(f => sortedFields.indexOf(f) + 1).join(', $');
			currvalClause = `, currval(pg_get_serial_sequence('encounters', 'id'))`;
			sortedFields.push('encounter_id');
		}

		
		
		const statement = `
			INSERT INTO ${tableName}
				(${sortedFields.join(', ')})
			VALUES
				(${parametized}${currvalClause})
			${returningClause};
		`;
		

		return [statement, parameters];

	}


	Constructor.prototype.onSubmitButtonClick = function(e) {

		e.preventDefault();

		showLoadingIndicator('onSubmitButtonClick');

		// Validate all fields. This shouldn't be necessary since the user can't move 
		//	to a new section with invalid fields, but better safe than sorry
		for (const page of $('.form-page:not(.title-page)')) {
			const $page = $(page);
			const allFieldsValid = $page.find('.validate-field-parent')
				.map((_, parent) => {
					return _this.validateFields($(parent), focusOnField=false);
				}).get()
				.every((isValid) => isValid);
			if (!allFieldsValid) {
				hideLoadingIndicator();
				const onClick = `			
					const pageIndex = entryForm.goToPage(${$page.data('page-index') - $('.form-page.selected').data('page-index')});
					entryForm.setPreviousNextButtonState(pageIndex);
				`;
				const modalMessage = `The information you entered in one or more fields isn't valid or you forgot to fill it in. Click OK to view the invalid field(s).`;
				const buttonHTML = `<button class="generic-button modal-button close-modal" data-dismiss="modal" onclick="${onClick}">OK</button>`
				showModal(modalMessage, 'Missing or invalid information', 'alert', buttonHTML);
				return;
			}
		}	

		// Save attachments
		const $attachmentInputs = $('.card:not(.cloneable) .attachment-input');
		var deferreds = [];
		var uploadedFiles = {};
		var failedFiles = [];
		const timestamp = getFormattedTimestamp();
		for (const fileInput of $attachmentInputs) {
			if (fileInput.files.length) {
				const thisFile = fileInput.files[0];
				const fileName = thisFile.name;
				const thumbnailName = `${fileName.split('.')[0]}_thumbnail.jpg`;
				const fileTypeCode = $(fileInput).closest('.card').find('select').val();
				deferreds.push(
					saveAttachment(fileInput)
						.done(resultString => {
								if (resultString.trim().startsWith('ERROR')) {
									failedFiles.push(fileName);
									console.log(fileName + ' failed with result: ' + resultString);
									return false;
								} else {
									var result = {};
									try {
										result = $.parseJSON(resultString);
									} catch {
										failedFiles.push(fileName);
										console.log(fileName + ' failed with result: ' + resultString);
										return false;
									}
									const filePath = result.filePath.replace(/\//g, '\\');//replace forward slashes with backslash
									const filename = filePath.split('/').pop();
									const fileExtension = filename.split('.').pop();
									const fileInfo = {
										client_file_name: fileName,
										file_path: result.filePath,//should be the saved filepath (with UUID)
										file_size_kb: Math.floor(thisFile.size / 1000),
										mime_type: thisFile.type,
										attached_by: _this.username,//retrieved in window.onload()
										datetime_attached: timestamp,
										last_changed_by: _this.username,
										datetime_last_changed: timestamp,
										thumbnail_filename: result.thumbnailFilename || null
									};

									// Get input values for all input fields except file input (which has 
									//	the name "uploadedFile" used by php script)
									const $card = $(fileInput).closest('.card');
									for (const inputField of $card.find('.input-field:not(.ignore-on-insert)')) {
										const fieldName = inputField.name;
										if (fieldName in _this.fieldInfo) {
											fileInfo[fieldName] = inputField.value; 
										}
									}
									const uploadedFileIndex = Object.keys(uploadedFiles).length;
									uploadedFiles[uploadedFileIndex] = {...fileInfo};
								}
							
							}
						).fail((xhr, status, error) => {
								console.log(`File upload for ${fileName} failed with status ${status} because ${error}`);
								failedFiles.push(fileName);
						})
				);

			}
		}

		// When all of the uploads have finished (or failed), check if any failed. 
		//	If they all succeeded, then insert data
		$.when(
			...deferreds
		).then(function() {
			if (failedFiles.length) {

				const message = `
					The following files could not be saved to the server:<br>
					<ul>
						<li>${failedFiles.join('</li><li>')}</li>
					</ul>
					<br>Your encounter was not saved as a result. Check your internet and network connection, and try to submit the encounter again.`;
				hideLoadingIndicator();
				showModal(message, 'File uploads failed');
				return;
			} else {
				
				
				// for (const el of $('.short-distance-field')) {
				// 	const $input = $(el);
				// 	const $unitsSelect = $(`.short-distance-select[data-calculation-target="#${el.id}"]`);
					
				// 	if ($unitsSelect.val() === 'ft') {
				// 		const dbValue = $input.val() / FEET_PER_METER;
				// 		_this.setInMemorydValue($input, dbValue);
				// 	}
				// }

				// Insert data
				var sqlStatements = [];
				var sqlParameters = [];

				// Handle all fields in tables with 1:1 relationship to 
				var unorderedParameters = {};
				const inputsWithData = $('.input-field:not(.ignore-on-insert)')
					.filter((_, el) => {
						return $(el).data('table-name') != null && $(el).data('table-name') != ''
					});
				for (const input of inputsWithData) {
					
					const fieldName = input.name;

					//if this field isn't stored in the DB or then skip it 
					if (!(fieldName in _this.fieldInfo)) continue;

					const fieldInfo = _this.fieldInfo[fieldName];
					const tableName = fieldInfo.table_name;

					//if fieldName is actually a table name for a table with a 1:many relationship to encounters, skip it
					if ((!(fieldName in _this.fieldValues) || typeof(_this.fieldValues[tableName]) === 'object')) continue;

					if (!(tableName in unorderedParameters)) {
						unorderedParameters[tableName] = {}
					}
					
					var value = _this.fieldValues[fieldName];

					// Convert short distance fields from feet to meters if necessary
					const $input = $(input);
					if ($input.is('.short-distance-field')) {
						const $unitsSelect = $(`.short-distance-select[data-calculation-target="#${input.id}"]`);
						if ($unitsSelect.val() === 'ft') value = Math.round(value / FEET_PER_METER);
					}

					unorderedParameters[tableName][fieldName] = value;
				}


				// Make sure that encounters is the first insert since everything references it
				const [encountersSQL, encountersParams] = _this.valuesToSQL(unorderedParameters.encounters, 'encounters', timestamp);
				sqlStatements.push(encountersSQL);
				sqlParameters.push(encountersParams);

				// loop through each table and add statements and params
				for (tableName in unorderedParameters) {
					if (tableName !== 'encounters' && tableName != null) {
						const [statement, params] = _this.valuesToSQL(unorderedParameters[tableName], tableName)
						sqlStatements.push(statement);
						sqlParameters.push(params);
					} 
				}

				// Handle accordions with 1-to-many relationships to encounters
				//	Select only accordions that are visible (all accordions that aren't 
				//	collapsed .collapse-s). Because this has to be compatible with Denali's
				//	paper form for the time being, also include hidden accordions that are 
				//	implicitly filled by fields like bear info
				const $accordions = $('.accordion.form-item-list:not(.collapse:not(.show))')//includes .accordion.hidden
				for (const el of $accordions) {
					const $accordion = $(el);
					const tableName = $accordion.data('table-name');
					const fieldValueObjects = tableName === 'attachments' ?
						uploadedFiles :
						_this.fieldValues[tableName];

					if (!fieldValueObjects) {
						console.log(`No _this.fieldValues for ${tableName} (${$accordion.attr('id')})`);
						continue;
					}

					// For some accordions, the order of the items matters (i.e., reactions and bears). 
					//	Look for the class .label-with-index and get the index from the id of each card
					const indexCardLinks = $accordion.find('.card:not(.cloneable) .card-link-label.label-with-index');
					let cardIndices = indexCardLinks
						.map((i, el) => {
							return parseInt(
								$(el).closest('.card')
									.attr('id')
									.match(/\d+$/)
								);
						}).get(); // returns array like [0, 2, 3] where array items are keys of fieldValueObjects

					for (const i in fieldValueObjects) {
						let fieldValues = {...fieldValueObjects[i]};
						
						// Remove any fields aren't stored in the DB
						if (tableName != 'attachments') { //except attachments has several file attribute fields that aren't data entry fields
							for (const fieldName in fieldValues) {
								if (!(fieldName in _this.fieldInfo)) { 
									// If it's not in fieldInfo, it doesn't belong in the DB
									delete fieldValues[fieldName];
								} else {
									// If it's in fieldInfo but the table_name is blank or otherwise doesn't 
									//	match the accordion's table-name attribute, it doesn't belong either
									if (_this.fieldInfo[fieldName].table_name != tableName) delete fieldValues[fieldName];
								}
							}
						}

						// Record the order of the items if necessary
						if (indexCardLinks.length) {
							// i is the persistent key of this card whereas cardIndices.indexOf(i) 
							//	gives the sequential order
							const order = cardIndices.indexOf(parseInt(i));
							const orderField = $(indexCardLinks[order]).data('order-column');
							fieldValues[orderField] = order + 1;
						}

						const [statement, params] = _this.valuesToSQL(fieldValues, tableName);
						sqlStatements.push(statement);
						sqlParameters.push(params);
					}
				}

				$.ajax({
					url: 'bhims.php',
					method: 'POST',
					data: {action: 'paramQuery', queryString: sqlStatements, params: sqlParameters},
					cache: false
				}).done(queryResultString => {
					if (queryReturnedError(queryResultString)) {
						showModal(`An unexpected error occurred while saving data to the database: ${queryResultString.trim()}.\n\nTry reloading the page. The data you entered will be automatically reloaded (except for attachments).`, 'Unexpected error')
						return;
					}

					hideLoadingIndicator();

					// Show success message and nav buttons
					const $submissionContainer = $('.submition-confirmation-container');
					$submissionContainer
						.removeClass('hidden')
						.siblings()
							.addClass('hidden');
					$('.form-footer').addClass('transparent');

					// Clear localStorage
					_this.fieldValues = {};
					window.localStorage.clear();

					// Send email notification
					
					// If this is an admin user, show them a link to the data via the query page
					if (_this.userRole == 3) {
						const result = $.parseJSON(queryResultString)[0];
						const url = window.encodeURI(`query.html?{"encounters": {"id": {"value": ${result.id}, "operator": "="}}}`);
						$submissionContainer.append(`
							<a class="success-query-link mt-3" href="${url}" target="blank_">View your entry</a>
						`);
					}

				}).fail((xhr, status, error) => {
					showModal(`An unexpected error occurred while saving data to the database: ${error}.\n\nTry reloading the page. The data you entered will be automatically reloaded (except for attachments).`, 'Unexpected error')
				}).always(() => {
					hideLoadingIndicator();
				})
			}
		});
	}


	// *** BHIMSEntryForm end ***
	return Constructor;
})(); // run module code immediately


//** make method of form obj



function onBearGroupTypeChange() {
	/*
	If the ages/sexes of individual bears doesn't match the cohort selected, warn the user
	*/


}


function customizeEntryForm(){
	/*Dummy function that can be overloaded in bhims-custom.js*/
}


function getRoundedDDD(lat, lon) {

	const step = $('#input-lat_dec_deg').attr('step');
	const rounder = Math.round(1 / (step ? step : 0.0001));
	const latDDD = Math.round(lat * rounder) / rounder;
	const lonDDD = Math.round(lon * rounder) / rounder;

	return [latDDD, lonDDD];
}


function coordinatesToDDD(latDegrees=0, lonDegrees=0, latMinutes=0, lonMinutes=0, latSeconds=0, lonSeconds=0) {
	/*Convert coordinates to decimal degrees*/

	const latSign = latDegrees / Math.abs(latDegrees);
	var latDDD = parseInt(latDegrees) + (parseInt(latMinutes) / 60 * latSign) + (parseInt(latSeconds / 60 ** 2) * latSign);
	const lonSign = lonDegrees / Math.abs(lonDegrees);
	var lonDDD = parseInt(lonDegrees) + (parseInt(lonMinutes) / 60 * lonSign) + (parseInt(lonSeconds / 60 ** 2) * lonSign);

	return [latDDD, lonDDD];
}


function getVideoStill($thumbnail, blob) {
	var url = URL.createObjectURL(blob);
	var video = document.createElement('video');
	var timeupdate = function() {
		if (snapImage()) {
			video.removeEventListener('timeupdate', timeupdate);
			video.pause();
		}
  	};
	video.addEventListener('loadeddata', function() {
		if (snapImage()) {
		  video.removeEventListener('timeupdate', timeupdate);
		}
	});
	var snapImage = function() {
		var canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
		var imageData = canvas.toDataURL();
		var success = imageData.length > 100000;
		if (success) {
			$thumbnail.attr('src', imageData);
			URL.revokeObjectURL(url);
		}
		return success;
	};

	video.addEventListener('timeupdate', timeupdate);
	video.preload = 'metadata';
	video.src = url;
	// Load video in Safari / IE11
	video.muted = true;
	video.playsInline = true;
	video.play();
}


function setAttachmentThumbnail(fileTypeCode, $thumbnail, blob, thumbnailSrc) {

	switch (parseInt(fileTypeCode)) {
		case 1://img
			$thumbnail.attr('src', thumbnailSrc || event.target.result);
			break;
		case 2://video
			getVideoStill($thumbnail, blob);
			break;
		case 3://audio
			$thumbnail.attr('src', 'imgs/audio_thumbnail.jpg');
			break;
		default:
			throw 'Could not understand fileType: ' + fileTypeCode;
	}
	$thumbnail.removeClass('hidden');
}


function showModalImg(src) {
	/*Configure a lightbox-style modal image preview*/

	const $img = $('#modal-img-preview').attr('src', src).removeClass('hidden');
	$img.siblings(':not(.modal-header-container)').addClass('hidden');
	const img = $img.get(0);
	const imgWidth = Math.min(
		window.innerHeight * .8 * img.naturalWidth/img.naturalHeight,//img.height doesn't work because display height not set immediately
		window.innerWidth - 40
	);
	$img.closest('.modal').find('.modal-img-body').css('width', imgWidth);
	
}


function showModalVideoAudio($el, objectURL) {
	/*Configure a lightbox-style modal video or audio preview*/
	$el.removeClass('hidden')
		.siblings(':not(.modal-header-container)')
			.addClass('hidden');
	$el.children('source').attr('src', objectURL);
	$el.get(0).load();
}


function onThumbnailClick(e, loadFromMemory=true) {

	const $thumbnail = $(e.target);
	const thumbnailSrc = $thumbnail.attr('src');
	const fileInput = $thumbnail.closest('.card').find('input[type=file]').get(0);
	if (fileInput.files.length || !['', '#'].includes(thumbnailSrc)) { // this should always be the case but better safe than sorry
		const file = fileInput.files[0];
		const fileType = $thumbnail.closest('.card')
			.find('select')
				.val();
		if (fileType == 1) {
			showModalImg(
				$thumbnail.data('file-path') ? 
				'attachments/' + $thumbnail.data('file-path').split('\\').pop().split('/').pop() : 
				thumbnailSrc.replace('_thumbnail', '')
			); 
		} else if (fileType.toString().match('2|3')) {
			const url = loadFromMemory ? URL.createObjectURL(file) : 'attachments/' + $thumbnail.data('file-path').split('\\').pop().split('/').pop();
			const $el = fileType == 2 ? $('#modal-video-preview') : $('#modal-audio-preview');
			showModalVideoAudio($el, url);
		}

		$('#attachment-modal').modal();
	}

}


function initSpeechRecognition() {

	const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
	/*			window.webkitSpeechRecognition ||
				window.mozSpeechRecognition ||
				window.msSpeechRecognition ||
				window.oSpeechRecognition ||
				window.SpeechRecognition;*/
	if (!SpeechRecognition) {
		return
	}
	
	recognition = new SpeechRecognition();
	recognition.continuous = true; //recognizes until explicitly stopped
	recognition.interimResults = true;
	
	recognition.onresult = function(e) {
		if (typeof(e.results) == 'undefined') {
			recognition.stop();
			return;
		}

		var interimTranscript = entryForm.interimTranscript;
		var finalTranscript = entryForm.initialNarrativeText ;//$('#recorded-text-final').text() || '';
		var lastInterimResult = '';
		for (let result of e.results) {
			if (result.isFinal) {
				let transcript = result[0].transcript
				finalTranscript += transcript.charAt(0).toUpperCase() + transcript.slice(1);
			} else {
				lastInterimResult = result[0].transcript;
				interimTranscript += lastInterimResult;
				$('#recorded-text-interim').text(interimTranscript);
			}
		}
		$('#input-narrative').val(finalTranscript).change();
		$('#recorded-text-final').text(finalTranscript);
		$('#recorded-text-interim').text(lastInterimResult);
		
	}

	const $micButton = $('#record-narrative-button');
	const $micIcon = $micButton.children('i');
	const $recordingIndicator = $micButton.children('.record-on-indicator');
	recognition.onstart = function(e) {
		$micIcon.addClass('blink');
		$recordingIndicator.addClass('recording');
		console.log('audio started');

		entryForm.initialNarrativeText = $('#input-narrative').val();
		entryForm.interimTranscript = '';
		// Hide the placeholder if the textarea is empty
		$('#input-narrative').addClass('is-recording');
	}

	recognition.onerror = function(e) {
		if (e.error === 'not-allowed') {
			showModal('Speech recognition was not given permission to begin. Please adjust your browser settings.', 'Unable to record speech');
		} else if (e.error == 'audio-capture') {
			showModal('No microphone was found. Make sure that you have a microphone installed and that your browser settings allow access to it.', 'No microphone found');
		} else {
			const $statusMessage = $('#recording-status-message');
			$statusMessage.text(`...${e.error.message}...`);
			setTimeout(() => {$statusMessage.fadeOut(500, (_, el) => {$(el).text('').fadeIn(500)})}, 5000);
		}
	}

	recognition.onend = function(e) {
		$micIcon.removeClass('blink');
		$recordingIndicator.removeClass('recording');
		console.log('audio ended');

		$('#input-narrative').removeClass('is-recording');
		entryForm.interimTranscript = '';
	}

	recognition.soundstart = function(e) {
		console.log('soundstart')
	}

	return recognition;
}


function onMicIconClick(e){
	//var recognition = initDictation();
	e.preventDefault();

	if (! recognition) {
		console.log("speech recognition API not available")
		return;
	}
	try {
		recognition.start();
	} catch (error) {
		recognition.stop() //already started - toggle
	}
}


function saveAttachment(fileInput) {
	
	var formData = new FormData();
	formData.append('uploadedFile', fileInput.files[0], fileInput.files[0].name);
	
	return $.ajax({
		url: 'bhims.php',
		type: 'POST',
		cache: false,
		contentType: false,
		processData: false,
		data: formData
	});
}



function onlockSectionButtonClick(e) {
	// Traverse up to the button, then down to the icon to make sure selector grabs icon
	// 	since the click event can occur on either
	const $targetIcon = $(e.target).closest('.icon-button').find('i');
	const isLocked = $targetIcon.hasClass('fa-lock');
	$targetIcon.closest('.form-section').toggleClass('locked', !isLocked);
	$targetIcon.toggleClass('fa-lock', !isLocked);
	$targetIcon.toggleClass('fa-unlock', isLocked);
}

function getFormattedTimestamp(date) {

	if (date === undefined) date = new Date();

	// Get 0-padded minutes
	const minutes = ('0' + date.getMinutes()).slice(-2)

	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${minutes}`;

}

const milepostFeatures = [
{ "type": "Feature", "properties": { "FID": 1, "OBJECTID": 1, "BEG_MP": 92, "road_id": 1, "road_name": "Denali Park Road", "mile": 92 }, "geometry": { "type": "Point", "coordinates": [ -150.983732039698992, 63.538624839564598 ] } },
{ "type": "Feature", "properties": { "FID": 2, "OBJECTID": 2, "BEG_MP": 91, "road_id": 1, "road_name": "Denali Park Road", "mile": 91 }, "geometry": { "type": "Point", "coordinates": [ -150.961795580298997, 63.526687520212803 ] } },
{ "type": "Feature", "properties": { "FID": 3, "OBJECTID": 3, "BEG_MP": 90, "road_id": 1, "road_name": "Denali Park Road", "mile": 90 }, "geometry": { "type": "Point", "coordinates": [ -150.937047420199008, 63.520990760215298 ] } },
{ "type": "Feature", "properties": { "FID": 4, "OBJECTID": 4, "BEG_MP": 89, "road_id": 1, "road_name": "Denali Park Road", "mile": 89 }, "geometry": { "type": "Point", "coordinates": [ -150.912189669615003, 63.516414819887899 ] } },
{ "type": "Feature", "properties": { "FID": 5, "OBJECTID": 5, "BEG_MP": 88, "road_id": 1, "road_name": "Denali Park Road", "mile": 88 }, "geometry": { "type": "Point", "coordinates": [ -150.896262409978988, 63.501735289551803 ] } },
{ "type": "Feature", "properties": { "FID": 6, "OBJECTID": 6, "BEG_MP": 87, "road_id": 1, "road_name": "Denali Park Road", "mile": 87 }, "geometry": { "type": "Point", "coordinates": [ -150.875982070112997, 63.4930962203142 ] } },
{ "type": "Feature", "properties": { "FID": 7, "OBJECTID": 7, "BEG_MP": 86, "road_id": 1, "road_name": "Denali Park Road", "mile": 86 }, "geometry": { "type": "Point", "coordinates": [ -150.857061780374011, 63.4798058997224 ] } },
{ "type": "Feature", "properties": { "FID": 8, "OBJECTID": 8, "BEG_MP": 85, "road_id": 1, "road_name": "Denali Park Road", "mile": 85 }, "geometry": { "type": "Point", "coordinates": [ -150.839142269696993, 63.463612039663701 ] } },
{ "type": "Feature", "properties": { "FID": 9, "OBJECTID": 9, "BEG_MP": 84, "road_id": 1, "road_name": "Denali Park Road", "mile": 84 }, "geometry": { "type": "Point", "coordinates": [ -150.818215013308986, 63.451832934442301 ] } },
{ "type": "Feature", "properties": { "FID": 10, "OBJECTID": 10, "BEG_MP": 83, "road_id": 1, "road_name": "Denali Park Road", "mile": 83 }, "geometry": { "type": "Point", "coordinates": [ -150.792477050373009, 63.451476419800798 ] } },
{ "type": "Feature", "properties": { "FID": 11, "OBJECTID": 11, "BEG_MP": 82, "road_id": 1, "road_name": "Denali Park Road", "mile": 82 }, "geometry": { "type": "Point", "coordinates": [ -150.767089680042005, 63.447547639711701 ] } },
{ "type": "Feature", "properties": { "FID": 12, "OBJECTID": 12, "BEG_MP": 81, "road_id": 1, "road_name": "Denali Park Road", "mile": 81 }, "geometry": { "type": "Point", "coordinates": [ -150.741358005165011, 63.446764139553302 ] } },
{ "type": "Feature", "properties": { "FID": 13, "OBJECTID": 13, "BEG_MP": 80, "road_id": 1, "road_name": "Denali Park Road", "mile": 80 }, "geometry": { "type": "Point", "coordinates": [ -150.715572639861989, 63.444308330265102 ] } },
{ "type": "Feature", "properties": { "FID": 14, "OBJECTID": 14, "BEG_MP": 79, "road_id": 1, "road_name": "Denali Park Road", "mile": 79 }, "geometry": { "type": "Point", "coordinates": [ -150.689882799649013, 63.443659230189198 ] } },
{ "type": "Feature", "properties": { "FID": 15, "OBJECTID": 15, "BEG_MP": 78, "road_id": 1, "road_name": "Denali Park Road", "mile": 78 }, "geometry": { "type": "Point", "coordinates": [ -150.665120260289001, 63.443368789637802 ] } },
{ "type": "Feature", "properties": { "FID": 16, "OBJECTID": 16, "BEG_MP": 77, "road_id": 1, "road_name": "Denali Park Road", "mile": 77 }, "geometry": { "type": "Point", "coordinates": [ -150.639628869874002, 63.441964550423599 ] } },
{ "type": "Feature", "properties": { "FID": 17, "OBJECTID": 17, "BEG_MP": 76, "road_id": 1, "road_name": "Denali Park Road", "mile": 76 }, "geometry": { "type": "Point", "coordinates": [ -150.613949540036003, 63.440804649814602 ] } },
{ "type": "Feature", "properties": { "FID": 18, "OBJECTID": 18, "BEG_MP": 75, "road_id": 1, "road_name": "Denali Park Road", "mile": 75 }, "geometry": { "type": "Point", "coordinates": [ -150.588353189744993, 63.438004580047199 ] } },
{ "type": "Feature", "properties": { "FID": 19, "OBJECTID": 19, "BEG_MP": 74, "road_id": 1, "road_name": "Denali Park Road", "mile": 74 }, "geometry": { "type": "Point", "coordinates": [ -150.562756888016992, 63.440207696028203 ] } },
{ "type": "Feature", "properties": { "FID": 20, "OBJECTID": 20, "BEG_MP": 73, "road_id": 1, "road_name": "Denali Park Road", "mile": 73 }, "geometry": { "type": "Point", "coordinates": [ -150.536881309921995, 63.440071009869101 ] } },
{ "type": "Feature", "properties": { "FID": 21, "OBJECTID": 21, "BEG_MP": 72, "road_id": 1, "road_name": "Denali Park Road", "mile": 72 }, "geometry": { "type": "Point", "coordinates": [ -150.511429510361012, 63.4371325398347 ] } },
{ "type": "Feature", "properties": { "FID": 22, "OBJECTID": 22, "BEG_MP": 71, "road_id": 1, "road_name": "Denali Park Road", "mile": 71 }, "geometry": { "type": "Point", "coordinates": [ -150.485964409827005, 63.434703050105497 ] } },
{ "type": "Feature", "properties": { "FID": 23, "OBJECTID": 23, "BEG_MP": 70, "road_id": 1, "road_name": "Denali Park Road", "mile": 70 }, "geometry": { "type": "Point", "coordinates": [ -150.460067819970988, 63.432886219922999 ] } },
{ "type": "Feature", "properties": { "FID": 24, "OBJECTID": 24, "BEG_MP": 69, "road_id": 1, "road_name": "Denali Park Road", "mile": 69 }, "geometry": { "type": "Point", "coordinates": [ -150.434981260273986, 63.427393200435802 ] } },
{ "type": "Feature", "properties": { "FID": 25, "OBJECTID": 25, "BEG_MP": 68, "road_id": 1, "road_name": "Denali Park Road", "mile": 68 }, "geometry": { "type": "Point", "coordinates": [ -150.409367419967992, 63.427592679958103 ] } },
{ "type": "Feature", "properties": { "FID": 26, "OBJECTID": 26, "BEG_MP": 67, "road_id": 1, "road_name": "Denali Park Road", "mile": 67 }, "geometry": { "type": "Point", "coordinates": [ -150.383740550282994, 63.430250510252698 ] } },
{ "type": "Feature", "properties": { "FID": 27, "OBJECTID": 27, "BEG_MP": 66, "road_id": 1, "road_name": "Denali Park Road", "mile": 66 }, "geometry": { "type": "Point", "coordinates": [ -150.360042051895988, 63.426555301186099 ] } },
{ "type": "Feature", "properties": { "FID": 28, "OBJECTID": 28, "BEG_MP": 65, "road_id": 1, "road_name": "Denali Park Road", "mile": 65 }, "geometry": { "type": "Point", "coordinates": [ -150.335555429935994, 63.427880186021603 ] } },
{ "type": "Feature", "properties": { "FID": 29, "OBJECTID": 29, "BEG_MP": 64, "road_id": 1, "road_name": "Denali Park Road", "mile": 64 }, "geometry": { "type": "Point", "coordinates": [ -150.310581819692004, 63.431593869861103 ] } },
{ "type": "Feature", "properties": { "FID": 30, "OBJECTID": 30, "BEG_MP": 63, "road_id": 1, "road_name": "Denali Park Road", "mile": 63 }, "geometry": { "type": "Point", "coordinates": [ -150.286028370010001, 63.435829899730003 ] } },
{ "type": "Feature", "properties": { "FID": 31, "OBJECTID": 31, "BEG_MP": 62, "road_id": 1, "road_name": "Denali Park Road", "mile": 62 }, "geometry": { "type": "Point", "coordinates": [ -150.262236770208006, 63.444836819563498 ] } },
{ "type": "Feature", "properties": { "FID": 32, "OBJECTID": 32, "BEG_MP": 61, "road_id": 1, "road_name": "Denali Park Road", "mile": 61 }, "geometry": { "type": "Point", "coordinates": [ -150.237994750355, 63.453309480048297 ] } },
{ "type": "Feature", "properties": { "FID": 33, "OBJECTID": 33, "BEG_MP": 60, "road_id": 1, "road_name": "Denali Park Road", "mile": 60 }, "geometry": { "type": "Point", "coordinates": [ -150.22889156978701, 63.457300479733298 ] } },
{ "type": "Feature", "properties": { "FID": 34, "OBJECTID": 34, "BEG_MP": 59, "road_id": 1, "road_name": "Denali Park Road", "mile": 59 }, "geometry": { "type": "Point", "coordinates": [ -150.208869201350012, 63.464536681222697 ] } },
{ "type": "Feature", "properties": { "FID": 35, "OBJECTID": 35, "BEG_MP": 58, "road_id": 1, "road_name": "Denali Park Road", "mile": 58 }, "geometry": { "type": "Point", "coordinates": [ -150.183300961167987, 63.466042684122399 ] } },
{ "type": "Feature", "properties": { "FID": 36, "OBJECTID": 36, "BEG_MP": 57, "road_id": 1, "road_name": "Denali Park Road", "mile": 57 }, "geometry": { "type": "Point", "coordinates": [ -150.158284890332993, 63.472014320104698 ] } },
{ "type": "Feature", "properties": { "FID": 37, "OBJECTID": 37, "BEG_MP": 56, "road_id": 1, "road_name": "Denali Park Road", "mile": 56 }, "geometry": { "type": "Point", "coordinates": [ -150.136828439578011, 63.483823280120198 ] } },
{ "type": "Feature", "properties": { "FID": 38, "OBJECTID": 38, "BEG_MP": 55, "road_id": 1, "road_name": "Denali Park Road", "mile": 55 }, "geometry": { "type": "Point", "coordinates": [ -150.116646999956004, 63.492218929859597 ] } },
{ "type": "Feature", "properties": { "FID": 39, "OBJECTID": 39, "BEG_MP": 54, "road_id": 1, "road_name": "Denali Park Road", "mile": 54 }, "geometry": { "type": "Point", "coordinates": [ -150.091823279718, 63.493884619979099 ] } },
{ "type": "Feature", "properties": { "FID": 40, "OBJECTID": 40, "BEG_MP": 53, "road_id": 1, "road_name": "Denali Park Road", "mile": 53 }, "geometry": { "type": "Point", "coordinates": [ -150.06725602094599, 63.501312119858298 ] } },
{ "type": "Feature", "properties": { "FID": 41, "OBJECTID": 41, "BEG_MP": 52, "road_id": 1, "road_name": "Denali Park Road", "mile": 52 }, "geometry": { "type": "Point", "coordinates": [ -150.048759392828998, 63.514993013316698 ] } },
{ "type": "Feature", "properties": { "FID": 42, "OBJECTID": 42, "BEG_MP": 51, "road_id": 1, "road_name": "Denali Park Road", "mile": 51 }, "geometry": { "type": "Point", "coordinates": [ -150.025267549655013, 63.518041920098398 ] } },
{ "type": "Feature", "properties": { "FID": 43, "OBJECTID": 43, "BEG_MP": 50, "road_id": 1, "road_name": "Denali Park Road", "mile": 50 }, "geometry": { "type": "Point", "coordinates": [ -149.999543449767003, 63.5156015701562 ] } },
{ "type": "Feature", "properties": { "FID": 44, "OBJECTID": 44, "BEG_MP": 49, "road_id": 1, "road_name": "Denali Park Road", "mile": 49 }, "geometry": { "type": "Point", "coordinates": [ -149.975855430281001, 63.511468619680898 ] } },
{ "type": "Feature", "properties": { "FID": 45, "OBJECTID": 45, "BEG_MP": 48, "road_id": 1, "road_name": "Denali Park Road", "mile": 48 }, "geometry": { "type": "Point", "coordinates": [ -149.952550950062999, 63.515856289635998 ] } },
{ "type": "Feature", "properties": { "FID": 46, "OBJECTID": 46, "BEG_MP": 47, "road_id": 1, "road_name": "Denali Park Road", "mile": 47 }, "geometry": { "type": "Point", "coordinates": [ -149.927421028655004, 63.5212821171759 ] } },
{ "type": "Feature", "properties": { "FID": 47, "OBJECTID": 47, "BEG_MP": 46, "road_id": 1, "road_name": "Denali Park Road", "mile": 46 }, "geometry": { "type": "Point", "coordinates": [ -149.902033980281004, 63.526424189724501 ] } },
{ "type": "Feature", "properties": { "FID": 48, "OBJECTID": 48, "BEG_MP": 45, "road_id": 1, "road_name": "Denali Park Road", "mile": 45 }, "geometry": { "type": "Point", "coordinates": [ -149.87636959987401, 63.528754299870897 ] } },
{ "type": "Feature", "properties": { "FID": 49, "OBJECTID": 49, "BEG_MP": 44, "road_id": 1, "road_name": "Denali Park Road", "mile": 44 }, "geometry": { "type": "Point", "coordinates": [ -149.851488760095009, 63.532349870350103 ] } },
{ "type": "Feature", "properties": { "FID": 50, "OBJECTID": 50, "BEG_MP": 43, "road_id": 1, "road_name": "Denali Park Road", "mile": 43 }, "geometry": { "type": "Point", "coordinates": [ -149.826115045969999, 63.5359302890515 ] } },
{ "type": "Feature", "properties": { "FID": 51, "OBJECTID": 51, "BEG_MP": 42, "road_id": 1, "road_name": "Denali Park Road", "mile": 42 }, "geometry": { "type": "Point", "coordinates": [ -149.804790839622996, 63.541458480124597 ] } },
{ "type": "Feature", "properties": { "FID": 52, "OBJECTID": 52, "BEG_MP": 41, "road_id": 1, "road_name": "Denali Park Road", "mile": 41 }, "geometry": { "type": "Point", "coordinates": [ -149.794081146124995, 63.559522609880403 ] } },
{ "type": "Feature", "properties": { "FID": 53, "OBJECTID": 53, "BEG_MP": 40, "road_id": 1, "road_name": "Denali Park Road", "mile": 40 }, "geometry": { "type": "Point", "coordinates": [ -149.76845894032499, 63.558499309995 ] } },
{ "type": "Feature", "properties": { "FID": 54, "OBJECTID": 54, "BEG_MP": 39, "road_id": 1, "road_name": "Denali Park Road", "mile": 39 }, "geometry": { "type": "Point", "coordinates": [ -149.743011349591001, 63.556615189839 ] } },
{ "type": "Feature", "properties": { "FID": 55, "OBJECTID": 55, "BEG_MP": 38, "road_id": 1, "road_name": "Denali Park Road", "mile": 38 }, "geometry": { "type": "Point", "coordinates": [ -149.719009679849989, 63.551567740358799 ] } },
{ "type": "Feature", "properties": { "FID": 56, "OBJECTID": 56, "BEG_MP": 37, "road_id": 1, "road_name": "Denali Park Road", "mile": 37 }, "geometry": { "type": "Point", "coordinates": [ -149.693312289827986, 63.554085360051197 ] } },
{ "type": "Feature", "properties": { "FID": 57, "OBJECTID": 57, "BEG_MP": 36, "road_id": 1, "road_name": "Denali Park Road", "mile": 36 }, "geometry": { "type": "Point", "coordinates": [ -149.667666959759998, 63.554005010122999 ] } },
{ "type": "Feature", "properties": { "FID": 58, "OBJECTID": 58, "BEG_MP": 35, "road_id": 1, "road_name": "Denali Park Road", "mile": 35 }, "geometry": { "type": "Point", "coordinates": [ -149.643865890096009, 63.5599130604393 ] } },
{ "type": "Feature", "properties": { "FID": 59, "OBJECTID": 59, "BEG_MP": 34, "road_id": 1, "road_name": "Denali Park Road", "mile": 34 }, "geometry": { "type": "Point", "coordinates": [ -149.626383990426007, 63.5773431996288 ] } },
{ "type": "Feature", "properties": { "FID": 60, "OBJECTID": 60, "BEG_MP": 33, "road_id": 1, "road_name": "Denali Park Road", "mile": 33 }, "geometry": { "type": "Point", "coordinates": [ -149.609658770432986, 63.594932540404301 ] } },
{ "type": "Feature", "properties": { "FID": 61, "OBJECTID": 61, "BEG_MP": 32, "road_id": 1, "road_name": "Denali Park Road", "mile": 32 }, "geometry": { "type": "Point", "coordinates": [ -149.586887839999008, 63.606950010034801 ] } },
{ "type": "Feature", "properties": { "FID": 62, "OBJECTID": 62, "BEG_MP": 31, "road_id": 1, "road_name": "Denali Park Road", "mile": 31 }, "geometry": { "type": "Point", "coordinates": [ -149.577916140315011, 63.626567549552597 ] } },
{ "type": "Feature", "properties": { "FID": 63, "OBJECTID": 63, "BEG_MP": 30, "road_id": 1, "road_name": "Denali Park Road", "mile": 30 }, "geometry": { "type": "Point", "coordinates": [ -149.569732459882005, 63.641684840183103 ] } },
{ "type": "Feature", "properties": { "FID": 64, "OBJECTID": 64, "BEG_MP": 29, "road_id": 1, "road_name": "Denali Park Road", "mile": 29 }, "geometry": { "type": "Point", "coordinates": [ -149.569553459721988, 63.6557465497633 ] } },
{ "type": "Feature", "properties": { "FID": 65, "OBJECTID": 65, "BEG_MP": 28, "road_id": 1, "road_name": "Denali Park Road", "mile": 28 }, "geometry": { "type": "Point", "coordinates": [ -149.580210409779994, 63.675756280028203 ] } },
{ "type": "Feature", "properties": { "FID": 66, "OBJECTID": 66, "BEG_MP": 27, "road_id": 1, "road_name": "Denali Park Road", "mile": 27 }, "geometry": { "type": "Point", "coordinates": [ -149.565923599890994, 63.694338520006497 ] } },
{ "type": "Feature", "properties": { "FID": 67, "OBJECTID": 67, "BEG_MP": 26, "road_id": 1, "road_name": "Denali Park Road", "mile": 26 }, "geometry": { "type": "Point", "coordinates": [ -149.546933350090995, 63.711321539657199 ] } },
{ "type": "Feature", "properties": { "FID": 68, "OBJECTID": 68, "BEG_MP": 25, "road_id": 1, "road_name": "Denali Park Road", "mile": 25 }, "geometry": { "type": "Point", "coordinates": [ -149.522795719944014, 63.712964520096399 ] } },
{ "type": "Feature", "properties": { "FID": 69, "OBJECTID": 69, "BEG_MP": 24, "road_id": 1, "road_name": "Denali Park Road", "mile": 24 }, "geometry": { "type": "Point", "coordinates": [ -149.49736149043801, 63.7088353899411 ] } },
{ "type": "Feature", "properties": { "FID": 70, "OBJECTID": 70, "BEG_MP": 23, "road_id": 1, "road_name": "Denali Park Road", "mile": 23 }, "geometry": { "type": "Point", "coordinates": [ -149.477212810420014, 63.721479650165598 ] } },
{ "type": "Feature", "properties": { "FID": 71, "OBJECTID": 71, "BEG_MP": 22, "road_id": 1, "road_name": "Denali Park Road", "mile": 22 }, "geometry": { "type": "Point", "coordinates": [ -149.452832349830004, 63.728628469927799 ] } },
{ "type": "Feature", "properties": { "FID": 72, "OBJECTID": 72, "BEG_MP": 21, "road_id": 1, "road_name": "Denali Park Road", "mile": 21 }, "geometry": { "type": "Point", "coordinates": [ -149.427892980373997, 63.722024040377001 ] } },
{ "type": "Feature", "properties": { "FID": 73, "OBJECTID": 73, "BEG_MP": 20, "road_id": 1, "road_name": "Denali Park Road", "mile": 20 }, "geometry": { "type": "Point", "coordinates": [ -149.409892239333004, 63.723096395581997 ] } },
{ "type": "Feature", "properties": { "FID": 74, "OBJECTID": 74, "BEG_MP": 19, "road_id": 1, "road_name": "Denali Park Road", "mile": 19 }, "geometry": { "type": "Point", "coordinates": [ -149.390103450010997, 63.717711239881702 ] } },
{ "type": "Feature", "properties": { "FID": 75, "OBJECTID": 75, "BEG_MP": 18, "road_id": 1, "road_name": "Denali Park Road", "mile": 18 }, "geometry": { "type": "Point", "coordinates": [ -149.37026752992, 63.726494670092798 ] } },
{ "type": "Feature", "properties": { "FID": 76, "OBJECTID": 76, "BEG_MP": 17, "road_id": 1, "road_name": "Denali Park Road", "mile": 17 }, "geometry": { "type": "Point", "coordinates": [ -149.348879499585991, 63.731639230166202 ] } },
{ "type": "Feature", "properties": { "FID": 77, "OBJECTID": 77, "BEG_MP": 16, "road_id": 1, "road_name": "Denali Park Road", "mile": 16 }, "geometry": { "type": "Point", "coordinates": [ -149.32323527028899, 63.729746429753703 ] } },
{ "type": "Feature", "properties": { "FID": 78, "OBJECTID": 78, "BEG_MP": 15, "road_id": 1, "road_name": "Denali Park Road", "mile": 15 }, "geometry": { "type": "Point", "coordinates": [ -149.299625480129009, 63.738441440419997 ] } },
{ "type": "Feature", "properties": { "FID": 79, "OBJECTID": 79, "BEG_MP": 14, "road_id": 1, "road_name": "Denali Park Road", "mile": 14 }, "geometry": { "type": "Point", "coordinates": [ -149.282080639606988, 63.729427209997603 ] } },
{ "type": "Feature", "properties": { "FID": 80, "OBJECTID": 80, "BEG_MP": 13, "road_id": 1, "road_name": "Denali Park Road", "mile": 13 }, "geometry": { "type": "Point", "coordinates": [ -149.261858163021003, 63.719044830154701 ] } },
{ "type": "Feature", "properties": { "FID": 81, "OBJECTID": 81, "BEG_MP": 12, "road_id": 1, "road_name": "Denali Park Road", "mile": 12 }, "geometry": { "type": "Point", "coordinates": [ -149.232399040181008, 63.7131886473381 ] } },
{ "type": "Feature", "properties": { "FID": 82, "OBJECTID": 82, "BEG_MP": 11, "road_id": 1, "road_name": "Denali Park Road", "mile": 11 }, "geometry": { "type": "Point", "coordinates": [ -149.200158069635989, 63.711224439855897 ] } },
{ "type": "Feature", "properties": { "FID": 83, "OBJECTID": 83, "BEG_MP": 10, "road_id": 1, "road_name": "Denali Park Road", "mile": 10 }, "geometry": { "type": "Point", "coordinates": [ -149.167954539666994, 63.711998880244003 ] } },
{ "type": "Feature", "properties": { "FID": 84, "OBJECTID": 84, "BEG_MP": 9, "road_id": 1, "road_name": "Denali Park Road", "mile": 9 }, "geometry": { "type": "Point", "coordinates": [ -149.135920999552013, 63.711136309892602 ] } },
{ "type": "Feature", "properties": { "FID": 85, "OBJECTID": 85, "BEG_MP": 8, "road_id": 1, "road_name": "Denali Park Road", "mile": 8 }, "geometry": { "type": "Point", "coordinates": [ -149.104469013232006, 63.712147114597499 ] } },
{ "type": "Feature", "properties": { "FID": 86, "OBJECTID": 86, "BEG_MP": 7, "road_id": 1, "road_name": "Denali Park Road", "mile": 7 }, "geometry": { "type": "Point", "coordinates": [ -149.074794088174002, 63.7167484149073 ] } },
{ "type": "Feature", "properties": { "FID": 87, "OBJECTID": 87, "BEG_MP": 6, "road_id": 1, "road_name": "Denali Park Road", "mile": 6 }, "geometry": { "type": "Point", "coordinates": [ -149.042694439793991, 63.715915839644197 ] } },
{ "type": "Feature", "properties": { "FID": 88, "OBJECTID": 88, "BEG_MP": 5, "road_id": 1, "road_name": "Denali Park Road", "mile": 5 }, "geometry": { "type": "Point", "coordinates": [ -149.012182950979991, 63.717412848424097 ] } },
{ "type": "Feature", "properties": { "FID": 89, "OBJECTID": 89, "BEG_MP": 4, "road_id": 1, "road_name": "Denali Park Road", "mile": 4 }, "geometry": { "type": "Point", "coordinates": [ -148.983924690169005, 63.7196289101459 ] } },
{ "type": "Feature", "properties": { "FID": 90, "OBJECTID": 90, "BEG_MP": 3, "road_id": 1, "road_name": "Denali Park Road", "mile": 3 }, "geometry": { "type": "Point", "coordinates": [ -148.954076499927993, 63.722822839802099 ] } },
{ "type": "Feature", "properties": { "FID": 91, "OBJECTID": 91, "BEG_MP": 2, "road_id": 1, "road_name": "Denali Park Road", "mile": 2 }, "geometry": { "type": "Point", "coordinates": [ -148.923442962319996, 63.726846816727097 ] } },
{ "type": "Feature", "properties": { "FID": 92, "OBJECTID": 92, "BEG_MP": 1, "road_id": 1, "road_name": "Denali Park Road", "mile": 1 }, "geometry": { "type": "Point", "coordinates": [ -148.908630430346989, 63.737277859785301 ] } },
{ "type": "Feature", "properties": { "FID": 93, "OBJECTID": 93, "BEG_MP": 0, "road_id": 1, "road_name": "Denali Park Road", "mile": 0 }, "geometry": { "type": "Point", "coordinates": [ -148.886171269686002, 63.728447080268403 ] } }
]

const roadFeature = { "type": "Feature", "properties": { "OBJECTID": 1, "ROUTE": 4, "road_id": 1, "road_name": "Denali Park Road", "length_mi": 92.540089186898143 }, "geometry": { "type": "LineString", "coordinates": [ [ -148.886348370733998, 63.728441345519002 ], [ -148.886821092084006, 63.7286550110056 ], [ -148.887294191624989, 63.728857462222798 ], [ -148.887843763847997, 63.729086088575002 ], [ -148.888362302871002, 63.729277736535202 ], [ -148.888942004587989, 63.729552284966204 ], [ -148.889338820992009, 63.729762234844699 ], [ -148.889705176423007, 63.730013803116002 ], [ -148.890132651429013, 63.730344902977599 ], [ -148.890750748040006, 63.730825667182003 ], [ -148.891139596387006, 63.731146974692102 ], [ -148.891795791447009, 63.731660964730899 ], [ -148.892528174424001, 63.732268468538898 ], [ -148.89319974864199, 63.732802057216098 ], [ -148.893733928231995, 63.733228821759297 ], [ -148.894206855297, 63.733633295893 ], [ -148.894954630906, 63.7342132446243 ], [ -148.895458120452986, 63.734617630735499 ], [ -148.895915745615014, 63.7349497364998 ], [ -148.89663298568999, 63.735391691267303 ], [ -148.897243535554992, 63.735681844465802 ], [ -148.897960708256988, 63.735991333238204 ], [ -148.898738668156994, 63.736265839547798 ], [ -148.89980719352701, 63.736589498089501 ], [ -148.901027546754989, 63.736861056698103 ], [ -148.901897395325989, 63.737020802127397 ], [ -148.902889475861997, 63.737157749912399 ], [ -148.903636967603006, 63.737242613433899 ], [ -148.904613693235007, 63.737321781024598 ], [ -148.905361261333013, 63.737360614867399 ], [ -148.906032618159003, 63.737364307174197 ], [ -148.906749916624989, 63.737356084646102 ], [ -148.907527859456991, 63.737326343051002 ], [ -148.908809903589997, 63.737253073488397 ], [ -148.909133474958992, 63.737232121178501 ], [ -148.910152486985993, 63.737166129906299 ], [ -148.912242854974011, 63.737047264695398 ], [ -148.912959909996999, 63.737001962344301 ], [ -148.913510559299993, 63.736934696552602 ], [ -148.91428763975, 63.736795495450203 ], [ -148.914699716732997, 63.736696078448503 ], [ -148.915264311483014, 63.736467126448098 ], [ -148.915706641029999, 63.736158825871698 ], [ -148.915981149113009, 63.7358650470782 ], [ -148.916103282263009, 63.735646928227503 ], [ -148.916133638133005, 63.735346006630998 ], [ -148.916087762068997, 63.735128935226498 ], [ -148.915889570361003, 63.734793334906499 ], [ -148.915721544978993, 63.734553045791401 ], [ -148.915507871706012, 63.734301106848598 ], [ -148.915461536603004, 63.734233213678998 ], [ -148.915440439668998, 63.734181177708699 ], [ -148.915450619377992, 63.734122597771503 ], [ -148.915461114394986, 63.734037417984297 ], [ -148.915521300621009, 63.733889293719301 ], [ -148.915572936681997, 63.733765590547797 ], [ -148.915599289659013, 63.733739758194702 ], [ -148.915697242855998, 63.733731707941303 ], [ -148.915847845412998, 63.733679975566901 ], [ -148.915922714602004, 63.733599920793203 ], [ -148.916240337326997, 63.733630168805199 ], [ -148.916403896285999, 63.733638457216898 ], [ -148.916536006125, 63.7336215460559 ], [ -148.916722429901995, 63.733570833979797 ], [ -148.916866866423987, 63.733513948313899 ], [ -148.917026515913989, 63.733431442189001 ], [ -148.917168045486989, 63.733329313999597 ], [ -148.917416965958012, 63.733166670235299 ], [ -148.917604372492008, 63.733045563899701 ], [ -148.917827743977, 63.732954191742202 ], [ -148.918271388659008, 63.7327717152899 ], [ -148.918541672863, 63.732653064572503 ], [ -148.918793995252997, 63.732534495254598 ], [ -148.919019352914006, 63.732393519237696 ], [ -148.919149525086993, 63.732301531930197 ], [ -148.919238713421009, 63.732234221162003 ], [ -148.919310778070013, 63.732166330980697 ], [ -148.919385466698003, 63.7320833235677 ], [ -148.919444019785999, 63.731994067735201 ], [ -148.919479857175986, 63.7319116458333 ], [ -148.919513383201007, 63.731817742259601 ], [ -148.919528474897987, 63.731730816948499 ], [ -148.919530398191, 63.731645347281798 ], [ -148.919504655168993, 63.731545635458403 ], [ -148.919469696331987, 63.731449413201602 ], [ -148.919408386313989, 63.731331391071301 ], [ -148.919264048607005, 63.731121223040802 ], [ -148.919120699046999, 63.730905386298403 ], [ -148.919065967391987, 63.7307742805584 ], [ -148.919048757468005, 63.730625437855501 ], [ -148.919066461465007, 63.730498685211501 ], [ -148.919096019632008, 63.730378035810801 ], [ -148.919163441786992, 63.730262469509697 ], [ -148.919275619806001, 63.730112303304601 ], [ -148.919986597725995, 63.729339939946001 ], [ -148.920241565655004, 63.729061550935597 ], [ -148.920300109760007, 63.728972295107901 ], [ -148.920358979953988, 63.728881149150403 ], [ -148.920404667371002, 63.728766748100902 ], [ -148.920438467382013, 63.728596823199403 ], [ -148.92044967296701, 63.728439397589199 ], [ -148.920469541006014, 63.728340739683397 ], [ -148.92052536141901, 63.728181188951702 ], [ -148.920558948529987, 63.728085179903701 ], [ -148.920676063689996, 63.727947196893602 ], [ -148.92083331737399, 63.727785250227001 ], [ -148.920965595197003, 63.727692787077601 ], [ -148.921157444799007, 63.727579529178698 ], [ -148.921350619417012, 63.727483423849598 ], [ -148.921595151616998, 63.727389055450899 ], [ -148.921879198909011, 63.727315030874998 ], [ -148.922030591983997, 63.727261229400803 ], [ -148.922272824497014, 63.727180086814897 ], [ -148.922542043300012, 63.727092254951202 ], [ -148.922773958661992, 63.727015903019499 ], [ -148.923091064854987, 63.726934960935203 ], [ -148.923594719692005, 63.726819542006098 ], [ -148.923975821867003, 63.726751208576999 ], [ -148.924937161154986, 63.726625846225801 ], [ -148.92571562231501, 63.726560119284599 ], [ -148.926829470385002, 63.726498989366199 ], [ -148.927653324315997, 63.726442643791799 ], [ -148.928233260492988, 63.7263892776718 ], [ -148.929026713637995, 63.726258939134198 ], [ -148.929805022983004, 63.726102266783698 ], [ -148.930766258066001, 63.725885543937203 ], [ -148.931651168689996, 63.7257021569675 ], [ -148.932322433888004, 63.725614818381501 ], [ -148.932887270283999, 63.725553069254303 ], [ -148.933467023204997, 63.725469371577098 ], [ -148.933955255764999, 63.725354522083101 ], [ -148.934580762579003, 63.725167977401199 ], [ -148.935298186810002, 63.724984530503598 ], [ -148.935847262263991, 63.724885198429199 ], [ -148.936671109007989, 63.724771561045699 ], [ -148.937312276151999, 63.724740431865101 ], [ -148.938486913216991, 63.724729533720897 ], [ -148.939585768406005, 63.7247250511844 ], [ -148.940119585077014, 63.724713861939698 ], [ -148.94095898345401, 63.724653481220201 ], [ -148.941492895347011, 63.724588413410203 ], [ -148.942637235831, 63.724412585776498 ], [ -148.943705595012005, 63.7242442918335 ], [ -148.944361575375012, 63.724153020879697 ], [ -148.944926080292987, 63.7241001956574 ], [ -148.946177376890006, 63.723981821927197 ], [ -148.947306671491987, 63.723881779253198 ], [ -148.948374700091989, 63.723794258475003 ], [ -148.94918344346101, 63.723721577412299 ], [ -148.950083627241014, 63.723641866280801 ], [ -148.950831412730992, 63.723561513456602 ], [ -148.951502716557002, 63.723443789283003 ], [ -148.952097668074003, 63.723310024992799 ], [ -148.953226924946989, 63.7230348397052 ], [ -148.954744722941996, 63.7226705271502 ], [ -148.954752783525009, 63.722668592742501 ], [ -148.955500342639994, 63.722486069404198 ], [ -148.95633963411899, 63.722276320438603 ], [ -148.956843283566002, 63.722154063827197 ], [ -148.957682460958011, 63.722009403791198 ], [ -148.958460634657996, 63.722008605193103 ], [ -148.959177939412001, 63.722126980021699 ], [ -148.959605157499993, 63.722260303283598 ], [ -148.960490137293988, 63.722547051699003 ], [ -148.960664264033994, 63.7225812662655 ], [ -148.960703712650997, 63.722589017441301 ], [ -148.96099359629801, 63.7226380339348 ], [ -148.96145148286999, 63.722683709674001 ], [ -148.961848125898996, 63.722684677275097 ], [ -148.962565394720997, 63.722607733598998 ], [ -148.963083894217988, 63.722474729738103 ], [ -148.963755472028993, 63.7221998250591 ], [ -148.964335335442996, 63.721966737619297 ], [ -148.964762487055992, 63.7218216856757 ], [ -148.965213461990004, 63.721750574483899 ], [ -148.965220307152009, 63.721749495093803 ], [ -148.96546148414501, 63.7217392667376 ], [ -148.965748054805005, 63.721746503107099 ], [ -148.966046574855994, 63.721762455726001 ], [ -148.966316318274011, 63.721789321139198 ], [ -148.966466325249002, 63.721808606950503 ], [ -148.96664744267801, 63.7218503176626 ], [ -148.966776696772001, 63.721880787041101 ], [ -148.967044007553, 63.7219218235293 ], [ -148.96727610976501, 63.721948613226402 ], [ -148.96751579285899, 63.721962589515897 ], [ -148.967810999922989, 63.721966547514498 ], [ -148.968115614144011, 63.721947062558598 ], [ -148.968535360943008, 63.721899362878098 ], [ -148.968969088223986, 63.721848567736501 ], [ -148.969324069186996, 63.721808266907601 ], [ -148.970408212665006, 63.721669761701499 ], [ -148.971201487943006, 63.721566142158899 ], [ -148.972163054504989, 63.721401935320998 ], [ -148.973353221644999, 63.721184768797698 ], [ -148.974405969902989, 63.720962992192 ], [ -148.975596276282005, 63.720718876747597 ], [ -148.976267571123998, 63.7205853338344 ], [ -148.977060895808989, 63.720425567930903 ], [ -148.977436110425003, 63.720350544324297 ], [ -148.977761127182987, 63.720293204500699 ], [ -148.977881280446013, 63.720270341244202 ], [ -148.978189991882999, 63.720211556292199 ], [ -148.978506081184008, 63.720169859868797 ], [ -148.979111018373999, 63.720112254389697 ], [ -148.979455137807008, 63.720084828168098 ], [ -148.979916149616997, 63.720053936846497 ], [ -148.980266880649992, 63.720034302217698 ], [ -148.980645703799013, 63.720005257928797 ], [ -148.981099863260994, 63.719973975545003 ], [ -148.981479164312987, 63.719940473354697 ], [ -148.981733521387014, 63.719919700322102 ], [ -148.981950477104988, 63.719901283871302 ], [ -148.98213899755001, 63.7198878657832 ], [ -148.982321804711006, 63.719864918674197 ], [ -148.982519365801011, 63.719836836739297 ], [ -148.98269960018601, 63.719810725176302 ], [ -148.982850649206995, 63.719789704256897 ], [ -148.982984141553004, 63.719765676807 ], [ -148.983166910085004, 63.719735056395699 ], [ -148.983327849557014, 63.719705573489499 ], [ -148.983475398741007, 63.719675139553701 ], [ -148.983634052000014, 63.719641307281698 ], [ -148.983768259404997, 63.719611822686801 ], [ -148.983878146720002, 63.719583896415799 ], [ -148.984011368673009, 63.719554634894699 ], [ -148.984135151130005, 63.7195233388871 ], [ -148.984281884642996, 63.719487451689801 ], [ -148.984498031876996, 63.719430435074202 ], [ -148.984755661513987, 63.719356880885002 ], [ -148.984798616256001, 63.719345062669703 ], [ -148.985067136168993, 63.719271183299398 ], [ -148.985424384478989, 63.719182295117903 ], [ -148.985862930323009, 63.719091208297002 ], [ -148.986326769132006, 63.718994865306797 ], [ -148.98636337997101, 63.718987051892597 ], [ -148.986577346994011, 63.718943542304999 ], [ -148.986764360964003, 63.718911046001999 ], [ -148.987467294471003, 63.718827257871403 ], [ -148.988291203198003, 63.718720087505297 ], [ -148.988825396263991, 63.718616708143003 ], [ -148.989542505185, 63.718437499833499 ], [ -148.990595047728988, 63.718156126094499 ], [ -148.991831186154002, 63.717839343953599 ], [ -148.992762080637988, 63.717613382437598 ], [ -148.993937037503997, 63.717392189610898 ], [ -148.994852479168998, 63.717282427080498 ], [ -148.995783286516996, 63.717209086879301 ], [ -148.996927657544006, 63.717140615672797 ], [ -148.998224512200011, 63.717068239714997 ], [ -148.999140057172013, 63.717019062415197 ], [ -148.999735342863005, 63.716964821699499 ], [ -149.000437113050992, 63.716858008248302 ], [ -149.001032292741002, 63.716709480937197 ], [ -149.001581408618989, 63.716503299047602 ], [ -149.002176577529013, 63.716213351209802 ], [ -149.002817410500001, 63.715912574838597 ], [ -149.00335143378399, 63.715740678005197 ], [ -149.003870298895009, 63.715633370641797 ], [ -149.004358679678006, 63.715568818316399 ], [ -149.004862179105999, 63.7155496631053 ], [ -149.005350233799987, 63.715572640366801 ], [ -149.005823230034991, 63.715629908606701 ], [ -149.006311547935013, 63.715725844174997 ], [ -149.006769376116011, 63.715881371466502 ], [ -149.007211969768008, 63.716061080873899 ], [ -149.00782240464801, 63.716323815209897 ], [ -149.008936339855012, 63.7167929674563 ], [ -149.010080550084012, 63.717293419979697 ], [ -149.010294350918002, 63.717379375743903 ], [ -149.010466395363011, 63.7174492389736 ], [ -149.010557350683996, 63.717483621996401 ], [ -149.01069989265801, 63.717518294952797 ], [ -149.010858239592011, 63.717554918137203 ], [ -149.010987633822992, 63.717572047736297 ], [ -149.011196704128992, 63.717576147160003 ], [ -149.011367265455988, 63.717578966159799 ], [ -149.011478304411014, 63.717571253786097 ], [ -149.01159448442499, 63.717552309158002 ], [ -149.011698022448002, 63.7175368641077 ], [ -149.012232136461989, 63.717388507822498 ], [ -149.012940991662987, 63.717150003598803 ], [ -149.013422189516007, 63.716988094157102 ], [ -149.014109051264001, 63.716781956462498 ], [ -149.01459738713001, 63.7166747210686 ], [ -149.015573821707989, 63.716534312388198 ], [ -149.016550292218, 63.716442159328402 ], [ -149.017435349267004, 63.716362678689201 ], [ -149.018778055733009, 63.716236654119697 ], [ -149.02051769628099, 63.716075528272697 ], [ -149.021402477547014, 63.715999382891603 ], [ -149.022165469718004, 63.715931538067501 ], [ -149.023630175483987, 63.715793805648602 ], [ -149.024851110821004, 63.715679403773997 ], [ -149.025781534587992, 63.715614846779999 ], [ -149.026346228151994, 63.715611115433298 ], [ -149.026834741885011, 63.715651995134202 ], [ -149.027353634845014, 63.715758974643002 ], [ -149.02819258855601, 63.715973074857402 ], [ -149.028696333225014, 63.716079547957101 ], [ -149.029321737630994, 63.716137298884703 ], [ -149.029916950558004, 63.716133442700603 ], [ -149.030664639030988, 63.716052702580598 ], [ -149.031747981211993, 63.715912365599003 ], [ -149.032755071697011, 63.715773986270698 ], [ -149.033365543407996, 63.715648289251398 ], [ -149.033960526366997, 63.715488407554801 ], [ -149.035104754562013, 63.7152097736016 ], [ -149.035989905934002, 63.715095397212202 ], [ -149.036829209988014, 63.715037860962603 ], [ -149.037607262416003, 63.715056855806502 ], [ -149.038446410163999, 63.715118269026398 ], [ -149.039102651038007, 63.715209546455597 ], [ -149.039941841905005, 63.715366348754301 ], [ -149.040857226975987, 63.715545864919797 ], [ -149.041620384438005, 63.715697900543297 ], [ -149.042367879772002, 63.715839314226102 ], [ -149.043710055333008, 63.716097354694703 ], [ -149.044031311742998, 63.716159115314298 ], [ -149.044626521077987, 63.716269674995502 ], [ -149.045084261223991, 63.716338657875902 ], [ -149.045953984929014, 63.716422361089499 ], [ -149.046488011805991, 63.716453454871598 ], [ -149.047357520813989, 63.7164877615362 ], [ -149.048288301212011, 63.716518472974599 ], [ -149.050485608244998, 63.716590951773703 ], [ -149.051401234963009, 63.7166211439921 ], [ -149.052774446418994, 63.716651824656502 ], [ -149.053567769306994, 63.716663382653003 ], [ -149.054788662423988, 63.716663212004001 ], [ -149.05629928916801, 63.716651252245903 ], [ -149.05762692549601, 63.716643351467702 ], [ -149.058710167964989, 63.7166363719545 ], [ -149.059854497668994, 63.716632517031698 ], [ -149.060785338254988, 63.716644074240598 ], [ -149.061471974526, 63.716655446077702 ], [ -149.062479009315012, 63.716678477733197 ], [ -149.063257244099987, 63.716692854807 ], [ -149.064630404351988, 63.716720057978399 ], [ -149.06546985573101, 63.716738681357803 ], [ -149.066492177150991, 63.716757699324702 ], [ -149.067880690510009, 63.716784255242999 ], [ -149.068979392085993, 63.716808010755699 ], [ -149.07056619596699, 63.7168376896051 ], [ -149.071649672896001, 63.716857558756097 ], [ -149.073083935655006, 63.716887812743799 ], [ -149.073984151773999, 63.716856758023603 ], [ -149.074823374980014, 63.716723816228097 ], [ -149.075050490644003, 63.716668665215998 ], [ -149.075297747434007, 63.716605513861602 ], [ -149.07548122024599, 63.716537893648201 ], [ -149.075717199585995, 63.716445865505001 ], [ -149.076028706581013, 63.7163155821871 ], [ -149.076669588061009, 63.716002172611802 ], [ -149.077371613369991, 63.715659344443999 ], [ -149.078012415798014, 63.715353783789404 ], [ -149.078531149756003, 63.715109308862601 ], [ -149.079233120267986, 63.714796772644803 ], [ -149.079629584532, 63.7146447998078 ], [ -149.080178897141991, 63.714492225057903 ], [ -149.080896243219001, 63.714320467186397 ], [ -149.081552165191994, 63.714206172733498 ], [ -149.082101778737012, 63.714125426318802 ], [ -149.082818957727, 63.714079345705102 ], [ -149.083765015773992, 63.714026171480498 ], [ -149.084756786389988, 63.713965509761998 ], [ -149.086267180470998, 63.713878055771097 ], [ -149.087533792444987, 63.713805052057097 ], [ -149.088571402294008, 63.7137436216656 ], [ -149.089685178498996, 63.713682432223003 ], [ -149.091150146573, 63.713602421884097 ], [ -149.092752193965993, 63.713507801894302 ], [ -149.09356078641801, 63.713427627553997 ], [ -149.094812165659988, 63.713282243004002 ], [ -149.096444833026993, 63.713084217593703 ], [ -149.097772445100986, 63.712923345120998 ], [ -149.098870851131011, 63.712794253818501 ], [ -149.100183046317994, 63.712641834592802 ], [ -149.101754847434989, 63.7124541112128 ], [ -149.103204405809009, 63.712287073337002 ], [ -149.104867537741995, 63.712092198680402 ], [ -149.105919699400005, 63.711968542984202 ], [ -149.106332521088007, 63.711920023618198 ], [ -149.108224409906995, 63.711695540599699 ], [ -149.109826425859012, 63.711508721237202 ], [ -149.110925228945007, 63.711378435877101 ], [ -149.112054493902008, 63.711236791423602 ], [ -149.113061370588014, 63.711122574831201 ], [ -149.114389005118994, 63.710966050996298 ], [ -149.115792757498014, 63.7107985265012 ], [ -149.116891321632011, 63.710669314899597 ], [ -149.118096806843994, 63.710523373087803 ], [ -149.11969893778101, 63.710333090864602 ], [ -149.120858585556988, 63.710199104239003 ], [ -149.121743659673996, 63.710093215376403 ], [ -149.122552467721988, 63.7099971871055 ], [ -149.123299839986998, 63.7099249683409 ], [ -149.124124109836998, 63.709886665782498 ], [ -149.124810465833008, 63.709891011015003 ], [ -149.12555821359399, 63.709936623382198 ], [ -149.126260193988003, 63.7100054339029 ], [ -149.127236664499009, 63.710119064158498 ], [ -149.128381254715009, 63.7102527336599 ], [ -149.129785002602006, 63.710412759921802 ], [ -149.130883565836996, 63.710542670955398 ], [ -149.133157350044002, 63.710809443937599 ], [ -149.134622119590006, 63.710977013724502 ], [ -149.136041093920994, 63.711137473140802 ], [ -149.136681844246993, 63.711217714443599 ], [ -149.137338180342994, 63.711293968973301 ], [ -149.13749012588201, 63.711310998123601 ], [ -149.138253682195, 63.711396571815897 ], [ -149.139169074453008, 63.711484576946702 ], [ -149.139901505938013, 63.711538596217402 ], [ -149.140374610869003, 63.711572993981498 ], [ -149.141915749790996, 63.711690220903698 ], [ -149.143365237197003, 63.711801098820899 ], [ -149.144875981620999, 63.711908333189299 ], [ -149.146630677934013, 63.712038030079597 ], [ -149.148125939893987, 63.712152585125899 ], [ -149.148949963604991, 63.712217375994797 ], [ -149.150018280566002, 63.712296790299497 ], [ -149.151284652690009, 63.712388206526299 ], [ -149.152856199583994, 63.712506300947801 ], [ -149.15415330217499, 63.712602051368101 ], [ -149.155328187175996, 63.712693844556199 ], [ -149.156137061699013, 63.7127390303 ], [ -149.156884410608001, 63.712766514963398 ], [ -149.157662744206988, 63.712773675651803 ], [ -149.158578158923007, 63.712758321485097 ], [ -149.159432857407012, 63.712724172219502 ], [ -149.16018022518, 63.712670847054497 ], [ -149.161004370164989, 63.712598672110801 ], [ -149.162301431434003, 63.712483386442699 ], [ -149.163964565164008, 63.712331634319099 ], [ -149.165826001993992, 63.712167175755702 ], [ -149.167443593834008, 63.712021773590898 ], [ -149.169537146349995, 63.711837159284201 ], [ -149.17034271956399, 63.7117661133084 ], [ -149.172310935538007, 63.711587058150499 ], [ -149.173699494711002, 63.711461154745102 ], [ -149.175179392784003, 63.7113280765981 ], [ -149.17687329471201, 63.711179419602402 ], [ -149.178338005867005, 63.711045823307501 ], [ -149.179345359558994, 63.710953628502097 ], [ -149.180382708895991, 63.710862389863699 ], [ -149.181069464643002, 63.7108159943974 ], [ -149.181771285136989, 63.710801498160997 ], [ -149.182534333004014, 63.710804673925502 ], [ -149.183983638949996, 63.710824259656 ], [ -149.186043726527004, 63.710857812825097 ], [ -149.18827146039601, 63.710885493075502 ], [ -149.18947703813501, 63.710900576516899 ], [ -149.191384305214001, 63.7109347689629 ], [ -149.192986560117987, 63.710983853789998 ], [ -149.194695387552997, 63.711037456260897 ], [ -149.196144923469006, 63.711082739340299 ], [ -149.197899742850012, 63.711136655138397 ], [ -149.198662664952991, 63.711159941938 ], [ -149.200661583547003, 63.711223878486997 ], [ -149.201856943847986, 63.711263133302502 ], [ -149.201958537916994, 63.711266469352601 ], [ -149.203697884716007, 63.7113276767504 ], [ -149.205513838045988, 63.711376723895398 ], [ -149.207055133273997, 63.711425953969602 ], [ -149.208824921283991, 63.711483585091102 ], [ -149.210457639855008, 63.711536820588599 ], [ -149.212151370203998, 63.711589740884897 ], [ -149.213936655050986, 63.711647804538003 ], [ -149.216179690822997, 63.711723805272399 ], [ -149.217903863279986, 63.7117731417651 ], [ -149.219292377536988, 63.711815133037597 ], [ -149.220482569830011, 63.711864260499503 ], [ -149.221108424291998, 63.711898776427198 ], [ -149.221840678809002, 63.711968095403599 ], [ -149.222817175370011, 63.712077725774797 ], [ -149.223824222736994, 63.712192809398204 ], [ -149.225441896324014, 63.712375560670303 ], [ -149.226479236677989, 63.712493833775703 ], [ -149.227532160106989, 63.712608106101797 ], [ -149.228874964488995, 63.712765248246598 ], [ -149.230370471689014, 63.712936207154897 ], [ -149.231865812700988, 63.713108267824502 ], [ -149.233376199595995, 63.713279668242201 ], [ -149.233923033753001, 63.7133429869466 ], [ -149.234764820751991, 63.713440454747598 ], [ -149.235558405948012, 63.713527360293199 ], [ -149.236122909968003, 63.713595771419001 ], [ -149.236931479063003, 63.713692121654198 ], [ -149.237709807273006, 63.713798727855 ], [ -149.238854305860997, 63.7139966118133 ], [ -149.24015123867099, 63.714221761622802 ], [ -149.24131102029699, 63.714423476763102 ], [ -149.242119638800006, 63.714564681995597 ], [ -149.242699422263996, 63.714644771165403 ], [ -149.243370861735002, 63.714725518087299 ], [ -149.244026752265995, 63.714786695727199 ], [ -149.244713555624003, 63.714851093100101 ], [ -149.245278021914004, 63.714908246242402 ], [ -149.246193831888007, 63.715079751917997 ], [ -149.246636369844992, 63.715209337210801 ], [ -149.247261776046997, 63.7154075450606 ], [ -149.247963749255007, 63.715648568107603 ], [ -149.249337102644006, 63.716106072688497 ], [ -149.250115154172988, 63.716346125548199 ], [ -149.250603312173013, 63.716472653625203 ], [ -149.251122479119005, 63.71659791658 ], [ -149.252388720088987, 63.716888183077202 ], [ -149.253090934044991, 63.717043912416003 ], [ -149.254204584484995, 63.717292309790899 ], [ -149.254998022357995, 63.7174711100797 ], [ -149.256325567956992, 63.7177733770272 ], [ -149.256798521072, 63.717880327832397 ], [ -149.257759874733011, 63.718096955692502 ], [ -149.258888947450998, 63.718352535716299 ], [ -149.260353955050988, 63.718677058790803 ], [ -149.261940811034009, 63.719027851939401 ], [ -149.26326271251699, 63.7193346520719 ], [ -149.263451515033012, 63.719378469310698 ], [ -149.264580596733992, 63.719638491669301 ], [ -149.265526311624001, 63.719852329853701 ], [ -149.266060718489001, 63.720011678586999 ], [ -149.266793103261989, 63.720301812223198 ], [ -149.267144001381013, 63.7204923981108 ], [ -149.267479559869003, 63.720691475375403 ], [ -149.267937497644994, 63.720992026349997 ], [ -149.268502024122, 63.721369987111899 ], [ -149.269173325252012, 63.721824242161098 ], [ -149.269859994760992, 63.722270001311401 ], [ -149.270607720063992, 63.722762560899199 ], [ -149.271462244275, 63.723323557185601 ], [ -149.272255760300993, 63.723845600117798 ], [ -149.272820081063998, 63.724231390399297 ], [ -149.273567898893987, 63.724692519368801 ], [ -149.273903856234, 63.724860176761901 ], [ -149.274254570198991, 63.725001369682801 ], [ -149.274620859153998, 63.725130708322197 ], [ -149.275078520248996, 63.725260677460703 ], [ -149.275810861004004, 63.725444168298303 ], [ -149.276299451992003, 63.725561643166102 ], [ -149.276924802498996, 63.725711467691099 ], [ -149.27791686237299, 63.7259547276511 ], [ -149.279000009620006, 63.726222164179802 ], [ -149.279686610856004, 63.726386244422898 ], [ -149.280144402206986, 63.726511713211899 ], [ -149.280907396174996, 63.726828537828197 ], [ -149.281273614163013, 63.727068937520798 ], [ -149.281487443743998, 63.727259666697499 ], [ -149.281655154715992, 63.727488217691999 ], [ -149.281777394764987, 63.727778171669598 ], [ -149.281823023790992, 63.728072451596702 ], [ -149.281853663529006, 63.728445924087701 ], [ -149.281853402118998, 63.728701735478403 ], [ -149.281945216228991, 63.7290681540291 ], [ -149.282128276713991, 63.729426217752703 ], [ -149.282326647187006, 63.729705099775799 ], [ -149.282581318671987, 63.730019742002497 ], [ -149.28261645357901, 63.730063150266403 ], [ -149.282830196920997, 63.730364954679899 ], [ -149.282967484649987, 63.730784413408301 ], [ -149.282921557381997, 63.730998398740198 ], [ -149.282830337057987, 63.731280526591298 ], [ -149.282738664882004, 63.731642303464497 ], [ -149.282891370395987, 63.731936580953899 ], [ -149.283242171496994, 63.732233713074599 ], [ -149.283806708754014, 63.732478088155098 ], [ -149.284325668189013, 63.732611072016702 ], [ -149.284859718422013, 63.732683939353997 ], [ -149.28545491428099, 63.732759845430103 ], [ -149.285624988720997, 63.732792891549501 ], [ -149.285818174117992, 63.732836005738299 ], [ -149.285994845785012, 63.732881452319099 ], [ -149.286147893556006, 63.7329332807724 ], [ -149.286324371186993, 63.733004804343203 ], [ -149.286645105676001, 63.733183172588198 ], [ -149.286980513246988, 63.733477566822998 ], [ -149.287270540625002, 63.733763805579898 ], [ -149.287636983191987, 63.734114151281602 ], [ -149.288033668442012, 63.734438515430497 ], [ -149.288399633105001, 63.7346755207274 ], [ -149.28882694821101, 63.734938011061402 ], [ -149.289315352350002, 63.735231588005703 ], [ -149.289925798008994, 63.735594067228199 ], [ -149.291024487008997, 63.736269182985701 ], [ -149.291573705296003, 63.736593830477197 ], [ -149.292001011418989, 63.736983098698801 ], [ -149.292031553240008, 63.737196116129198 ], [ -149.291985588242994, 63.737456105898197 ], [ -149.291817682337012, 63.737765007637499 ], [ -149.291756655287998, 63.738002084421197 ], [ -149.291776537700002, 63.738083492480101 ], [ -149.291807594255999, 63.738171391170198 ], [ -149.291854485415996, 63.7382612110043 ], [ -149.291908483148006, 63.738346979054398 ], [ -149.291985795753988, 63.738432265896797 ], [ -149.292321303037994, 63.738612204907703 ], [ -149.292435110602014, 63.738645634109602 ], [ -149.292584512111006, 63.738680241782099 ], [ -149.292758016318999, 63.738725579203802 ], [ -149.292940909717004, 63.738752686069503 ], [ -149.293178642568989, 63.738780085448902 ], [ -149.295157039150013, 63.738965447312303 ], [ -149.295304885675989, 63.738969245136403 ], [ -149.295488903765005, 63.738969308334099 ], [ -149.295654786666006, 63.738961678105497 ], [ -149.295828231584011, 63.738947160116197 ], [ -149.295982632218994, 63.738930620982799 ], [ -149.296382495708002, 63.738873317228801 ], [ -149.297905043095994, 63.738620311802798 ], [ -149.298958227935003, 63.738455202317603 ], [ -149.299154383163, 63.738439965826799 ], [ -149.299420981579004, 63.738428359091699 ], [ -149.299646299713999, 63.738432560029999 ], [ -149.299915225666012, 63.738446674844297 ], [ -149.300133230614989, 63.738476296812699 ], [ -149.300413689138992, 63.738539221282998 ], [ -149.300847504453998, 63.7386724918358 ], [ -149.301028607510005, 63.738730882291001 ], [ -149.301149564765012, 63.738761740499299 ], [ -149.301302645774001, 63.738793604278698 ], [ -149.301495184384009, 63.738821001233603 ], [ -149.301679883395991, 63.738816803532799 ], [ -149.301825552406001, 63.738794284751201 ], [ -149.302016877391992, 63.738768918855499 ], [ -149.302258867359996, 63.738709512536801 ], [ -149.302525363369, 63.738618097868603 ], [ -149.302945236830993, 63.738436004568399 ], [ -149.303336876243009, 63.738248752793801 ], [ -149.30350423956699, 63.738151387136298 ], [ -149.30371515321599, 63.738024032253101 ], [ -149.303948726867986, 63.737856061762599 ], [ -149.304428429924997, 63.737482038601101 ], [ -149.304863660086994, 63.737143673409101 ], [ -149.305142390251007, 63.736955737725097 ], [ -149.305766667271996, 63.7366261295806 ], [ -149.306418190193995, 63.736267446274198 ], [ -149.306982602586004, 63.735968737473698 ], [ -149.307247350473006, 63.735807437781801 ], [ -149.307474036742008, 63.735662047763803 ], [ -149.308371512999003, 63.735037446170999 ], [ -149.309144097380994, 63.734527214157701 ], [ -149.309425108368998, 63.734364993502503 ], [ -149.309842347071992, 63.734178528521298 ], [ -149.310310486116009, 63.733976551099303 ], [ -149.31072242745401, 63.733782793419003 ], [ -149.310937883883014, 63.733666973484603 ], [ -149.311198243500996, 63.7335126562878 ], [ -149.311362763657002, 63.733392394633697 ], [ -149.311836103047995, 63.733016731347803 ], [ -149.312279940867001, 63.732704268483502 ], [ -149.312545799969996, 63.732555821174401 ], [ -149.313447915127995, 63.7320823888886 ], [ -149.314918953117996, 63.731276223605398 ], [ -149.315864904264998, 63.730855813597302 ], [ -149.316170092509992, 63.730753133401301 ], [ -149.316826208517995, 63.730527879750902 ], [ -149.318382601731997, 63.730135465152301 ], [ -149.319055955512994, 63.729978204362098 ], [ -149.319432499635013, 63.729914334833097 ], [ -149.319893815076995, 63.729855090416898 ], [ -149.32030853310701, 63.7298181412189 ], [ -149.321057366931001, 63.729777353154198 ], [ -149.321886483192998, 63.729739061558497 ], [ -149.322571904940986, 63.729724788525601 ], [ -149.322818114296012, 63.729732457031297 ], [ -149.323463492742007, 63.729766806042797 ], [ -149.324135027434011, 63.729805318268198 ], [ -149.325366386821997, 63.729875926529097 ], [ -149.326283991629992, 63.729923487119301 ], [ -149.326922139536009, 63.7299694703649 ], [ -149.327543476371005, 63.730019677591997 ], [ -149.328094100521014, 63.730074806954498 ], [ -149.328783589841009, 63.7301698772892 ], [ -149.329485748101007, 63.730286712684297 ], [ -149.330070394145991, 63.730387129501203 ], [ -149.330475859529002, 63.730442778989897 ], [ -149.330752269344998, 63.730440091681103 ], [ -149.331122275528998, 63.7304135974831 ], [ -149.331424206483007, 63.730375486459799 ], [ -149.331658059511, 63.730325758962003 ], [ -149.33211526246501, 63.730169083295003 ], [ -149.332130435009987, 63.730169554840899 ], [ -149.332561076577008, 63.730049709563801 ], [ -149.332836281753004, 63.729987149480202 ], [ -149.33309613831301, 63.729942978509101 ], [ -149.333389316980998, 63.7299259661363 ], [ -149.333599573062997, 63.729922999267799 ], [ -149.333850386284013, 63.7299355430522 ], [ -149.334041195637013, 63.729953345841203 ], [ -149.334372375735995, 63.7300016342992 ], [ -149.334806548581014, 63.730112492161901 ], [ -149.336458916900995, 63.7306126649692 ], [ -149.337811043997988, 63.731039377075597 ], [ -149.338305714784013, 63.731175851293898 ], [ -149.33854901449601, 63.7312356511434 ], [ -149.338846221208996, 63.731294747551502 ], [ -149.339227482385013, 63.731332703871097 ], [ -149.33958001633701, 63.731348394249501 ], [ -149.341346652157995, 63.731320722483197 ], [ -149.342460470584001, 63.731298045855901 ], [ -149.343910058602006, 63.731263330546902 ], [ -149.344337241655012, 63.731259742801598 ], [ -149.344855935189003, 63.73126796591 ], [ -149.345542876885986, 63.731312815464101 ], [ -149.348121366941996, 63.7315800605896 ], [ -149.34853335319599, 63.731614136212002 ], [ -149.348869138059001, 63.731637997750603 ], [ -149.349128518512998, 63.731644907566299 ], [ -149.349540387985996, 63.731621758086902 ], [ -149.349815306598003, 63.731598854686602 ], [ -149.350211971187008, 63.731549427918097 ], [ -149.350532415520007, 63.7314998845739 ], [ -149.350822292879002, 63.731434809851301 ], [ -149.351051096476994, 63.731362233899503 ], [ -149.351249377117995, 63.731289835478698 ], [ -149.351401786187012, 63.731218260258103 ], [ -149.35158501645401, 63.731110615998404 ], [ -149.351813955697992, 63.730947166692602 ], [ -149.352760075728014, 63.730218014689797 ], [ -149.353171927234996, 63.729954762080098 ], [ -149.353216542962002, 63.729927213000302 ], [ -149.353431470282999, 63.729794501197603 ], [ -149.353980633773006, 63.729508568571099 ], [ -149.356300047904, 63.728299055638601 ], [ -149.356513525344013, 63.728158683965098 ], [ -149.357093246825002, 63.728006073925798 ], [ -149.357367825874007, 63.727945002799999 ], [ -149.35768821900399, 63.727895444393198 ], [ -149.358008838507999, 63.727860477583697 ], [ -149.35825280476999, 63.727842213423699 ], [ -149.358542862690001, 63.727837714680199 ], [ -149.358863492076011, 63.727848746024399 ], [ -149.359565054754, 63.7278951068091 ], [ -149.359870170235013, 63.728009994497498 ], [ -149.360129788742, 63.728085331000301 ], [ -149.362998390617008, 63.729032194645796 ], [ -149.364142871237988, 63.729390637741801 ], [ -149.366690884151012, 63.7302332882144 ], [ -149.367133470617006, 63.730366985573497 ], [ -149.36753015407001, 63.730465608579799 ], [ -149.367865908390996, 63.730519718451099 ], [ -149.368201501913006, 63.730526701696299 ], [ -149.368399890352009, 63.730511503076798 ], [ -149.368888186692004, 63.730454757171501 ], [ -149.369223967962, 63.730297944254801 ], [ -149.369346037331013, 63.730202980110398 ], [ -149.369468152514003, 63.730057529465199 ], [ -149.369559410568002, 63.729894299907897 ], [ -149.37044465177101, 63.7275128445728 ], [ -149.370535864010009, 63.727151035149497 ], [ -149.370520640260992, 63.726934037617397 ], [ -149.370474789349998, 63.726800238535901 ], [ -149.370429069593996, 63.726715808115998 ], [ -149.369681392800004, 63.725999418220198 ], [ -149.369406704156006, 63.7256599850854 ], [ -149.369315072403992, 63.725446240901903 ], [ -149.369299801044008, 63.725327969833899 ], [ -149.369315177505996, 63.725220740582401 ], [ -149.369345592665013, 63.725102755685498 ], [ -149.369436052115987, 63.724941696629003 ], [ -149.369467613524989, 63.724885502247403 ], [ -149.369742526748013, 63.724591063893797 ], [ -149.369879943834007, 63.724465160278697 ], [ -149.370413730861003, 63.724041829466202 ], [ -149.370642768918998, 63.723824509420297 ], [ -149.371039542202993, 63.7235304604934 ], [ -149.371329241696003, 63.723363251766102 ], [ -149.371649816284986, 63.723221675645703 ], [ -149.37206156807801, 63.723091884849502 ], [ -149.372580586802002, 63.722966519801098 ], [ -149.373953738968993, 63.722707037878202 ], [ -149.374991263477, 63.7224854477967 ], [ -149.377676821935012, 63.721855735274197 ], [ -149.377936121539989, 63.721814352681598 ], [ -149.378149657371011, 63.721787267755502 ], [ -149.378317861518013, 63.721767762392901 ], [ -149.378500554592989, 63.721761044247103 ], [ -149.378714287154992, 63.721760889934998 ], [ -149.378897535388006, 63.721768772182699 ], [ -149.379111155661008, 63.7217753455596 ], [ -149.379309493794011, 63.7217982768016 ], [ -149.37947724608901, 63.721825875559503 ], [ -149.379721606711001, 63.721867050530498 ], [ -149.379904480345999, 63.721917552527003 ], [ -149.380102937056989, 63.721981995714799 ], [ -149.380316483667997, 63.722061488011803 ], [ -149.380515034702, 63.722149492989402 ], [ -149.380667709672991, 63.722210283918002 ], [ -149.380804857263996, 63.722282938240497 ], [ -149.381583008505999, 63.722680459679601 ], [ -149.381949156426003, 63.722855514617997 ], [ -149.382071290472993, 63.722908633675601 ], [ -149.382208849492997, 63.7229465197235 ], [ -149.382315338481988, 63.722969988494803 ], [ -149.382467899365992, 63.722989263558901 ], [ -149.382605260756009, 63.723000217653002 ], [ -149.382712287836, 63.7230001424888 ], [ -149.382895094996002, 63.722996787937099 ], [ -149.383078540859003, 63.722973258340701 ], [ -149.383230949927992, 63.722943164370001 ], [ -149.383383477574995, 63.722886149946099 ], [ -149.38350566462401, 63.722828202013098 ], [ -149.383612654871996, 63.722751836184599 ], [ -149.383658335103007, 63.722683683823597 ], [ -149.383673488782989, 63.722557375609 ], [ -149.383688751160008, 63.7224243400929 ], [ -149.383703853637002, 63.722340662985602 ], [ -149.383749782699994, 63.722256811038399 ], [ -149.383810878020995, 63.722183522705798 ], [ -149.384024297070994, 63.722016189886098 ], [ -149.384528054316007, 63.7216951063496 ], [ -149.385229832589005, 63.721199483632198 ], [ -149.386206438746001, 63.720509241952797 ], [ -149.386709874394001, 63.720165705933503 ], [ -149.386923285358989, 63.720036514027498 ], [ -149.387106486879986, 63.719947903484602 ], [ -149.387442191793014, 63.719792177002901 ], [ -149.387778091640996, 63.7196734781892 ], [ -149.388754448064986, 63.719369141785897 ], [ -149.389532543611011, 63.719105833135899 ], [ -149.389899025705006, 63.718921877576797 ], [ -149.390005683576987, 63.718784917035798 ], [ -149.390036035853001, 63.718705074656299 ], [ -149.390081744830013, 63.718563999466603 ], [ -149.390020834561994, 63.718079722992698 ], [ -149.390066791473998, 63.717773739791497 ], [ -149.390127716114989, 63.717560210477998 ], [ -149.390280250050012, 63.717270962416102 ], [ -149.390387116330999, 63.717110449466396 ], [ -149.390509031189993, 63.717007613953001 ], [ -149.390631152661001, 63.716911516060399 ], [ -149.390768574237995, 63.716847299593198 ], [ -149.390982212478008, 63.716770839256696 ], [ -149.391180541627989, 63.716712980231797 ], [ -149.39142450519401, 63.716667739972003 ], [ -149.391653370775998, 63.716637742319598 ], [ -149.391821323394993, 63.716621581554399 ], [ -149.391958658734012, 63.7166224308232 ], [ -149.392263803859009, 63.716626185505802 ], [ -149.392798013992007, 63.716667258654098 ], [ -149.393194711818012, 63.716728792487203 ], [ -149.393911685093997, 63.716816978337199 ], [ -149.395544453972008, 63.717075722708103 ], [ -149.396032685633998, 63.717166980299098 ], [ -149.396460079791012, 63.717277686401303 ], [ -149.396871889077005, 63.717414838407002 ], [ -149.397039667423002, 63.717480562732902 ], [ -149.397604521785013, 63.717746931025701 ], [ -149.397863621065994, 63.7178659366445 ], [ -149.398153654731999, 63.717967940096301 ], [ -149.398443546463994, 63.7180486230423 ], [ -149.398779150765989, 63.718117243997 ], [ -149.39905391127499, 63.718154830980097 ], [ -149.399450673779995, 63.718193912304699 ], [ -149.401129223498998, 63.718311519109598 ], [ -149.40262456271401, 63.718471737269198 ], [ -149.403723081933009, 63.718627647224601 ], [ -149.404821627202011, 63.718834033592501 ], [ -149.405187865852014, 63.718895724200998 ], [ -149.405615161194987, 63.718944697374802 ], [ -149.406271121794987, 63.718987202640101 ], [ -149.406622259764987, 63.719013649471201 ], [ -149.406881619556998, 63.719036166905099 ], [ -149.407232624576011, 63.7190816802119 ], [ -149.407370052441991, 63.7191083206584 ], [ -149.408056601575993, 63.7192493537571 ], [ -149.408728057215995, 63.7193753394534 ], [ -149.409017845642012, 63.719444778930203 ], [ -149.409292431877986, 63.719505900627198 ], [ -149.409613202299994, 63.719596479389502 ], [ -149.409811217039987, 63.719661990231401 ], [ -149.410024797787003, 63.719753780009903 ], [ -149.410208108901998, 63.719830059667402 ], [ -149.410314767671991, 63.719895021090103 ], [ -149.410498032074997, 63.720016172609398 ], [ -149.410665778081011, 63.720139093926299 ], [ -149.410864041654008, 63.720344842841897 ], [ -149.411108403175007, 63.7206798903878 ], [ -149.411352573354009, 63.721111412461603 ], [ -149.411794883137986, 63.721737457943199 ], [ -149.411825591147988, 63.721912284068303 ], [ -149.411810131142005, 63.721962294415903 ], [ -149.411734064499001, 63.722141711069803 ], [ -149.41152030229199, 63.722362916878403 ], [ -149.411352519454994, 63.722481194776101 ], [ -149.411078108390001, 63.722625382716302 ], [ -149.41026929405399, 63.7229192748147 ], [ -149.409979130132996, 63.7230382988459 ], [ -149.409796206191004, 63.723163965822103 ], [ -149.409628319149988, 63.723309163994102 ], [ -149.409506196780001, 63.723480440589697 ], [ -149.40945394447499, 63.7235803685588 ], [ -149.409292558541011, 63.723888998372097 ], [ -149.40915548101799, 63.724086744167302 ], [ -149.408911417739006, 63.724395647623503 ], [ -149.408163564874997, 63.725227644808101 ], [ -149.408072062479988, 63.725349373960597 ], [ -149.408026362486993, 63.7254949410775 ], [ -149.408056989648003, 63.725601332220101 ], [ -149.408102462367992, 63.725677886798799 ], [ -149.408178766166003, 63.7257542626228 ], [ -149.408285721379997, 63.7258113826095 ], [ -149.408407744036992, 63.725875693256903 ], [ -149.408575773013013, 63.725940288079897 ], [ -149.408774107553, 63.725997956053199 ], [ -149.409048859079007, 63.726062447605401 ], [ -149.410116862526991, 63.726291412284603 ], [ -149.410482972718, 63.726451807142801 ], [ -149.410620398785994, 63.726543511269497 ], [ -149.410727176134003, 63.726654472555097 ], [ -149.410772818635991, 63.726772540846397 ], [ -149.410757607463012, 63.726910065144601 ], [ -149.410742386408998, 63.727027395148703 ], [ -149.410589761744006, 63.727478207324403 ], [ -149.410559192973011, 63.7276691126741 ], [ -149.410578204918011, 63.727718099290897 ], [ -149.410590722941009, 63.727775474166997 ], [ -149.41062502241499, 63.727831139530899 ], [ -149.410697158928997, 63.727885587653198 ], [ -149.410770409354001, 63.727932945223301 ], [ -149.410910403705998, 63.727989476700301 ], [ -149.411108692432009, 63.728061724521403 ], [ -149.411368007308994, 63.728103301557901 ], [ -149.411688422895992, 63.728129916411802 ], [ -149.411841053849002, 63.728126725891201 ], [ -149.41205464447799, 63.728107447170501 ], [ -149.412253019442005, 63.728069752929301 ], [ -149.412665017373996, 63.727947711817599 ], [ -149.413000644134002, 63.727794169795303 ], [ -149.413229551038, 63.727660927089097 ], [ -149.413412697761004, 63.727531897049303 ], [ -149.413748425132013, 63.727203346496601 ], [ -149.413901093815014, 63.727092456155397 ], [ -149.414129753682005, 63.726974911696402 ], [ -149.414358815095994, 63.726883180338298 ], [ -149.414969010125986, 63.726669584175497 ], [ -149.41524352719199, 63.726551193362397 ], [ -149.415487692879992, 63.7264217797008 ], [ -149.416510053825988, 63.725849423036202 ], [ -149.416861040879013, 63.725627910060297 ], [ -149.417074804882986, 63.725532343687497 ], [ -149.418295282078986, 63.725124202930303 ], [ -149.418356440281997, 63.725104753553097 ], [ -149.41872253699799, 63.724971201915402 ], [ -149.419805986079012, 63.724525214910699 ], [ -149.420110954236009, 63.724418964871703 ], [ -149.421499446035, 63.724018167913897 ], [ -149.421804759145004, 63.723877147849201 ], [ -149.422354096009997, 63.723590993537698 ], [ -149.422659085726991, 63.723449962196597 ], [ -149.422857645743989, 63.723396555831201 ], [ -149.423238924885993, 63.723324036004101 ], [ -149.423925816278, 63.723228294817098 ], [ -149.424429094721006, 63.723137053593497 ], [ -149.424825888666987, 63.723030226456501 ], [ -149.425238154297006, 63.722838609336897 ], [ -149.425741386027994, 63.722534213122799 ], [ -149.425924585752, 63.722438827592399 ], [ -149.426305958319006, 63.722304603576603 ], [ -149.426445751448995, 63.722263901715699 ], [ -149.42667221942699, 63.722197964194699 ], [ -149.426962153380003, 63.722132750743697 ], [ -149.427450593450999, 63.722048901759599 ], [ -149.427755616405989, 63.722011070586397 ], [ -149.428426922027995, 63.721961953181598 ], [ -149.428808485936003, 63.7219544961387 ], [ -149.429098313888005, 63.721961073449499 ], [ -149.429327304335004, 63.721977016800103 ], [ -149.429601824096011, 63.7220145393972 ], [ -149.429876485790999, 63.722053186661803 ], [ -149.430120471815002, 63.722103240507998 ], [ -149.430303791914014, 63.722129011904599 ], [ -149.430959791140992, 63.722263397028399 ], [ -149.432394073663005, 63.722560558008503 ], [ -149.433309877348989, 63.722735366320798 ], [ -149.433874383166, 63.722857982323802 ], [ -149.4345915918, 63.723025622751699 ], [ -149.434988069539003, 63.723136395014897 ], [ -149.436788806305998, 63.723704913247701 ], [ -149.438146922471986, 63.724108518279003 ], [ -149.439443867859012, 63.724536055471098 ], [ -149.439779509890002, 63.724658429440801 ], [ -149.440054251535003, 63.724772221972202 ], [ -149.440435675305991, 63.724955439600002 ], [ -149.440801806157992, 63.725169603448599 ], [ -149.441259660389989, 63.725494245571497 ], [ -149.441549568292004, 63.725665708560797 ], [ -149.441793651333995, 63.725768471251101 ], [ -149.441946311932014, 63.725817976520403 ], [ -149.442327527293997, 63.725894609645799 ], [ -149.442739654583988, 63.7259317942111 ], [ -149.443502705145988, 63.725962795626998 ], [ -149.443823285124012, 63.726000565844302 ], [ -149.443990964655001, 63.726039306281002 ], [ -149.444204445688996, 63.7261041158594 ], [ -149.444631725761013, 63.726256180646402 ], [ -149.444860699140008, 63.726343895812299 ], [ -149.445013370518012, 63.726393398086202 ], [ -149.445181164134993, 63.726435506046798 ], [ -149.445348910141007, 63.726469760446598 ], [ -149.445516751369013, 63.726497285456901 ], [ -149.445761021261006, 63.726531615731901 ], [ -149.446722316531009, 63.726633676219599 ], [ -149.446951037484013, 63.7266720201347 ], [ -149.447179968643013, 63.726729440873498 ], [ -149.447927593333986, 63.726961878696201 ], [ -149.448431256255986, 63.727115125021299 ], [ -149.450445329428987, 63.727762847910903 ], [ -149.450918347222995, 63.727927496965599 ], [ -149.452749367096999, 63.728590957175399 ], [ -149.453161387487, 63.728708879411002 ], [ -149.453344379700013, 63.728751437999001 ], [ -149.453573442910994, 63.728789780633598 ], [ -149.453863383151997, 63.728816504582497 ], [ -149.454049999169996, 63.728818721670002 ], [ -149.454107480568013, 63.728819404768203 ], [ -149.454412865543986, 63.728803965073098 ], [ -149.454626259441, 63.728785742476497 ], [ -149.454885684809994, 63.728743109984002 ], [ -149.455328135629998, 63.7286364630639 ], [ -149.457098314407006, 63.7280640363023 ], [ -149.459081590636998, 63.727454283426198 ], [ -149.461233053944994, 63.726771063211402 ], [ -149.465719101236004, 63.725378658915297 ], [ -149.466985626073011, 63.724951342438402 ], [ -149.467687633417, 63.7246730084535 ], [ -149.468664114706996, 63.7242604844336 ], [ -149.469213275501005, 63.7240134311471 ], [ -149.469945645003008, 63.7237191769905 ], [ -149.470479785966006, 63.723554677624001 ], [ -149.471193262999009, 63.723399176599898 ], [ -149.471212263264988, 63.723395036262502 ], [ -149.473928232389994, 63.723032678636898 ], [ -149.475103177578006, 63.722884108175201 ], [ -149.475530290563, 63.722826302613498 ], [ -149.475942461870005, 63.722750097847502 ], [ -149.476140720951008, 63.722699980718602 ], [ -149.476430551598014, 63.722597654292798 ], [ -149.476613788153003, 63.722486508068997 ], [ -149.476735908725999, 63.722394834933901 ], [ -149.476964472474009, 63.721846438792099 ], [ -149.477254305814995, 63.721339149692199 ], [ -149.477666522037993, 63.720460873252499 ], [ -149.477834983103008, 63.720134008492103 ], [ -149.477864642778997, 63.720076461009498 ], [ -149.478078445410006, 63.719713835356501 ], [ -149.478200380929991, 63.719549241502499 ], [ -149.478383628263998, 63.719324795132799 ], [ -149.478704111224999, 63.719011373941299 ], [ -149.479558422535007, 63.718226052241498 ], [ -149.479741535122997, 63.718035254989303 ], [ -149.479817865871013, 63.717913035737197 ], [ -149.479878797698007, 63.717783623125797 ], [ -149.479924704304011, 63.717642540159602 ], [ -149.479970414179007, 63.716924862766298 ], [ -149.480000723337014, 63.716681230392602 ], [ -149.480046627247987, 63.716540147498797 ], [ -149.480123066691988, 63.7163719395813 ], [ -149.48022986919301, 63.716227080520802 ], [ -149.480611166301003, 63.715788728980499 ], [ -149.480717992157992, 63.715604609841101 ], [ -149.480779058732992, 63.715463983823298 ], [ -149.480870708451988, 63.714983261605298 ], [ -149.480931516312012, 63.714899837374297 ], [ -149.481038309828989, 63.714804336198299 ], [ -149.481114657645008, 63.7147539110114 ], [ -149.481313224849004, 63.714662292779302 ], [ -149.481770849111996, 63.714556035530997 ], [ -149.482197970182, 63.714486998180398 ], [ -149.483022192421998, 63.714372697239398 ], [ -149.483327146205994, 63.714315686627202 ], [ -149.483540759292993, 63.714258171467897 ], [ -149.483861242252999, 63.714147782946 ], [ -149.484089953324997, 63.714033512062699 ], [ -149.484273192574989, 63.71391562929 ], [ -149.485432691231011, 63.713080012491098 ], [ -149.486195789404007, 63.712507303509199 ], [ -149.487004266870997, 63.711817049090598 ], [ -149.487614593055014, 63.711248717662698 ], [ -149.487889278105996, 63.711031501452503 ], [ -149.488163913748991, 63.7108557872943 ], [ -149.488469303216988, 63.7106720231846 ], [ -149.489170934165998, 63.710291519536497 ], [ -149.489323641476005, 63.710210854657099 ], [ -149.490147630154013, 63.7097611097225 ], [ -149.490788569126011, 63.709391116313803 ], [ -149.491078291974986, 63.7092573564017 ], [ -149.491322569950995, 63.709169343947899 ], [ -149.491566456263001, 63.709112728700802 ], [ -149.491978703927003, 63.709024151986 ], [ -149.492726512773004, 63.7089018997805 ], [ -149.493992940592989, 63.7086617244846 ], [ -149.494228089889987, 63.708619284481202 ], [ -149.494435246784008, 63.708581895319 ], [ -149.49493896719801, 63.708531952039998 ], [ -149.49538116289699, 63.7085250294151 ], [ -149.495930519523995, 63.7085931120331 ], [ -149.496510382937998, 63.708673325932203 ], [ -149.498066717760992, 63.708925282321303 ], [ -149.499806400529991, 63.709188327611002 ], [ -149.502415576137992, 63.709524515110999 ], [ -149.503956786026009, 63.709714262845402 ], [ -149.504444766159992, 63.709764771813603 ], [ -149.504963920529008, 63.709798265761002 ], [ -149.505604603481004, 63.709817447544303 ], [ -149.507222010269004, 63.709847913568801 ], [ -149.509709350068988, 63.709901020047099 ], [ -149.509953371128006, 63.709924022982499 ], [ -149.51028897183599, 63.709966589544202 ], [ -149.510899396834986, 63.710073460838601 ], [ -149.511296104541998, 63.710160477783603 ], [ -149.512348974073007, 63.710484724396302 ], [ -149.513188148770013, 63.710774533191803 ], [ -149.513447522037012, 63.710877631269703 ], [ -149.513813633126006, 63.7110422473204 ], [ -149.515446331036003, 63.711831362193202 ], [ -149.516011033583993, 63.712056868991297 ], [ -149.516361814024009, 63.712155961651497 ], [ -149.516926449197001, 63.7122928468618 ], [ -149.517552113215999, 63.712400143022002 ], [ -149.51839144242399, 63.712507084696199 ], [ -149.520878558544013, 63.712739466728898 ], [ -149.522282491483992, 63.712880055362803 ], [ -149.523060698421006, 63.712944765794802 ], [ -149.524021778095999, 63.713063157462997 ], [ -149.524177038418003, 63.7130916837379 ], [ -149.524998295318994, 63.713242575652799 ], [ -149.525410273488006, 63.713342347633699 ], [ -149.526279945988989, 63.713566805655702 ], [ -149.526508992131994, 63.713646541595402 ], [ -149.526798959323003, 63.713761742960699 ], [ -149.527043010026006, 63.713899132003903 ], [ -149.527195584384998, 63.714005753337801 ], [ -149.527454853448006, 63.714280443255198 ], [ -149.527760136913997, 63.714623806079601 ], [ -149.527882263775012, 63.714726154186501 ], [ -149.528065494042011, 63.714848268657001 ], [ -149.528339821563009, 63.714978705123499 ], [ -149.528553787687997, 63.715065840252997 ], [ -149.529011296069001, 63.7151961221644 ], [ -149.529698143442999, 63.715325377544097 ], [ -149.53101044373301, 63.715534940956502 ], [ -149.533696003986989, 63.715862743942701 ], [ -149.534809551122009, 63.7160125187999 ], [ -149.535313196076999, 63.716061145714001 ], [ -149.535694555170011, 63.716076971063003 ], [ -149.536076013077007, 63.716069242766103 ], [ -149.536457519493013, 63.716042445910396 ], [ -149.536991797898992, 63.715977564349899 ], [ -149.537296784921011, 63.715923814106503 ], [ -149.537556046796993, 63.715859730648098 ], [ -149.537830939358003, 63.715782650263897 ], [ -149.538151185163997, 63.715676631922797 ], [ -149.540211154162989, 63.714856176301303 ], [ -149.541034962279014, 63.714509362478303 ], [ -149.542148948689999, 63.714070206989 ], [ -149.543430473596004, 63.713551891916097 ], [ -149.543628882695998, 63.713441124691101 ], [ -149.543735860368002, 63.713368025166503 ], [ -149.543888445507008, 63.713226734396699 ], [ -149.544025538301014, 63.713055819016098 ], [ -149.544193768500008, 63.7127803903619 ], [ -149.544284964568988, 63.712571097372397 ], [ -149.544407161499009, 63.712433391166698 ], [ -149.544651193336989, 63.712281352724503 ], [ -149.545032802160989, 63.712105355499098 ], [ -149.545492233835006, 63.711920144166797 ], [ -149.545582237839994, 63.711883860217199 ], [ -149.546176970169, 63.711667071402097 ], [ -149.546619680601992, 63.711479423117098 ], [ -149.547031763874003, 63.711288620555997 ], [ -149.547565690140004, 63.710991506688202 ], [ -149.548114946156005, 63.710647734947798 ], [ -149.548313353459008, 63.710503313285898 ], [ -149.548572733913005, 63.710285545871201 ], [ -149.549000139747989, 63.709880953438102 ], [ -149.549213638748995, 63.709637149010902 ], [ -149.549366021767014, 63.709404992571301 ], [ -149.549640860430003, 63.708809677301197 ], [ -149.550037472018005, 63.708127116091902 ], [ -149.550312214560989, 63.707477958319501 ], [ -149.550601859256005, 63.706929070887497 ], [ -149.550937556983001, 63.706417442719399 ], [ -149.551334501845986, 63.705909872991803 ], [ -149.552494047214992, 63.704364921959098 ], [ -149.552753413294994, 63.704048444670697 ], [ -149.553073797440987, 63.703758451200002 ], [ -149.553958654165996, 63.703037634657903 ], [ -149.554263886428004, 63.7028055180145 ], [ -149.55461482137801, 63.702583727483002 ], [ -149.555713560684012, 63.7019959865695 ], [ -149.555911835036994, 63.701870623160097 ], [ -149.556140604499006, 63.701713633452897 ], [ -149.556613706733998, 63.701359735786802 ], [ -149.557086681409999, 63.700939655192798 ], [ -149.55710176412299, 63.700932250717699 ], [ -149.557880100418004, 63.700245279818297 ], [ -149.558536313444989, 63.699650032616802 ], [ -149.558871654540013, 63.699292053258503 ], [ -149.559146578542993, 63.698909852662602 ], [ -149.559268638929012, 63.698757555295401 ], [ -149.559436469377005, 63.698608853773301 ], [ -149.559665025040005, 63.698452976811701 ], [ -149.560504667759005, 63.697986534518698 ], [ -149.560885882223005, 63.697727493406298 ], [ -149.561271893691014, 63.697401411714701 ], [ -149.562045574915999, 63.696747821554602 ], [ -149.562640614467995, 63.696220297141302 ], [ -149.563098315986991, 63.695889484883502 ], [ -149.563327441181997, 63.695735864384403 ], [ -149.563800234397007, 63.695458213879697 ], [ -149.564227562079992, 63.6952252062894 ], [ -149.565066648742004, 63.694782283002901 ], [ -149.565875294194996, 63.694332847881199 ], [ -149.566455095625003, 63.693993298328699 ], [ -149.568392767082997, 63.692604746852098 ], [ -149.568728436062997, 63.692402671568999 ], [ -149.569369364256005, 63.6920548237619 ], [ -149.570391761134999, 63.6914681132588 ], [ -149.570849566857987, 63.691158597454198 ], [ -149.571322671789005, 63.690833830457201 ], [ -149.572360084009006, 63.690155578261397 ], [ -149.572848365976, 63.689858174484598 ], [ -149.573123077078009, 63.689666630925998 ], [ -149.573519673394998, 63.689312681842303 ], [ -149.573992745087992, 63.688870136739197 ], [ -149.574542002901012, 63.6883849734294 ], [ -149.574755534240012, 63.6881490009063 ], [ -149.576067806682005, 63.686661176092201 ], [ -149.576189797897996, 63.686485313840102 ], [ -149.576540997850998, 63.685832791856299 ], [ -149.576662787843986, 63.685677113771199 ], [ -149.577319010752007, 63.6850896662705 ], [ -149.577395990982012, 63.685008849930703 ], [ -149.577791836307, 63.684593270145903 ], [ -149.57931784580299, 63.682823478206402 ], [ -149.579470399500991, 63.682583462800402 ], [ -149.579546688926996, 63.682327740144601 ], [ -149.57957716876399, 63.682041505324399 ], [ -149.579561944116989, 63.681747194198898 ], [ -149.579592251478005, 63.681495724771999 ], [ -149.579714327135008, 63.681255933504701 ], [ -149.579989166696009, 63.680919698257597 ], [ -149.580263497810989, 63.680603637208002 ], [ -149.580553602444013, 63.680187095854301 ], [ -149.58114861684399, 63.679169383299097 ], [ -149.581270583805008, 63.678871264731498 ], [ -149.581346844483988, 63.678497773450097 ], [ -149.581346766330995, 63.677223628046299 ], [ -149.58131626852699, 63.676872789125298 ], [ -149.581209571128994, 63.6765858793826 ], [ -149.581087605065989, 63.676396099214301 ], [ -149.580889394493994, 63.676173789127198 ], [ -149.580706186685006, 63.676018095022798 ], [ -149.580339990255993, 63.6757852254878 ], [ -149.579485438196997, 63.675438137276103 ], [ -149.579286820687997, 63.6753279734099 ], [ -149.579225979590007, 63.6752858021284 ], [ -149.579103839254003, 63.6751330271615 ], [ -149.579073361214, 63.674984077707698 ], [ -149.57913421129399, 63.674824359891602 ], [ -149.579286994960995, 63.674656137091198 ], [ -149.579668520241995, 63.674381375352901 ], [ -149.579805666934988, 63.674247461578602 ], [ -149.579882077632988, 63.674110635003203 ], [ -149.579881807240014, 63.673954724001199 ], [ -149.579775196079993, 63.673778854198503 ], [ -149.579165015423996, 63.673297644680801 ], [ -149.579164764794001, 63.673290907457698 ], [ -149.578463016164989, 63.672748671880697 ], [ -149.578234031107996, 63.672531057460098 ], [ -149.57798984835199, 63.672218780967903 ], [ -149.57782219666899, 63.671924463057202 ], [ -149.577631756523999, 63.671487305493102 ], [ -149.577333678444006, 63.670803033265003 ], [ -149.577226771738992, 63.670494804139899 ], [ -149.577211584820986, 63.6701163770066 ], [ -149.577257315357002, 63.669903500559599 ], [ -149.577531929440994, 63.6691668588048 ], [ -149.577821937954013, 63.668285984839997 ], [ -149.577852284840986, 63.668114154184202 ], [ -149.577822061022999, 63.6678732407768 ], [ -149.577791361996987, 63.667782607236298 ], [ -149.577730268473005, 63.667702293422202 ], [ -149.577623496515002, 63.6675802544814 ], [ -149.577272809498993, 63.667289510180403 ], [ -149.576921681410994, 63.667045858978497 ], [ -149.576631839085991, 63.666862338076399 ], [ -149.576448731888007, 63.666721222028002 ], [ -149.576143643357, 63.666416117718903 ], [ -149.575944994406001, 63.666167989913298 ], [ -149.575853533333998, 63.665997051805299 ], [ -149.575777118144003, 63.665787300938703 ], [ -149.575593991184007, 63.664558234208997 ], [ -149.575502421414996, 63.6638377106595 ], [ -149.575395693475002, 63.663597903106002 ], [ -149.575212636582989, 63.663437720219697 ], [ -149.57437327503601, 63.662948599951598 ], [ -149.574327690925003, 63.6629147285581 ], [ -149.574220718643005, 63.662800531818803 ], [ -149.574190121126009, 63.662700927231498 ], [ -149.574205537114011, 63.662590344818398 ], [ -149.574281753776006, 63.662456882298898 ], [ -149.574541249214008, 63.662162834901999 ], [ -149.574617463180999, 63.662029371964998 ], [ -149.574647919661999, 63.6617812771199 ], [ -149.574632575538999, 63.661637260201204 ], [ -149.574510649900986, 63.661338681438203 ], [ -149.574403940824993, 63.661197574571801 ], [ -149.574083251251011, 63.660866208218998 ], [ -149.573625648546994, 63.6604848127512 ], [ -149.573244070266014, 63.660187537161796 ], [ -149.572710100881011, 63.659793788068498 ], [ -149.572313457852005, 63.659522983347799 ], [ -149.572054022601009, 63.659321283137999 ], [ -149.57180953980901, 63.6591233888457 ], [ -149.571474068457007, 63.658825227258902 ], [ -149.571291017854008, 63.658604471835197 ], [ -149.571107726500998, 63.658295104032597 ], [ -149.570932926024994, 63.657904886258699 ], [ -149.570711091557001, 63.657409661042301 ], [ -149.570665493073989, 63.657264749352997 ], [ -149.570634829081001, 63.656913906180897 ], [ -149.57065013188199, 63.656799955549403 ], [ -149.570589066205997, 63.656640006135298 ], [ -149.570497464996009, 63.656506072741401 ], [ -149.570115791493009, 63.656178501585799 ], [ -149.56947518489801, 63.655700833047 ], [ -149.569169960721013, 63.655525813533302 ], [ -149.568620417244006, 63.655254962089998 ], [ -149.568281767652991, 63.655106587896299 ], [ -149.568071375925001, 63.655014406658204 ], [ -149.566957385022988, 63.6545339410808 ], [ -149.56677446557299, 63.654434316235204 ], [ -149.566636844570013, 63.654347246414602 ], [ -149.566545384395994, 63.6542817314877 ], [ -149.566469043767, 63.654202082677003 ], [ -149.566407966411987, 63.654126250435603 ], [ -149.566402583707003, 63.654107179621803 ], [ -149.566377640186005, 63.6540188019775 ], [ -149.566347061534003, 63.653824982542801 ], [ -149.566377441659, 63.653686804393402 ], [ -149.566530204663991, 63.6534849510603 ], [ -149.566774282316999, 63.6532028004181 ], [ -149.566835188991007, 63.653103658878997 ], [ -149.56685051694501, 63.653004291341603 ], [ -149.566850490894012, 63.652878671997897 ], [ -149.566804668729986, 63.652775251875397 ], [ -149.566484470534988, 63.652267790679801 ], [ -149.566346821683993, 63.6520887495249 ], [ -149.566072221973002, 63.651692553652097 ], [ -149.565675641826004, 63.651177222220703 ], [ -149.565522922837999, 63.650848562866898 ], [ -149.565415958639989, 63.650502190068302 ], [ -149.565172095685, 63.649902772672498 ], [ -149.565049818804994, 63.649670348516501 ], [ -149.564927752131013, 63.649560184604702 ], [ -149.564759955819, 63.649434085495898 ], [ -149.564485339040004, 63.649346323687801 ], [ -149.564149751806013, 63.649284795283201 ], [ -149.563768206762006, 63.649246579749303 ], [ -149.563295047932996, 63.649223596894601 ], [ -149.562837510805991, 63.649231357398101 ], [ -149.561861011549013, 63.649223745222599 ], [ -149.561494478252001, 63.649182604909299 ], [ -149.561311510292995, 63.649140171447598 ], [ -149.561067331130999, 63.6490376017559 ], [ -149.560930146709012, 63.648895581601501 ], [ -149.560884340714011, 63.648777578296702 ], [ -149.560899474632009, 63.6486524079628 ], [ -149.561357198608988, 63.647728317250703 ], [ -149.561616473061008, 63.6472828748864 ], [ -149.561784333153014, 63.647069137571599 ], [ -149.562333729306005, 63.6464808754261 ], [ -149.562409991782005, 63.6463597588426 ], [ -149.562471179629, 63.6462482912521 ], [ -149.562470914626005, 63.645958913000101 ], [ -149.562460959496008, 63.645776727542 ], [ -149.56244065218101, 63.645405073302001 ], [ -149.562394589267996, 63.645123311295599 ], [ -149.562409843560005, 63.644890473133202 ], [ -149.562516891300987, 63.644528006742803 ], [ -149.562684389372009, 63.643937405181099 ], [ -149.562806527910993, 63.643563048445898 ], [ -149.562867662758009, 63.6434560652838 ], [ -149.563004874130002, 63.643277311115902 ], [ -149.563432207201998, 63.643079109887402 ], [ -149.563874709226013, 63.642956503955197 ], [ -149.56443943602801, 63.642861067555003 ], [ -149.566422893717004, 63.642510409202899 ], [ -149.567033441784986, 63.642402861721997 ], [ -149.56736884755901, 63.642330911647498 ], [ -149.567948813381008, 63.642174228047601 ], [ -149.569047455668994, 63.641838853343799 ], [ -149.569718699307003, 63.6416478514614 ], [ -149.570191797050995, 63.641567630750203 ], [ -149.570664811251987, 63.641544606978201 ], [ -149.571153051896999, 63.641544462997302 ], [ -149.571809289178987, 63.641582931395902 ], [ -149.572572303807988, 63.6416817530353 ], [ -149.573518014206996, 63.6418162521582 ], [ -149.574082695193994, 63.641884529874901 ], [ -149.57449472007599, 63.641892217005498 ], [ -149.574799750217011, 63.641861973395102 ], [ -149.574998215013011, 63.641830824795903 ], [ -149.575242326801003, 63.641774106809798 ], [ -149.575349105046996, 63.641735762309501 ], [ -149.576051134848996, 63.641403203428702 ], [ -149.576417172275995, 63.6412895199473 ], [ -149.57652392447099, 63.641270241084797 ], [ -149.576737703746005, 63.641236177886803 ], [ -149.576981927823994, 63.641216471826503 ], [ -149.577805590412993, 63.641171253290302 ], [ -149.578263590172014, 63.641117480254898 ], [ -149.578645057961012, 63.6410378942048 ], [ -149.578889009849007, 63.640980043504499 ], [ -149.579484331472997, 63.640823771639504 ], [ -149.580003052854011, 63.640648413870203 ], [ -149.58021653029499, 63.640511152737801 ], [ -149.580308170132014, 63.640438712063997 ], [ -149.580384490099988, 63.640335536972003 ], [ -149.580414895377004, 63.640270262113802 ], [ -149.580430153262, 63.640156312444702 ], [ -149.580399599763012, 63.640018580271999 ], [ -149.579835202643011, 63.638630255790297 ], [ -149.579606210398993, 63.638004395827402 ], [ -149.579499399812988, 63.6376457079879 ], [ -149.579453377324995, 63.637276478303399 ], [ -149.579453374629992, 63.637219532621501 ], [ -149.57945336654501, 63.637009547000403 ], [ -149.579484153605989, 63.636802967278797 ], [ -149.579606326282004, 63.636264859994597 ], [ -149.579697708302007, 63.635933332457697 ], [ -149.580155364006998, 63.634613308076901 ], [ -149.580185913014986, 63.634498689823602 ], [ -149.580155201411998, 63.634277958551998 ], [ -149.580124929085002, 63.634144721079501 ], [ -149.580063733152997, 63.634015057926703 ], [ -149.579911360016013, 63.633792978441598 ], [ -149.57882789207099, 63.632579996416702 ], [ -149.578538011118013, 63.632218148038497 ], [ -149.578141114764009, 63.631474052746803 ], [ -149.577607059141997, 63.6303714945848 ], [ -149.577591692559992, 63.630280194577402 ], [ -149.577576633202995, 63.630039737049202 ], [ -149.577698619029007, 63.6293221811585 ], [ -149.578049359943009, 63.627625538021903 ], [ -149.578095177616007, 63.627262387504402 ], [ -149.578095245887994, 63.627205190696202 ], [ -149.578034105651, 63.626938698643499 ], [ -149.577942554747011, 63.626655607282203 ], [ -149.577759393651007, 63.626312611314901 ], [ -149.577500185674012, 63.625980826325602 ], [ -149.576996604498987, 63.625565557089701 ], [ -149.576691432424013, 63.625263816385399 ], [ -149.57663032811999, 63.625161071818503 ], [ -149.576614955249994, 63.625004722065597 ], [ -149.576676114350988, 63.624836053245403 ], [ -149.576905067069987, 63.624435695642397 ], [ -149.577656440431014, 63.623181362264397 ], [ -149.57785105145399, 63.622856461926403 ], [ -149.578263067352992, 63.622238322314097 ], [ -149.579178584476011, 63.6206671614461 ], [ -149.579804076018007, 63.619656056693898 ], [ -149.579834591788995, 63.61956050445 ], [ -149.580033061075994, 63.619278129488102 ], [ -149.580170337125992, 63.6189692725114 ], [ -149.580200788218008, 63.618897271434399 ], [ -149.580200895117002, 63.6188355900088 ], [ -149.58015508373299, 63.618698530383398 ], [ -149.579880409460998, 63.6183247968468 ], [ -149.579758508076992, 63.6180879164529 ], [ -149.579712490979006, 63.617939636130103 ], [ -149.579666847579006, 63.617500887546498 ], [ -149.579666839493996, 63.617267606877199 ], [ -149.579651480997995, 63.617058546727897 ], [ -149.579514044148993, 63.616615965498802 ], [ -149.579514285795995, 63.616439890574597 ], [ -149.579590385676994, 63.616287366606102 ], [ -149.579712528708001, 63.6161126489095 ], [ -149.579971692666987, 63.6158724431073 ], [ -149.580124507774997, 63.615685173539603 ], [ -149.58100961153599, 63.614537061337401 ], [ -149.581253531085991, 63.614273973987601 ], [ -149.581467277123011, 63.614121026795601 ], [ -149.582321777977, 63.613575393382902 ], [ -149.582458886041991, 63.6134650446674 ], [ -149.582657397550008, 63.613289216113998 ], [ -149.582992970410999, 63.6130075222231 ], [ -149.583023745795003, 63.612983757458302 ], [ -149.583130533922002, 63.612881485102299 ], [ -149.583221807247014, 63.612770904527402 ], [ -149.583313687832003, 63.612628938873399 ], [ -149.583435577538012, 63.6123588825388 ], [ -149.583603489733008, 63.612186637212098 ], [ -149.583801904223009, 63.612053423068502 ], [ -149.584183371112999, 63.611847103387703 ], [ -149.584396896165003, 63.611714334822103 ], [ -149.58462580217099, 63.611519213544902 ], [ -149.584869941807, 63.611294261534503 ], [ -149.58509880199901, 63.611137270512302 ], [ -149.585495550129991, 63.610928034708401 ], [ -149.585602472107013, 63.610843710146703 ], [ -149.585663171270994, 63.610768115404298 ], [ -149.585693875687014, 63.610580605381699 ], [ -149.585602293341992, 63.610333410989803 ], [ -149.585210514690999, 63.609638112308197 ], [ -149.585083699521988, 63.609413039600497 ], [ -149.585037860289987, 63.609295048649003 ], [ -149.584915735224996, 63.609116487084897 ], [ -149.584879134266998, 63.6090552915364 ], [ -149.584824238219994, 63.608963503756399 ], [ -149.584762991981989, 63.608825991631903 ], [ -149.58465635656799, 63.608624335527999 ], [ -149.584488520731014, 63.608280681839403 ], [ -149.584473282608002, 63.608089573209703 ], [ -149.584534312351991, 63.607994923649599 ], [ -149.584610536201012, 63.607891749268603 ], [ -149.584763101577011, 63.607791949508098 ], [ -149.584915836735007, 63.6077078564307 ], [ -149.58700623436701, 63.606865580224699 ], [ -149.588501426259, 63.606235641423801 ], [ -149.589554373943002, 63.605766488007603 ], [ -149.590225690343999, 63.605480103134198 ], [ -149.591263359482014, 63.605110303893902 ], [ -149.59268230327001, 63.6046754690379 ], [ -149.59289588042401, 63.604579702688802 ], [ -149.593140247333992, 63.6044388614608 ], [ -149.593475578548009, 63.604214343442898 ], [ -149.595962866245998, 63.602893552536997 ], [ -149.597458430040007, 63.602123361191801 ], [ -149.60112052189001, 63.6003570681574 ], [ -149.602310636030012, 63.599834677511602 ], [ -149.602600324743008, 63.599686184526902 ], [ -149.602981923686002, 63.599430486998102 ], [ -149.603073517708992, 63.599342338524998 ], [ -149.603180260920993, 63.599140243283998 ], [ -149.603393815615988, 63.598636241362698 ], [ -149.603408939653008, 63.598614880009897 ], [ -149.603485605472002, 63.5985066026536 ], [ -149.604294033532, 63.597965132195498 ], [ -149.605225109477004, 63.597362214606399 ], [ -149.606689839496994, 63.596843379735802 ], [ -149.607498440033993, 63.596473487353499 ], [ -149.607849434272993, 63.596271833921101 ], [ -149.608398682204012, 63.5958180607335 ], [ -149.608673551408998, 63.595626508003797 ], [ -149.60939056061801, 63.595154105867998 ], [ -149.609771830777987, 63.594829975302098 ], [ -149.609848249560002, 63.594726799891703 ], [ -149.609909210133992, 63.594608590590802 ], [ -149.610046797899003, 63.594455621884997 ], [ -149.610412819157006, 63.594127678474997 ], [ -149.610748572579013, 63.593860528198398 ], [ -149.611130249675, 63.593596967430202 ], [ -149.611908240118993, 63.593162234187098 ], [ -149.613220482017994, 63.5924874740276 ], [ -149.613495122153012, 63.592316093546103 ], [ -149.613708764883995, 63.5921743261937 ], [ -149.614075159840013, 63.5918878815433 ], [ -149.614395491884011, 63.591670738622398 ], [ -149.614975249297004, 63.591350177050302 ], [ -149.615616209829, 63.591068417193803 ], [ -149.616516297488999, 63.590697803641802 ], [ -149.616790999608014, 63.590572401593597 ], [ -149.616928225352012, 63.590476612923403 ], [ -149.616989244315988, 63.590385319353601 ], [ -149.617019831053994, 63.590281919253897 ], [ -149.616943503001011, 63.590011651835802 ], [ -149.616836834348987, 63.589699000185199 ], [ -149.616821386919014, 63.589412573767703 ], [ -149.617035088938991, 63.588428583770899 ], [ -149.617142005525011, 63.5881692954326 ], [ -149.617340216996013, 63.5878487591458 ], [ -149.617630262339986, 63.587535400418098 ], [ -149.617752470948005, 63.586806667296301 ], [ -149.617752320930009, 63.586650779848298 ], [ -149.61770660836001, 63.586524957555 ], [ -149.617691133081991, 63.586357405827101 ], [ -149.617691336102013, 63.586216107505599 ], [ -149.617797914022987, 63.585880550252803 ], [ -149.618118472443001, 63.585158753511003 ], [ -149.618316666845999, 63.5845645807536 ], [ -149.618545724667001, 63.584102524000997 ], [ -149.618789801421002, 63.5837474460686 ], [ -149.619186581891995, 63.583381142168903 ], [ -149.619720688719013, 63.582958302236896 ], [ -149.619735952892, 63.582938563729002 ], [ -149.61990364230499, 63.582805537466299 ], [ -149.620025803302013, 63.582659963068402 ], [ -149.620178444136002, 63.582519767857903 ], [ -149.620422749960994, 63.582347492025796 ], [ -149.620971766127013, 63.582042838389299 ], [ -149.621383805380987, 63.581847438337697 ], [ -149.622024813524007, 63.581565663119001 ], [ -149.622284172418006, 63.581417376122801 ], [ -149.622406237294996, 63.581321141361002 ], [ -149.622726467829011, 63.581035576678403 ], [ -149.623001338830989, 63.580695975397099 ], [ -149.623230110988004, 63.580475019892802 ], [ -149.623520061111009, 63.580276040960896 ], [ -149.62379462309201, 63.580112496626803 ], [ -149.62434427616401, 63.579837010791202 ], [ -149.624694833821991, 63.579651018322799 ], [ -149.624954270869011, 63.5794489014947 ], [ -149.625061405747005, 63.579348864407699 ], [ -149.625259794185013, 63.579047393998898 ], [ -149.625320733199004, 63.578879839419002 ], [ -149.625519072230986, 63.578463980968799 ], [ -149.625824274849009, 63.577960412566703 ], [ -149.626022646220008, 63.577658941845002 ], [ -149.626175075052004, 63.577498550003803 ], [ -149.626586922066991, 63.5770339888644 ], [ -149.626785324878995, 63.576625981340499 ], [ -149.626785420998999, 63.576553091486502 ], [ -149.626861829900008, 63.576377017854497 ], [ -149.626999082594011, 63.5761444090762 ], [ -149.627105796161999, 63.576015201943399 ], [ -149.627212656154995, 63.575927491404002 ], [ -149.627319395772986, 63.575855478038001 ], [ -149.628128297246008, 63.575420472115098 ], [ -149.62881500897501, 63.5750805763752 ], [ -149.629196294406, 63.574836038887597 ], [ -149.629593189860998, 63.574565043888299 ], [ -149.629791364500988, 63.574423931287399 ], [ -149.630371157846014, 63.5738487663223 ], [ -149.630523641476003, 63.573696223720702 ], [ -149.630569628930004, 63.573626918105901 ], [ -149.630736815286014, 63.573468850746899 ], [ -149.630859566477, 63.573352793184299 ], [ -149.630905479370995, 63.573313763799 ], [ -149.631195021657987, 63.573131584381599 ], [ -149.63130209994199, 63.573074157871503 ], [ -149.631393514302005, 63.5730286085453 ], [ -149.63156162143099, 63.572970722055103 ], [ -149.631912219512998, 63.572845276268097 ], [ -149.632400560769014, 63.572662176297598 ], [ -149.632904145537992, 63.572459335372102 ], [ -149.633438176905997, 63.572181125114 ], [ -149.636383308056992, 63.570593982392502 ], [ -149.636612191604996, 63.570460487806002 ], [ -149.636779978035008, 63.570357730618198 ], [ -149.636871445395997, 63.570281901887697 ], [ -149.637100485251011, 63.570021690510103 ], [ -149.637374949316012, 63.569553099235698 ], [ -149.637832932007001, 63.568766897517598 ], [ -149.637954784881998, 63.568579813072297 ], [ -149.638122627007988, 63.5684041643743 ], [ -149.638275371149007, 63.568270687913703 ], [ -149.638641413068001, 63.568023445991599 ], [ -149.639633435213, 63.5674199178249 ], [ -149.640060437704989, 63.567176695344301 ], [ -149.640564135661009, 63.566810110615698 ], [ -149.641205075532014, 63.566425100457003 ], [ -149.641494962771986, 63.566199181435799 ], [ -149.641906825057987, 63.5657424443976 ], [ -149.642074765999013, 63.565440076480002 ], [ -149.642486676794988, 63.564368807993098 ], [ -149.643127516053994, 63.562838833114498 ], [ -149.643371822776999, 63.562148443185897 ], [ -149.643539433136993, 63.561626269982 ], [ -149.643738083883989, 63.5607898880478 ], [ -149.643741170496014, 63.5607753618199 ], [ -149.643814091238994, 63.560432134235398 ], [ -149.643875415629992, 63.559909106003602 ], [ -149.643936206422012, 63.559829015995497 ], [ -149.644058413233012, 63.559756324334501 ], [ -149.644287198864987, 63.559641884041099 ], [ -149.644378927634989, 63.559566060778799 ], [ -149.644363700293013, 63.559432169707499 ], [ -149.644317551141, 63.559291770902902 ], [ -149.644317739787994, 63.559134779162001 ], [ -149.644394047179986, 63.559039442668798 ], [ -149.644470237789989, 63.558959801814702 ], [ -149.644821409895997, 63.558745760041397 ], [ -149.645065437243005, 63.558455703640597 ], [ -149.645462323715009, 63.558222809254701 ], [ -149.645507894350999, 63.558181524278503 ], [ -149.64556896272299, 63.558039765271602 ], [ -149.645599482985006, 63.557861230673602 ], [ -149.645691127313, 63.5577304561169 ], [ -149.645889354054987, 63.557643158474001 ], [ -149.646301507396004, 63.557471261719101 ], [ -149.646636946407995, 63.557254516610698 ], [ -149.647247468424013, 63.5569067334999 ], [ -149.647476270226008, 63.556674542908802 ], [ -149.647659443, 63.5565139140474 ], [ -149.647949399411004, 63.556346303261599 ], [ -149.648727575805992, 63.5561368458986 ], [ -149.649353176044002, 63.556007045526798 ], [ -149.649749755292987, 63.555942341339403 ], [ -149.650970634933998, 63.555789499595498 ], [ -149.651291181674992, 63.555739398525198 ], [ -149.651733525596001, 63.555625559768302 ], [ -149.65223712204201, 63.555473131574999 ], [ -149.652328612758993, 63.5553815988984 ], [ -149.652450589602012, 63.555132836509898 ], [ -149.652542047080999, 63.555045787343403 ], [ -149.652618601509005, 63.554999796725099 ], [ -149.653122189870999, 63.554823817446199 ], [ -149.653488200348988, 63.554675231931697 ], [ -149.65405286426801, 63.554393373791797 ], [ -149.655380567072001, 63.554052972617399 ], [ -149.655685654704996, 63.554030447596503 ], [ -149.656127966285993, 63.554053405090599 ], [ -149.656372013396009, 63.554061623280099 ], [ -149.656524690163991, 63.554053728745401 ], [ -149.65730315401899, 63.553946284362603 ], [ -149.657608164397999, 63.5539349676028 ], [ -149.659164462390009, 63.5540452457087 ], [ -149.659668076803001, 63.554114829018403 ], [ -149.659957924516988, 63.554137829651701 ], [ -149.660354711276, 63.554129173411198 ], [ -149.66084285490399, 63.554091771957097 ], [ -149.661270156535011, 63.554079515096902 ], [ -149.661590462526988, 63.554084333507397 ], [ -149.66235351758101, 63.554117709499501 ], [ -149.663375995308996, 63.554140672124099 ], [ -149.664138784460988, 63.554167302136399 ], [ -149.664642379111001, 63.554194255376899 ], [ -149.665420429741005, 63.554267299282699 ], [ -149.665649393238994, 63.5542750645374 ], [ -149.666061683124013, 63.554251144265599 ], [ -149.666183437184003, 63.554236735123702 ], [ -149.666549782733, 63.554171111965601 ], [ -149.666928675950004, 63.554097207669102 ], [ -149.667175368599004, 63.554049089159903 ], [ -149.667648381003005, 63.553992163461601 ], [ -149.668121459882997, 63.553973365434103 ], [ -149.668426529550004, 63.553976605591302 ], [ -149.668991114417992, 63.554003070528701 ], [ -149.669098021123006, 63.553999442308097 ], [ -149.669601471145, 63.553950121426098 ], [ -149.669769410289007, 63.553939291552197 ], [ -149.670013488839004, 63.553943002994799 ], [ -149.670349217108992, 63.553969555978497 ], [ -149.670868039101009, 63.554049633652099 ], [ -149.671615590131012, 63.554175585903899 ], [ -149.67218026033899, 63.554289507265402 ], [ -149.673614485369001, 63.554629339930202 ], [ -149.674072228210008, 63.554702029469098 ], [ -149.67460638444399, 63.554720862621302 ], [ -149.675003116406003, 63.554746929209799 ], [ -149.676269529852988, 63.554854239355599 ], [ -149.676559329058989, 63.554888418558498 ], [ -149.677413916151011, 63.555048837753198 ], [ -149.677765065799008, 63.555101609991297 ], [ -149.678329284153989, 63.5551672762127 ], [ -149.679565512410989, 63.555254621445698 ], [ -149.680099383878996, 63.5552969747962 ], [ -149.680526867867997, 63.555360919555199 ], [ -149.681198181575013, 63.5554991950752 ], [ -149.681396603252011, 63.555517266410803 ], [ -149.681610126506001, 63.555533532323203 ], [ -149.682113677139, 63.555548089226797 ], [ -149.682464456681004, 63.555506646757202 ], [ -149.682891725074995, 63.555395647017498 ], [ -149.683486816728987, 63.555186331886098 ], [ -149.684005669264991, 63.555029758384599 ], [ -149.684585758156004, 63.554883922729097 ], [ -149.685104536131007, 63.554792381359 ], [ -149.685775707005007, 63.554686177542997 ], [ -149.687027129365987, 63.554510382756 ], [ -149.687530601845992, 63.554426240942497 ], [ -149.688522313172996, 63.5542821828857 ], [ -149.690277098418989, 63.554033425702698 ], [ -149.690826341858013, 63.553968536202902 ], [ -149.691421283494009, 63.553938602632797 ], [ -149.692306435765005, 63.553927129442798 ], [ -149.692733938619, 63.553960763663497 ], [ -149.693206653680988, 63.554060738330499 ], [ -149.693984906432007, 63.554251377103398 ], [ -149.694397005874009, 63.554342871803598 ], [ -149.694595229023008, 63.554368770311299 ], [ -149.694808975958011, 63.554372688530698 ], [ -149.695068219868006, 63.554335306999299 ], [ -149.696533000193, 63.554048964338797 ], [ -149.697486366932992, 63.553869225729201 ], [ -149.69869286814, 63.5536417512591 ], [ -149.703735217830996, 63.552690923172896 ], [ -149.704406832473012, 63.5525072807283 ], [ -149.705078043772005, 63.552339321501897 ], [ -149.705413722634006, 63.552286180464598 ], [ -149.70596309902399, 63.552213391541898 ], [ -149.706359853444013, 63.552141819520998 ], [ -149.706604080217005, 63.552083803354101 ], [ -149.707015955977994, 63.551943142285999 ], [ -149.707137899582989, 63.551916372161699 ], [ -149.707412607989994, 63.551859230551401 ], [ -149.707656750322002, 63.551816909701103 ], [ -149.707870281661002, 63.551798376304802 ], [ -149.707992564828999, 63.551797405663798 ], [ -149.708556936797009, 63.551771012296598 ], [ -149.709213154314995, 63.551764075766599 ], [ -149.710357533426986, 63.5517902198782 ], [ -149.711242652458992, 63.551802183249897 ], [ -149.711532336680989, 63.551798167052802 ], [ -149.711975118081, 63.551759298974197 ], [ -149.712920961430001, 63.551599191746803 ], [ -149.713378682712005, 63.551557385842699 ], [ -149.713714607712006, 63.551545720845098 ], [ -149.714370787500997, 63.5515454895856 ], [ -149.714904673343, 63.551515954774104 ], [ -149.71542355911501, 63.551500565596001 ], [ -149.715758974771006, 63.551496732203802 ], [ -149.716583093704003, 63.551511399197402 ], [ -149.71829225441499, 63.551553679690798 ], [ -149.718765352159011, 63.551549300565497 ], [ -149.720123177271006, 63.551572517724203 ], [ -149.720901279104993, 63.551614996177499 ], [ -149.721694719672996, 63.551706126447797 ], [ -149.721938906920002, 63.551717605733202 ], [ -149.722915609196008, 63.551809493463303 ], [ -149.72386168970101, 63.551862372924802 ], [ -149.724334597900992, 63.5519005807013 ], [ -149.724929842269006, 63.551961350309199 ], [ -149.725417843064008, 63.551999986456401 ], [ -149.725601141602993, 63.552026536849297 ], [ -149.725769091527013, 63.552041435225803 ], [ -149.725967285031004, 63.552076260755598 ], [ -149.726318367304998, 63.552155827627402 ], [ -149.726745504544994, 63.552274572578298 ], [ -149.727706614762013, 63.552667611304301 ], [ -149.727828762284986, 63.552698016711403 ], [ -149.728027155214988, 63.5527249957468 ], [ -149.728238892619004, 63.5527327426176 ], [ -149.728729142795999, 63.552750678477999 ], [ -149.729110456074011, 63.552785129461398 ], [ -149.729430906695995, 63.552827931776498 ], [ -149.729858269412006, 63.552899579690802 ], [ -149.730102305742008, 63.552949165245501 ], [ -149.730545109600001, 63.553086286630901 ], [ -149.730941703221987, 63.553224329539397 ], [ -149.731292429762988, 63.553319572667299 ], [ -149.731490907135992, 63.553365610805798 ], [ -149.732192691697009, 63.553479854265397 ], [ -149.732528403797005, 63.553521963807299 ], [ -149.733687960843014, 63.553735617143801 ], [ -149.735290340613005, 63.554056093145299 ], [ -149.735717577564998, 63.554165843895397 ], [ -149.735915831256989, 63.554230932178399 ], [ -149.736266822801014, 63.554383355414302 ], [ -149.736511070235991, 63.554540580565899 ], [ -149.737273968083997, 63.555176822653401 ], [ -149.737533431181987, 63.5553445719341 ], [ -149.737853802751999, 63.5554557514943 ], [ -149.738174285713001, 63.555540021883601 ], [ -149.738555554973999, 63.5555968720818 ], [ -149.738845541029008, 63.5556040237038 ], [ -149.739303368311994, 63.555581201074297 ], [ -149.739730694197988, 63.555520505192298 ], [ -149.740570062930999, 63.555367278738899 ], [ -149.740997053744991, 63.555311054161002 ], [ -149.741180239995003, 63.5552949729448 ], [ -149.741424383224, 63.5552873563867 ], [ -149.741576839006001, 63.555291702533701 ], [ -149.742004040025989, 63.555340883876902 ], [ -149.742156716793005, 63.555489882370203 ], [ -149.742187237953004, 63.555604002501397 ], [ -149.742141450822999, 63.555695764089201 ], [ -149.741836144898997, 63.556027933621998 ], [ -149.741805590501997, 63.556123493412102 ], [ -149.741820815148998, 63.556249512105197 ], [ -149.742492322891991, 63.5564973954734 ], [ -149.742766960332006, 63.556573620933797 ], [ -149.743011048764004, 63.556623185695102 ], [ -149.743255345606002, 63.556618934158699 ], [ -149.743484224662012, 63.556577241226002 ], [ -149.743804567485995, 63.556501150986598 ], [ -149.744720276848994, 63.556199822282203 ], [ -149.745544057117002, 63.5558442918772 ], [ -149.746047528698, 63.555638858481998 ], [ -149.746353039437992, 63.555573553789102 ], [ -149.746658114495006, 63.555581119064797 ], [ -149.746948174212008, 63.555653291717903 ], [ -149.747314056231005, 63.555794898979798 ], [ -149.747451597283998, 63.555836937893901 ], [ -149.747772142228001, 63.555870730677597 ], [ -149.748657027699011, 63.555898159957003 ], [ -149.750304775084999, 63.5560089585193 ], [ -149.752746148092001, 63.556088482809002 ], [ -149.752837760082002, 63.556096693610897 ], [ -149.75308205782099, 63.556133913216598 ], [ -149.753249802031007, 63.556172320486297 ], [ -149.75340221559199, 63.556233838256297 ], [ -149.753524453843994, 63.556294497815799 ], [ -149.753707428989998, 63.556382673266903 ], [ -149.753875423828987, 63.556439026141703 ], [ -149.754012831931988, 63.556477691421897 ], [ -149.754150086421987, 63.5565152305564 ], [ -149.754287548424003, 63.5565381988499 ], [ -149.754424719371002, 63.556554430576902 ], [ -149.754511099571999, 63.556556250725102 ], [ -149.754714439525003, 63.556550329442501 ], [ -149.755065543358995, 63.556523303624097 ], [ -149.75532487081199, 63.556489185586997 ], [ -149.755538493779, 63.556443675338897 ], [ -149.755706481431986, 63.556412567466801 ], [ -149.75585903513101, 63.5563899911063 ], [ -149.756057582571003, 63.5563855391175 ], [ -149.756240658328011, 63.556400831249903 ], [ -149.756515163715989, 63.556432175155003 ], [ -149.756698291574992, 63.5564777426262 ], [ -149.75733913173201, 63.556626011118297 ], [ -149.757781554703996, 63.556694637654097 ], [ -149.758803778209, 63.556835788108998 ], [ -149.76083317304699, 63.557163610093198 ], [ -149.762328632637008, 63.557339466517703 ], [ -149.763000150261007, 63.557445970461202 ], [ -149.763915419449006, 63.5576221747585 ], [ -149.764190117076993, 63.557698359608601 ], [ -149.764449607124988, 63.557812236486903 ], [ -149.765029369029008, 63.558159445332002 ], [ -149.765334436001012, 63.5582286401877 ], [ -149.766066900725008, 63.558258369647497 ], [ -149.766631596085006, 63.558300159722499 ], [ -149.767348613378999, 63.5583955982909 ], [ -149.767974200142987, 63.558472746686803 ], [ -149.768462548585006, 63.558498911845 ], [ -149.768676184129987, 63.558499356650898 ], [ -149.769667855032992, 63.558487071685903 ], [ -149.770156044473993, 63.558514348845002 ], [ -149.770506919237988, 63.558568010675302 ], [ -149.771681849153993, 63.558785152593998 ], [ -149.772719513800013, 63.5590174631865 ], [ -149.773040071320992, 63.559066896898003 ], [ -149.773192682510995, 63.559079063613801 ], [ -149.773390739472006, 63.559086908756797 ], [ -149.774382664597994, 63.559101510244901 ], [ -149.775054147188001, 63.559193380969198 ], [ -149.77535930578901, 63.5592423747811 ], [ -149.775862600401013, 63.559441611921599 ], [ -149.77595432737499, 63.559471114920498 ], [ -149.776122181179005, 63.559487072582698 ], [ -149.776549482809997, 63.559483454260103 ], [ -149.776961345995005, 63.559433426082997 ], [ -149.777236029248996, 63.559417643587501 ], [ -149.777602343358012, 63.559410055330702 ], [ -149.779570566518004, 63.5594140860549 ], [ -149.780379279344004, 63.559398804339402 ], [ -149.780867671804998, 63.559418202776797 ], [ -149.782027135427001, 63.559517091922899 ], [ -149.782484874674992, 63.559536740673899 ], [ -149.783034376828994, 63.559513006814598 ], [ -149.784026174394995, 63.559460265145098 ], [ -149.784651749480986, 63.559440914335497 ], [ -149.785285400421003, 63.559429820953298 ], [ -149.78533846031101, 63.559428891371297 ], [ -149.78663545690199, 63.559413893258501 ], [ -149.787184702138006, 63.559429380161902 ], [ -149.787321915305995, 63.559441097931803 ], [ -149.787718441554006, 63.559487035383498 ], [ -149.788542703318996, 63.559612303621101 ], [ -149.790831439084997, 63.559986258301301 ], [ -149.791411069834993, 63.560058647388097 ], [ -149.792006141727001, 63.560115772159499 ], [ -149.792357169203996, 63.560126778878299 ], [ -149.792677763555986, 63.5601077753063 ], [ -149.793028493690997, 63.5600391633903 ], [ -149.793440631760006, 63.5599251886159 ], [ -149.793715384184992, 63.559802860058497 ], [ -149.793822144464997, 63.559722892948002 ], [ -149.79391346540001, 63.559658189998103 ], [ -149.794188074093995, 63.559380004678303 ], [ -149.794508698989006, 63.558605284653702 ], [ -149.794386468820989, 63.558349566277897 ], [ -149.794355930593014, 63.558148005842099 ], [ -149.794523872431995, 63.557681814520102 ], [ -149.794737523247989, 63.556858114898702 ], [ -149.794890283558004, 63.5559082458091 ], [ -149.794874818161986, 63.555640956720303 ], [ -149.79485970400799, 63.555503741213499 ], [ -149.794798686840011, 63.555294595697397 ], [ -149.79479865809401, 63.555160046870903 ], [ -149.794707012867008, 63.554867069163201 ], [ -149.794707101801009, 63.554603581680297 ], [ -149.794737586129997, 63.554385800199498 ], [ -149.794798711992996, 63.554245124488098 ], [ -149.794890035623013, 63.554096328721698 ], [ -149.795058025971002, 63.553963146074302 ], [ -149.795271796262995, 63.553809948853797 ], [ -149.795317497154997, 63.553752931061403 ], [ -149.795348087484996, 63.553706699913498 ], [ -149.795332695751, 63.553626659683403 ], [ -149.795241219406989, 63.553551205285601 ], [ -149.794844429953002, 63.553291123906703 ], [ -149.79476817106999, 63.553230672796602 ], [ -149.794447742008003, 63.552913314567597 ], [ -149.794356152477008, 63.552745915053897 ], [ -149.794295144292988, 63.552391010509801 ], [ -149.794356079712998, 63.552264906337797 ], [ -149.794493556088014, 63.552139835452202 ], [ -149.794646040615987, 63.552051065533497 ], [ -149.795119017985996, 63.551799770651002 ], [ -149.795271592344989, 63.551666154364398 ], [ -149.795561558638013, 63.551368221042203 ], [ -149.795790582323008, 63.551200877270801 ], [ -149.795973420026002, 63.551098385487499 ], [ -149.796553479273001, 63.550883736907103 ], [ -149.797301152473011, 63.5506244690283 ], [ -149.797453698985009, 63.550574941847302 ], [ -149.797606094580004, 63.550522047193503 ], [ -149.797911410385012, 63.550388241262297 ], [ -149.798077593323001, 63.550284793469601 ], [ -149.798125100726992, 63.550255220540699 ], [ -149.798292889852007, 63.550125393779197 ], [ -149.798338613201992, 63.550052679362999 ], [ -149.798368968174003, 63.5499615930216 ], [ -149.798323260095003, 63.549556668307503 ], [ -149.798369004106007, 63.549393135571897 ], [ -149.798384523401012, 63.549255661505299 ], [ -149.798384372484009, 63.549095322539401 ], [ -149.798338632964999, 63.548942670551803 ], [ -149.79832327985801, 63.548683237364301 ], [ -149.798262304013008, 63.548369822371598 ], [ -149.798155399105013, 63.548157146793002 ], [ -149.798109693720988, 63.547988799393003 ], [ -149.798125115099992, 63.547821050031096 ], [ -149.798277542135992, 63.547352183544596 ], [ -149.798338539539998, 63.547103868081301 ], [ -149.798414965509011, 63.5469972602572 ], [ -149.798628398933005, 63.546742019556802 ], [ -149.798735486199007, 63.546546576897498 ], [ -149.798735270603999, 63.5464176308368 ], [ -149.798689650559993, 63.546127073577097 ], [ -149.798689540965995, 63.546023918058502 ], [ -149.799071043789013, 63.545081616079599 ], [ -149.799147363756987, 63.5448651257066 ], [ -149.799223574130991, 63.544704693210598 ], [ -149.799361160997989, 63.544494410709198 ], [ -149.799635644826992, 63.544021130838203 ], [ -149.799788388069004, 63.5436094561693 ], [ -149.79981894426399, 63.543410739470403 ], [ -149.800078043544005, 63.5430031778833 ], [ -149.800185108352991, 63.542644037681598 ], [ -149.800505321819003, 63.542232588472501 ], [ -149.800566550090991, 63.542174885931402 ], [ -149.80119186286899, 63.541683439832099 ], [ -149.801390249511002, 63.541542139481102 ], [ -149.801573457319989, 63.541533836032002 ], [ -149.802138187715002, 63.541579984863397 ], [ -149.803038499054992, 63.541633321968099 ], [ -149.803160253116005, 63.541637864314602 ], [ -149.803419667704986, 63.541626094796598 ], [ -149.803831868656005, 63.541660102550701 ], [ -149.80404553564199, 63.541663864021601 ], [ -149.804243702196999, 63.541636916541599 ], [ -149.804442072668991, 63.541584187412397 ], [ -149.804777882684988, 63.541461320234099 ], [ -149.805983247524011, 63.540916636762098 ], [ -149.806105166874005, 63.540824758744499 ], [ -149.806212060104997, 63.5406988223395 ], [ -149.806212220903006, 63.540606887984403 ], [ -149.806074751714988, 63.540245363662301 ], [ -149.80608986856501, 63.540134789601296 ], [ -149.806349469104987, 63.539733962941398 ], [ -149.806364908450007, 63.539618912275898 ], [ -149.806319026996988, 63.539531290967901 ], [ -149.806120738271005, 63.539275694025598 ], [ -149.805693299197998, 63.538810722234999 ], [ -149.805632407794008, 63.538684558780901 ], [ -149.80567792542999, 63.5385288693167 ], [ -149.805754337925009, 63.538402077365298 ], [ -149.805815397313012, 63.538341005452097 ], [ -149.806151109413008, 63.538070135109898 ], [ -149.806251272465005, 63.538011515480598 ], [ -149.806502094669014, 63.537864722501098 ], [ -149.806822273998989, 63.537758231039597 ], [ -149.808058459135992, 63.537551884687801 ], [ -149.808180400046012, 63.537528399516802 ], [ -149.80840939588299, 63.537459707612499 ], [ -149.809629930571987, 63.536910945422001 ], [ -149.810118324829006, 63.536708260590999 ], [ -149.810621985056002, 63.536582244758499 ], [ -149.810896492240005, 63.536532765636103 ], [ -149.811720429714001, 63.536414611221602 ], [ -149.811827245688988, 63.536415365015301 ], [ -149.811934203599009, 63.536426213557299 ], [ -149.81236133904099, 63.536514434468401 ], [ -149.812574935060013, 63.536540606978498 ], [ -149.81271224524599, 63.5365287608983 ], [ -149.81376495757101, 63.5363654356482 ], [ -149.814451696249989, 63.5361739054254 ], [ -149.814650117028009, 63.536155922704801 ], [ -149.814833120021007, 63.5361554471259 ], [ -149.815229879831008, 63.536177779709199 ], [ -149.815596301737003, 63.536216079366298 ], [ -149.815824902315995, 63.536296484739999 ], [ -149.816740442795009, 63.536712312140097 ], [ -149.816999661551989, 63.536808148460899 ], [ -149.817244006003989, 63.536868810537896 ], [ -149.817427159016006, 63.536876184227097 ], [ -149.817533835751988, 63.5368645964856 ], [ -149.817915370914989, 63.536769892431998 ], [ -149.818174894200013, 63.536639256069201 ], [ -149.818480051901986, 63.536444868236202 ], [ -149.819151406033001, 63.536101526116802 ], [ -149.819441355257993, 63.5359986477755 ], [ -149.819654892886007, 63.535949688859702 ], [ -149.819975395608992, 63.535907086980501 ], [ -149.820158377042986, 63.535922301229803 ], [ -149.820402365761993, 63.536014341560403 ], [ -149.820723013115014, 63.536235220568699 ], [ -149.820890887579992, 63.536399127021902 ], [ -149.821104325495014, 63.5365598248233 ], [ -149.821318198194007, 63.536624111856703 ], [ -149.821577355865998, 63.536651546049399 ], [ -149.821790853967997, 63.536636218500497 ], [ -149.822004711396005, 63.536582779976897 ], [ -149.822813543698004, 63.536181604753303 ], [ -149.823286142877009, 63.535964983951203 ], [ -149.823561163, 63.535853832840701 ], [ -149.823820439249005, 63.535773632786402 ], [ -149.82403393106199, 63.535758301963398 ], [ -149.824217213431012, 63.535784730974399 ], [ -149.824430583972998, 63.535877028756197 ], [ -149.824842833432996, 63.536101581761301 ], [ -149.824964840818012, 63.536144234190502 ], [ -149.825178433242996, 63.536181599549103 ], [ -149.825391920566005, 63.536170751314401 ], [ -149.825483513689989, 63.536158737346902 ], [ -149.825636085355001, 63.536117034497302 ], [ -149.826520997774992, 63.535754967260097 ], [ -149.826795646893004, 63.535686403992401 ], [ -149.827741894484006, 63.535536825976102 ], [ -149.828123318254995, 63.535502637176897 ], [ -149.828519951402996, 63.535494659437603 ], [ -149.828764239261005, 63.535464485884397 ], [ -149.828977751736005, 63.535422240374103 ], [ -149.829221735964012, 63.535380845502203 ], [ -149.829756020656987, 63.535316166545002 ], [ -149.830702038280009, 63.535217016466198 ], [ -149.83180059882099, 63.535087363016402 ], [ -149.832380412827007, 63.535037400098503 ], [ -149.832777200484998, 63.535026051810704 ], [ -149.833189029533997, 63.5350599697544 ], [ -149.833271602675012, 63.535074654813599 ], [ -149.833555437965003, 63.535125132494997 ], [ -149.834089254636012, 63.535239812167497 ], [ -149.834257151559001, 63.535265799292802 ], [ -149.834532022562001, 63.535284679716803 ], [ -149.834806453389007, 63.535266549513899 ], [ -149.834943912695991, 63.535246839990997 ], [ -149.835264247434992, 63.5351784148177 ], [ -149.836484770444997, 63.534915347419499 ], [ -149.837141145168005, 63.534758748626899 ], [ -149.837461305634008, 63.534698163330901 ], [ -149.837873347583013, 63.534647986350002 ], [ -149.839017853358001, 63.534556561338597 ], [ -149.841398284656009, 63.5343313828417 ], [ -149.841779549425013, 63.534239976832801 ], [ -149.842023861537996, 63.534117848679102 ], [ -149.842344090275986, 63.533889081578103 ], [ -149.842603496779986, 63.533724768354297 ], [ -149.843244508515994, 63.533381604478997 ], [ -149.843564731864006, 63.533125927596998 ], [ -149.843809006247, 63.533053125778203 ], [ -149.84478535817999, 63.532992854347398 ], [ -149.845090865326995, 63.532957632362901 ], [ -149.845502719528014, 63.5328928546258 ], [ -149.846097681825995, 63.532900441536199 ], [ -149.846219880552013, 63.532897114506099 ], [ -149.847074188269005, 63.532821099568899 ], [ -149.847333830131987, 63.532782354549703 ], [ -149.847623642813005, 63.532701844382203 ], [ -149.848111833151989, 63.5325920958594 ], [ -149.848386400523992, 63.532534704915797 ], [ -149.848615406242004, 63.532507438521897 ], [ -149.848920572028987, 63.5325417109852 ], [ -149.849546289947, 63.532633103618799 ], [ -149.849881928385003, 63.532663735786002 ], [ -149.850187107647002, 63.532653159664697 ], [ -149.850492141381011, 63.532592127488599 ], [ -149.851957144489006, 63.532237075299498 ], [ -149.852247097307014, 63.532137501730297 ], [ -149.852307888099006, 63.532095465893903 ], [ -149.852369156793998, 63.532011960969299 ], [ -149.852460747224001, 63.531858666581797 ], [ -149.852598062800013, 63.5315844375178 ], [ -149.852704567059988, 63.531466313052597 ], [ -149.852781061302011, 63.531420229132003 ], [ -149.852857238437991, 63.5313943165783 ], [ -149.852979275466993, 63.531378647477503 ], [ -149.853086075273012, 63.531374887052202 ], [ -149.853330455658011, 63.531386160318903 ], [ -149.854032331847009, 63.5315076787723 ], [ -149.854550930159007, 63.531618498086402 ], [ -149.854978124891005, 63.531679690496397 ], [ -149.855206959930001, 63.531702860979102 ], [ -149.855512125717013, 63.531699000901597 ], [ -149.855756511490995, 63.531656455533401 ], [ -149.855786983244002, 63.531652816060102 ], [ -149.855924412007994, 63.531599453080602 ], [ -149.855985195612988, 63.531557416051001 ], [ -149.85606152995399, 63.531481055215103 ], [ -149.856092157115995, 63.531435938648798 ], [ -149.856214041431997, 63.531226305413199 ], [ -149.85629053208001, 63.531130889964103 ], [ -149.856488899857993, 63.530978314750101 ], [ -149.856671715103005, 63.530860063252803 ], [ -149.85705351616599, 63.530791059396499 ], [ -149.857694297932994, 63.530752784085799 ], [ -149.858060548260994, 63.530760704293399 ], [ -149.858350473231013, 63.530802382142397 ], [ -149.858792744388012, 63.530924523290203 ], [ -149.858869075135999, 63.530935609751701 ], [ -149.859021890244009, 63.530943212397702 ], [ -149.859220090934997, 63.5309128334329 ], [ -149.859525400451986, 63.530813672852197 ], [ -149.85990656281399, 63.5307110092687 ], [ -149.860425458468001, 63.530588620562099 ], [ -149.860531819896011, 63.530567555665002 ], [ -149.863141591984999, 63.530050655612797 ], [ -149.863385640891011, 63.530012573104798 ], [ -149.86375187684601, 63.529982360518602 ], [ -149.864728407543993, 63.529955601401802 ], [ -149.86521682605499, 63.529924285235303 ], [ -149.86555242766201, 63.529871918438602 ], [ -149.865903406629997, 63.529779615639299 ], [ -149.86645255933999, 63.529623290560501 ], [ -149.866772915637995, 63.529551439989497 ], [ -149.867062966372004, 63.529497809207498 ], [ -149.867551356137, 63.529417154830597 ], [ -149.86817669317, 63.529344775193401 ], [ -149.868939737442986, 63.529230237591797 ], [ -149.870465626564993, 63.528937241197603 ], [ -149.870892756617991, 63.528868335999 ], [ -149.871137110053013, 63.5288526727185 ], [ -149.871289758073999, 63.528852410442397 ], [ -149.871457488809, 63.528868260719896 ], [ -149.871747253878993, 63.528906544965601 ], [ -149.872006566958987, 63.5289708936957 ], [ -149.872174480950008, 63.529039440271802 ], [ -149.872495088776986, 63.529188445729801 ], [ -149.872846021031989, 63.529364073965397 ], [ -149.873105187687003, 63.5294362641582 ], [ -149.873380026348997, 63.529448346224498 ], [ -149.873624063578006, 63.529421458474602 ], [ -149.874264896548993, 63.5292878209763 ], [ -149.874814330431008, 63.529165107832597 ], [ -149.875241426347998, 63.529051344319903 ], [ -149.875943446267996, 63.528845396259399 ], [ -149.876477315939013, 63.528718883998799 ], [ -149.876904744233002, 63.528654455015896 ], [ -149.878720263676996, 63.528422061474501 ], [ -149.879071235458014, 63.528417174256802 ], [ -149.88056656658901, 63.528451712712702 ], [ -149.881436239089993, 63.528455524777897 ], [ -149.881878916286013, 63.528444191890799 ], [ -149.882138314705003, 63.528413229244499 ], [ -149.882443381678002, 63.528348769939598 ], [ -149.882870581799011, 63.528238350366699 ], [ -149.884213329586998, 63.527825807131997 ], [ -149.884869298272008, 63.527700387549302 ], [ -149.885464325247995, 63.527566558988603 ], [ -149.886334009427998, 63.527448142783498 ], [ -149.886761206854004, 63.527364618649003 ], [ -149.887279884218003, 63.527368817686799 ], [ -149.887676733858996, 63.527398807592 ], [ -149.888500759367986, 63.527478678406098 ], [ -149.888836507399986, 63.527490166647297 ], [ -149.889080682968995, 63.527482314807898 ], [ -149.890026416723998, 63.527422028002903 ], [ -149.890553057651999, 63.527397357191703 ], [ -149.891262499453006, 63.527364119297502 ], [ -149.891506493561991, 63.527337200751397 ], [ -149.891811560533995, 63.5272996303922 ], [ -149.892910400451001, 63.527120216849198 ], [ -149.893322382213, 63.527066526235402 ], [ -149.893779781, 63.527044352703598 ], [ -149.894481839547012, 63.527028905463901 ], [ -149.894756462614993, 63.527012914408601 ], [ -149.895427689184999, 63.526956255872499 ], [ -149.896312622266009, 63.526895378495198 ], [ -149.897273955266002, 63.526783904517799 ], [ -149.897563825437999, 63.526780659267096 ], [ -149.897838656016006, 63.5268039058098 ], [ -149.898647356265997, 63.526921416471303 ], [ -149.899120387534992, 63.526963558441999 ], [ -149.899349005180994, 63.526951900198902 ], [ -149.899654186240014, 63.526895258360497 ], [ -149.900005130173014, 63.526777092454203 ], [ -149.900157834789013, 63.52671962614 ], [ -149.900310207925003, 63.526650939838902 ], [ -149.900417232309991, 63.526604550602997 ], [ -149.900615636919014, 63.526551701973901 ], [ -149.900752682101995, 63.526525194728599 ], [ -149.901225723251997, 63.526472038002801 ], [ -149.902004013733006, 63.526413806203799 ], [ -149.902553116137, 63.526403091610398 ], [ -149.902904202902988, 63.526388063300999 ], [ -149.90342303567499, 63.526300281205401 ], [ -149.903895855840005, 63.526212356676901 ], [ -149.904261990284994, 63.526182042754698 ], [ -149.905238765323986, 63.526135965114896 ], [ -149.905528594174001, 63.526112523804898 ], [ -149.906138799984006, 63.526024997156703 ], [ -149.907328795545993, 63.5258804920011 ], [ -149.908015612377994, 63.525788331267997 ], [ -149.908763269409008, 63.525650749779103 ], [ -149.91038058995801, 63.525300441680798 ], [ -149.910990888294009, 63.525193840032102 ], [ -149.911204535516987, 63.525162696448803 ], [ -149.911585864964991, 63.525124933401898 ], [ -149.912822050101994, 63.525028736643598 ], [ -149.91320321336201, 63.524987602215397 ], [ -149.913386215456995, 63.524945525807702 ], [ -149.913630410789011, 63.524880461957601 ], [ -149.914271301252001, 63.524689483366302 ], [ -149.916514220242988, 63.5239571316799 ], [ -149.917658452030992, 63.523613988471197 ], [ -149.918177393499008, 63.523472350278297 ], [ -149.919047244765011, 63.523255101891799 ], [ -149.920454988359012, 63.522928477467701 ], [ -149.921381414622999, 63.522713517446299 ], [ -149.92168661454599, 63.522633291659297 ], [ -149.925272389122995, 63.521786157907499 ], [ -149.925333278728999, 63.521774366979201 ], [ -149.927362607991, 63.521286033467099 ], [ -149.930261651075995, 63.520554576954602 ], [ -149.931055110507998, 63.520371055113799 ], [ -149.931741598557011, 63.520229455699798 ], [ -149.932275651485014, 63.520153205133802 ], [ -149.932886037856008, 63.520092485075601 ], [ -149.933725040974991, 63.520046958365398 ], [ -149.936746298955995, 63.519912867598698 ], [ -149.93728043722399, 63.519874716683702 ], [ -149.937707472054996, 63.519824682258502 ], [ -149.938119519395002, 63.519748453442404 ], [ -149.938577157133011, 63.519638712365101 ], [ -149.939095760834988, 63.519493633321098 ], [ -149.942071240669009, 63.518539833943301 ], [ -149.944588680318986, 63.517711423871802 ], [ -149.945061900235004, 63.517581908769401 ], [ -149.945580582090003, 63.517486137637498 ], [ -149.945946878232007, 63.517455729922403 ], [ -149.948250665269995, 63.517398335367098 ], [ -149.948647433165007, 63.5173754745338 ], [ -149.948830554734997, 63.517352418998897 ], [ -149.949089894764995, 63.517306768944799 ], [ -149.949565475452005, 63.517184238212799 ], [ -149.950585168402995, 63.516883237722503 ], [ -149.950676589949012, 63.516853208323198 ], [ -149.950966567920005, 63.516719825219603 ], [ -149.951119082990004, 63.516651095619302 ], [ -149.951164822510009, 63.516620947800803 ], [ -149.95125632400601, 63.516567378840797 ], [ -149.951775129829002, 63.516277653085702 ], [ -149.95185142644101, 63.516231518190999 ], [ -149.951897333944999, 63.516204737364099 ], [ -149.952110697299986, 63.516071517079197 ], [ -149.952232897822995, 63.515998601231701 ], [ -149.952629725905012, 63.515807578422503 ], [ -149.952675513933002, 63.515793125810397 ], [ -149.952949971710012, 63.515719854315101 ], [ -149.953102601765011, 63.515689241210602 ], [ -149.953300794370989, 63.515671073314799 ], [ -149.95360621527999, 63.515659175301799 ], [ -149.955757565401001, 63.515735421448902 ], [ -149.956794878804999, 63.515800519369797 ], [ -149.958244462332004, 63.515929462882497 ], [ -149.959907883522988, 63.516112383538903 ], [ -149.960594205382989, 63.516170194899601 ], [ -149.960975915717, 63.516158104005697 ], [ -149.961265722109005, 63.516124468843898 ], [ -149.961555472805998, 63.516075136907801 ], [ -149.961952255971994, 63.515976013689802 ], [ -149.962333722862013, 63.515852932824899 ], [ -149.962486311595001, 63.515769621121002 ], [ -149.962562631563003, 63.515734692346904 ], [ -149.962654044125998, 63.515663177361297 ], [ -149.962944146962997, 63.515452426704101 ], [ -149.963081299045001, 63.515311526392502 ], [ -149.963157501333995, 63.515201486224399 ], [ -149.963203408838012, 63.514960588595997 ], [ -149.963233767403011, 63.514586991741901 ], [ -149.963218598451988, 63.514472238253298 ], [ -149.963111818409004, 63.514285503946198 ], [ -149.962944019401988, 63.514022011102902 ], [ -149.962837122578009, 63.513889082707898 ], [ -149.962791309397005, 63.513763410363701 ], [ -149.962822076695005, 63.513633084892298 ], [ -149.962974418391013, 63.513484748190997 ], [ -149.963294796248988, 63.513232217499898 ], [ -149.963706863351007, 63.512988894181397 ], [ -149.964011917747001, 63.512885042646602 ], [ -149.96631596709301, 63.512412613977403 ], [ -149.967200911853013, 63.5122179344351 ], [ -149.967338085494987, 63.512175679738299 ], [ -149.967460206965995, 63.512137502054799 ], [ -149.967566960059997, 63.512103392987001 ], [ -149.96765877416999, 63.512061033549202 ], [ -149.967765485940987, 63.512015713989598 ], [ -149.967902784448995, 63.511965615705499 ], [ -149.968238578295001, 63.511862587410498 ], [ -149.968650391174009, 63.511775063530798 ], [ -149.968955511146987, 63.511737344870397 ], [ -149.969245460371013, 63.5117137879609 ], [ -149.969550580343991, 63.511717544567098 ], [ -149.969703020855007, 63.511729509130099 ], [ -149.969947164084004, 63.511752916579901 ], [ -149.970969595998014, 63.511893745108097 ], [ -149.971244139114987, 63.511904520039998 ], [ -149.971717214401991, 63.511912805672502 ], [ -149.972220687778986, 63.511908459321603 ], [ -149.973273443223007, 63.511855035772498 ], [ -149.973899123411996, 63.511797930451799 ], [ -149.973996305854001, 63.511785354909598 ], [ -149.974372235528989, 63.5117367078184 ], [ -149.974814569568991, 63.511672410770302 ], [ -149.97531814355699, 63.511577255264598 ], [ -149.976569080828, 63.5113251324088 ], [ -149.976767650726998, 63.511294613957197 ], [ -149.976965777755993, 63.511271930539699 ], [ -149.977179534572997, 63.511270966932798 ], [ -149.977393200660003, 63.511286815357501 ], [ -149.977927329045997, 63.511374075893301 ], [ -149.978232400509995, 63.511442831821398 ], [ -149.978415462791986, 63.511495968063699 ], [ -149.978705284455003, 63.511595698617597 ], [ -149.978918955931988, 63.511687772568202 ], [ -149.978949462718987, 63.511702046560103 ], [ -149.97904098397899, 63.511744868493203 ], [ -149.979300485705011, 63.511912162213903 ], [ -149.979422406851995, 63.512018578291404 ], [ -149.979529125808995, 63.512130189681201 ], [ -149.97954466576499, 63.512205715260201 ], [ -149.97952925876001, 63.512274801728502 ], [ -149.979529274030995, 63.512316279010797 ], [ -149.979514037705002, 63.5123887330965 ], [ -149.979498832821008, 63.512430920969798 ], [ -149.979498801380004, 63.512461186998401 ], [ -149.979483643207999, 63.512514586576202 ], [ -149.979483538105001, 63.512526914195298 ], [ -149.979498920856003, 63.512640549679602 ], [ -149.979529062029002, 63.5127175887582 ], [ -149.979605581422987, 63.512812692786603 ], [ -149.979696885289997, 63.512877928383404 ], [ -149.979788782944013, 63.512934211424103 ], [ -149.979910598088992, 63.512976727820799 ], [ -149.980078633353003, 63.512999189930497 ], [ -149.980215779148011, 63.512991673849797 ], [ -149.980444723781005, 63.512941790421102 ], [ -149.980505858627993, 63.512923259395102 ], [ -149.981161891092995, 63.512618080476798 ], [ -149.981192277506011, 63.512603205167302 ], [ -149.981223007074988, 63.512595063969002 ], [ -149.981329508639988, 63.512541882094801 ], [ -149.982611379398008, 63.512148175929298 ], [ -149.983038544484998, 63.512026276526903 ], [ -149.983420006883989, 63.511934533410198 ], [ -149.983572604599999, 63.511908373179899 ], [ -149.983862514298011, 63.511878062092102 ], [ -149.985617088439994, 63.511710039768097 ], [ -149.985983442074001, 63.5116829009147 ], [ -149.986303754354992, 63.511679185171502 ], [ -149.987081950511993, 63.511691144541999 ], [ -149.987508997920003, 63.511725046960102 ], [ -149.989629989475986, 63.5120040123781 ], [ -149.989874230622007, 63.5120453257843 ], [ -149.990224888891987, 63.512122007480997 ], [ -149.990698036942007, 63.512247938260799 ], [ -149.991827240812995, 63.512510313235403 ], [ -149.992010040786994, 63.512567907927497 ], [ -149.992086373332, 63.5126136765398 ], [ -149.992147635739002, 63.5126590404236 ], [ -149.99231532155801, 63.512774520361901 ], [ -149.992345908294993, 63.5128044875445 ], [ -149.992422293841003, 63.512861466651799 ], [ -149.992467970478003, 63.512896322418101 ], [ -149.992483090921013, 63.512907938727203 ], [ -149.992711956502006, 63.513083351870598 ], [ -149.992864642253011, 63.513246630943897 ], [ -149.992879815696, 63.5132694578243 ], [ -149.992940860711002, 63.513334992456201 ], [ -149.993261303248005, 63.513761722095403 ], [ -149.993276720134986, 63.513803612673598 ], [ -149.993505508460998, 63.514162863694203 ], [ -149.993902314085005, 63.514670110593201 ], [ -149.993993776953999, 63.5147274934073 ], [ -149.994070117583988, 63.514773260160197 ], [ -149.994161681064014, 63.514818314940797 ], [ -149.994451446134008, 63.514921375436003 ], [ -149.994756526581, 63.515009152474803 ], [ -149.996343547853996, 63.515428380910897 ], [ -149.99660274774601, 63.515471204866799 ], [ -149.996938525422991, 63.515509356059098 ], [ -149.998006669906005, 63.515570508909299 ], [ -149.998037136269005, 63.5155735675499 ], [ -149.998667278390002, 63.515588681275801 ], [ -149.998830544497991, 63.515592596813903 ], [ -150.00002056161901, 63.515600952684203 ], [ -150.000981983552009, 63.515631198927402 ], [ -150.002645088536013, 63.515669021809302 ], [ -150.003453786989013, 63.5157030056343 ], [ -150.003774130711008, 63.515729516923699 ], [ -150.004567386226, 63.515844912734401 ], [ -150.005147405049001, 63.5159433882326 ], [ -150.005498119013993, 63.516015547084201 ], [ -150.005681277415988, 63.516073133904001 ], [ -150.005803491412991, 63.516122363690499 ], [ -150.005894922841009, 63.516168528005402 ], [ -150.005971110757002, 63.516210921809702 ], [ -150.006215325851997, 63.516359818802101 ], [ -150.006398168047014, 63.5164779285004 ], [ -150.006474473641987, 63.5165124782039 ], [ -150.006672996828001, 63.5165962572353 ], [ -150.006871443656991, 63.516634073630797 ], [ -150.00774117544799, 63.516748134219696 ], [ -150.009236261338003, 63.516977553938403 ], [ -150.010975540763013, 63.517221329972898 ], [ -150.01125030935799, 63.517263420974402 ], [ -150.011921738049011, 63.517362069438001 ], [ -150.012959128709014, 63.517499633606903 ], [ -150.015385090219013, 63.5177437588926 ], [ -150.015690416804006, 63.517774327733299 ], [ -150.016010503607987, 63.517805289106199 ], [ -150.016361549949011, 63.517842681692997 ], [ -150.016392160043011, 63.517842377255299 ], [ -150.017155081247012, 63.517931112299998 ], [ -150.018711276830999, 63.518086958665798 ], [ -150.019214584919013, 63.518121678667796 ], [ -150.019550558427994, 63.518128395458703 ], [ -150.022617377164011, 63.5180868268775 ], [ -150.026111414886003, 63.518006126223 ], [ -150.026813111411997, 63.518006867284299 ], [ -150.027301356549003, 63.518041158770302 ], [ -150.027759011354988, 63.518106021504799 ], [ -150.028201375039004, 63.518186169489198 ], [ -150.029701124083999, 63.518506138698903 ], [ -150.030200196614004, 63.518612609511003 ], [ -150.03062757190699, 63.518677778580198 ], [ -150.030894340105988, 63.518702477759902 ], [ -150.031106400005001, 63.518720932132197 ], [ -150.031271553473005, 63.518731019924502 ], [ -150.031651059340987, 63.5187425377243 ], [ -150.034702845668988, 63.518858409640004 ], [ -150.037371367577009, 63.518960053989701 ], [ -150.038805382400994, 63.519005956155702 ], [ -150.041689172092987, 63.519055538983999 ], [ -150.041957497970003, 63.519060488289597 ], [ -150.044328856284011, 63.519104203646798 ], [ -150.044389925552991, 63.519104700739597 ], [ -150.044526973431999, 63.519104968713002 ], [ -150.044588194515995, 63.519104348648902 ], [ -150.044618653692993, 63.519105156174298 ], [ -150.044694947609997, 63.519104935066103 ], [ -150.044740630534989, 63.519105024390598 ], [ -150.044832460815002, 63.5191040950955 ], [ -150.044939005499998, 63.519096828968102 ], [ -150.044969752137007, 63.519093159853497 ], [ -150.045030586048, 63.5190813201461 ], [ -150.045137267276004, 63.519070694527301 ], [ -150.045229088572995, 63.519043982456303 ], [ -150.045747662629992, 63.5189063916824 ], [ -150.045991749265994, 63.518829907659097 ], [ -150.046281765863995, 63.5187187682874 ], [ -150.046342689606007, 63.518696842626802 ], [ -150.046556556018004, 63.5186083470971 ], [ -150.046647987445994, 63.518570415150201 ], [ -150.047105641353994, 63.5183605880367 ], [ -150.047197356649008, 63.5183181785982 ], [ -150.047227821214989, 63.518295445482103 ], [ -150.047258313628987, 63.518277197128199 ], [ -150.047319177184988, 63.518246301560097 ], [ -150.047364999349014, 63.5182194913789 ], [ -150.047425925786996, 63.518174025371998 ], [ -150.047456390353005, 63.518151292141098 ], [ -150.047487031886988, 63.518131926500097 ], [ -150.047517674320005, 63.518112561246497 ], [ -150.047609242291998, 63.518047729370998 ], [ -150.047654990794001, 63.518009707751801 ], [ -150.047700664735999, 63.517960474410302 ], [ -150.047731340407012, 63.517922054102897 ], [ -150.047746344068997, 63.517887701986901 ], [ -150.047868395470999, 63.517658900064603 ], [ -150.047898957954004, 63.5175790021637 ], [ -150.047990569044998, 63.5172316959003 ], [ -150.048051649992999, 63.516945233672601 ], [ -150.048158291694989, 63.516544521347903 ], [ -150.048326348518003, 63.516174578258003 ], [ -150.048616192639997, 63.515537715934997 ], [ -150.048692261079992, 63.5152404406046 ], [ -150.048692312284004, 63.515080149902097 ], [ -150.048661891735009, 63.514820409373598 ], [ -150.04864656018799, 63.514756110856901 ], [ -150.048646563781006, 63.514732571661597 ], [ -150.048585635546999, 63.514415977474599 ], [ -150.048585384018992, 63.514401399163198 ], [ -150.04858548912199, 63.514393555340199 ], [ -150.048585492715006, 63.514370016246701 ], [ -150.048570199795989, 63.514359522682703 ], [ -150.048570161167987, 63.514305717516798 ], [ -150.048555049708, 63.514275052416899 ], [ -150.048554937418999, 63.514233574775197 ], [ -150.048539860993003, 63.514160315302099 ], [ -150.048524363257997, 63.514118430054801 ], [ -150.048524425241993, 63.5141038604052 ], [ -150.048524523157994, 63.514046695081099 ], [ -150.048463377531988, 63.513600067740398 ], [ -150.048387095293009, 63.5125892144845 ], [ -150.048365070399001, 63.512120886444897 ], [ -150.048341177009007, 63.511612792925199 ], [ -150.048325852647991, 63.511212216499203 ], [ -150.048341417757001, 63.510879713395298 ], [ -150.048402365753986, 63.510478915526498 ], [ -150.048478664163014, 63.510170438498498 ], [ -150.04872260527199, 63.509579444901298 ], [ -150.048860074460009, 63.509338722218601 ], [ -150.049043207707996, 63.509098088465301 ], [ -150.049271929559012, 63.508869870437202 ], [ -150.049393948622992, 63.508763250286499 ], [ -150.049790615007993, 63.508468858428401 ], [ -150.050523046492998, 63.507953563592103 ], [ -150.050950242123008, 63.507675670193102 ], [ -150.051270459183002, 63.507500312785702 ], [ -150.052262387003992, 63.506961611153599 ], [ -150.052704813569989, 63.5067368007048 ], [ -150.052781027537009, 63.506706309407598 ], [ -150.052872594610989, 63.506671741023702 ], [ -150.052902937005996, 63.506656850994901 ], [ -150.052964115869997, 63.5066304462906 ], [ -150.05300980867699, 63.506611477975198 ], [ -150.053040300193004, 63.506595470669303 ], [ -150.053406441823995, 63.506462797829101 ], [ -150.053436963883001, 63.506451274272898 ], [ -150.053498007101012, 63.506428228749598 ], [ -150.053528707923988, 63.5064200725663 ], [ -150.053574399832996, 63.506401104912698 ], [ -150.053848942949998, 63.506298515383698 ], [ -150.053879643773001, 63.506290359163401 ], [ -150.053955887385001, 63.506264352053499 ], [ -150.054413417325009, 63.506095982113102 ], [ -150.054550984429, 63.506042452712798 ], [ -150.054581222619987, 63.506035406072797 ], [ -150.054749130322989, 63.505966984968197 ], [ -150.055130601705002, 63.505806690288097 ], [ -150.057404005924013, 63.5047570657688 ], [ -150.058471862946988, 63.504292074685601 ], [ -150.059189035649013, 63.503990435692998 ], [ -150.059265417601011, 63.503963309540801 ], [ -150.059768935893999, 63.503761390927899 ], [ -150.060806103771, 63.503384125877801 ], [ -150.064727573379997, 63.501975497032099 ], [ -150.065673269406005, 63.501659681222698 ], [ -150.06622239875901, 63.501507144802403 ], [ -150.066787218985013, 63.501399855871099 ], [ -150.06718164048101, 63.501330723850799 ], [ -150.068160308269995, 63.501159182073302 ], [ -150.06835872725199, 63.5011094859927 ], [ -150.068572228048993, 63.501041132447703 ], [ -150.06883154382399, 63.500907853025602 ], [ -150.069060469591989, 63.500716606191297 ], [ -150.069228276683987, 63.500556255588897 ], [ -150.069395973283008, 63.500446342524697 ], [ -150.069472357031998, 63.500400155591898 ], [ -150.069579079582013, 63.500362614700499 ], [ -150.069670686182008, 63.5003392472142 ], [ -150.069777653073999, 63.500335339604597 ], [ -150.069930272349012, 63.5003315129604 ], [ -150.070479203175012, 63.500373992810403 ], [ -150.070738740834003, 63.500380826808801 ], [ -150.070860769778989, 63.500377315215999 ], [ -150.07099834496799, 63.500354036323301 ], [ -150.071211634661012, 63.500301365944701 ], [ -150.07148615891299, 63.500190900767301 ], [ -150.07165435497501, 63.500129196306702 ], [ -150.071944085908996, 63.500060603127302 ], [ -150.072462773154001, 63.500022695835398 ], [ -150.072722340457005, 63.499991418163297 ], [ -150.073942860772007, 63.499713051665701 ], [ -150.076262015290013, 63.499080225337401 ], [ -150.07662811290399, 63.4989889725396 ], [ -150.077070631097996, 63.498900849222899 ], [ -150.078443722179998, 63.498748634779297 ], [ -150.079649162475988, 63.498625630761801 ], [ -150.080167926077991, 63.498560798321897 ], [ -150.080701906243007, 63.498454891271102 ], [ -150.08149533064099, 63.4982638841579 ], [ -150.082502192953996, 63.498004498521396 ], [ -150.082746327199999, 63.497927963304598 ], [ -150.08349394111201, 63.497638226767499 ], [ -150.083524624868005, 63.497630064867103 ], [ -150.083646445402991, 63.497580581516502 ], [ -150.084607815233994, 63.497184362873597 ], [ -150.086499499236993, 63.4963215992098 ], [ -150.087338673035987, 63.495875083854799 ], [ -150.088223816322994, 63.495433131672499 ], [ -150.088788388615001, 63.495119517405797 ], [ -150.089444220756008, 63.494803810611103 ], [ -150.090146034962004, 63.494433262669403 ], [ -150.090512239475004, 63.494269125513199 ], [ -150.091580195313014, 63.493948517804903 ], [ -150.092358412132, 63.493723433330402 ], [ -150.093183140122989, 63.493514610699201 ], [ -150.093365370563987, 63.4934684682868 ], [ -150.094082347434011, 63.493296694471198 ], [ -150.094936970459003, 63.493079203163802 ], [ -150.095455511278999, 63.493003106193697 ], [ -150.096111842883005, 63.492937339667797 ], [ -150.096691611076011, 63.492907675983197 ], [ -150.097225529257003, 63.492910435956503 ], [ -150.098156364451995, 63.493002036928097 ], [ -150.098919196724012, 63.493090359256797 ], [ -150.099376839851999, 63.493162852906501 ], [ -150.099834764153002, 63.4932880317835 ], [ -150.100322811659993, 63.493433051573298 ], [ -150.100765441244988, 63.493547740482001 ], [ -150.101116288160995, 63.493658908493401 ], [ -150.10145185832701, 63.493799940120297 ], [ -150.102031591485002, 63.494066161352997 ], [ -150.102397828338013, 63.494215836540697 ], [ -150.102901522700989, 63.4943903991391 ], [ -150.103328431769, 63.494497943713803 ], [ -150.105312155359996, 63.494852375100798 ], [ -150.106761540358008, 63.495061695489497 ], [ -150.107249850172991, 63.4951192724591 ], [ -150.107402259243003, 63.495131094443302 ], [ -150.107707345080001, 63.495131208297401 ], [ -150.108012509069994, 63.495085368365103 ], [ -150.110286097443009, 63.494588720152301 ], [ -150.111155794198993, 63.494382738644902 ], [ -150.111247255270996, 63.494348134898502 ], [ -150.112238710578993, 63.494039960697599 ], [ -150.112605035466999, 63.493940784627299 ], [ -150.113795077741997, 63.493673643329203 ], [ -150.114252747818995, 63.493528646409899 ], [ -150.114710611932992, 63.4934060693476 ], [ -150.115152969327994, 63.493322317280501 ], [ -150.115565076855006, 63.493277006066997 ], [ -150.115870257913002, 63.493218821998198 ], [ -150.116007585167011, 63.493139455074697 ], [ -150.116083590724998, 63.493078666728302 ], [ -150.116129443431987, 63.492959929801202 ], [ -150.116160032864002, 63.492746644874003 ], [ -150.116221076083008, 63.4925363946058 ], [ -150.116327743835996, 63.492395703950599 ], [ -150.116556775606, 63.492258198031003 ], [ -150.117075541903006, 63.492002698292403 ], [ -150.117578916465988, 63.491727743754403 ], [ -150.117655142111005, 63.491674805678997 ], [ -150.118372247438998, 63.491220472163498 ], [ -150.118647136407986, 63.491021390421203 ], [ -150.119028159529989, 63.490747731553697 ], [ -150.119191129194007, 63.490619501084801 ], [ -150.119669338351997, 63.490243220840803 ], [ -150.120340526294996, 63.489694655403298 ], [ -150.120569349655995, 63.489503339113597 ], [ -150.12085910933601, 63.4892172157586 ], [ -150.121118528417014, 63.489011003059098 ], [ -150.122049338458993, 63.488321233296404 ], [ -150.122567943060005, 63.488008551878302 ], [ -150.122811982982995, 63.487820991670503 ], [ -150.122918790873996, 63.4876836642378 ], [ -150.122964530393006, 63.487539144992603 ], [ -150.12293429220199, 63.487385925251502 ], [ -150.122873080099993, 63.487310359288301 ], [ -150.122598571118999, 63.487092507226798 ], [ -150.12221706649899, 63.486833764042103 ], [ -150.122003473175994, 63.486657844367002 ], [ -150.121682960571007, 63.486344644681999 ], [ -150.121591624363987, 63.486249239956898 ], [ -150.121560790590991, 63.486150925909797 ], [ -150.121728703683004, 63.4860779549009 ], [ -150.121865968954012, 63.4860322071168 ], [ -150.12223215999299, 63.485933008065999 ], [ -150.122567994263989, 63.4858756094889 ], [ -150.122888338883996, 63.485857037236897 ], [ -150.123208860472005, 63.485875455896497 ], [ -150.123742673549998, 63.485966667968903 ], [ -150.124398957544003, 63.486127187885103 ], [ -150.124810937509011, 63.4862185920447 ], [ -150.125558360079992, 63.486329917696601 ], [ -150.125634482419002, 63.486337498943101 ], [ -150.125787336155014, 63.486333623504798 ], [ -150.126061994255991, 63.4862914415869 ], [ -150.126336614628002, 63.486211149118503 ], [ -150.126687531612987, 63.486089125356699 ], [ -150.126916272328003, 63.485981861531201 ], [ -150.127175800104993, 63.485829443512699 ], [ -150.127450248000997, 63.485764836686499 ], [ -150.127785819964004, 63.485730958788601 ], [ -150.128258973404002, 63.485737638285499 ], [ -150.128640481616998, 63.485787891664302 ], [ -150.128915192719006, 63.485802867965802 ], [ -150.129174533645994, 63.485783820851999 ], [ -150.129265903988994, 63.485761533434903 ], [ -150.12935750789299, 63.485696661376302 ], [ -150.129540379731992, 63.485547854307399 ], [ -150.129632169588007, 63.485486349613602 ], [ -150.129693236163007, 63.485459913306201 ], [ -150.12979989313601, 63.4854290568138 ], [ -150.129967762212004, 63.485387459467802 ], [ -150.129998230371001, 63.485375920590897 ], [ -150.130349357560988, 63.485295366082703 ], [ -150.130654370635, 63.485196801717798 ], [ -150.130989976732991, 63.485032901455398 ], [ -150.131569876978006, 63.484784551423502 ], [ -150.131707289572006, 63.484723108451703 ], [ -150.131905493857005, 63.484673328435001 ], [ -150.132103949668988, 63.484650455433297 ], [ -150.132256420722001, 63.484639838654999 ], [ -150.13242436345999, 63.484624019956897 ], [ -150.132561485, 63.484632058843601 ], [ -150.132973576355994, 63.484616966027602 ], [ -150.133721310643011, 63.484627385902698 ], [ -150.133949792643989, 63.484613134069598 ], [ -150.134651799987012, 63.4845136445511 ], [ -150.134834924252999, 63.484494853647298 ], [ -150.135490934259991, 63.484506250108304 ], [ -150.136147275745998, 63.484486269703297 ], [ -150.136421575420002, 63.484475443118001 ], [ -150.136498173865988, 63.484467340421197 ], [ -150.136543697789989, 63.484456190186002 ], [ -150.136711503084996, 63.484376475682502 ], [ -150.13678808715801, 63.484284311664403 ], [ -150.136818407095006, 63.484158444048703 ], [ -150.136818467282012, 63.484032914766303 ], [ -150.136757533657999, 63.483692849328101 ], [ -150.136711570458004, 63.483575094091798 ], [ -150.136528700415994, 63.483322656220999 ], [ -150.136452390328998, 63.483162644744198 ], [ -150.136421625726001, 63.4830105373577 ], [ -150.136452125326002, 63.482953044677899 ], [ -150.136543632213005, 63.482831005002097 ], [ -150.136747980973013, 63.482665237431597 ], [ -150.136848904899011, 63.482583367794199 ], [ -150.137840452733002, 63.481843534832898 ], [ -150.137855943282005, 63.481823761129 ], [ -150.137916887686004, 63.481786111599703 ], [ -150.137932025196989, 63.4817786578935 ], [ -150.138221914234009, 63.4815642438857 ], [ -150.138389918055992, 63.4814419435912 ], [ -150.138572934524007, 63.481332359679698 ], [ -150.138679812482991, 63.481277965647301 ], [ -150.138740944635003, 63.481243682946598 ], [ -150.138786625763998, 63.4812168448343 ], [ -150.138878073362008, 63.481172139726297 ], [ -150.138939035731994, 63.4811367306352 ], [ -150.139381484755006, 63.480908332481398 ], [ -150.139427395853005, 63.480889347083497 ], [ -150.139488213594007, 63.480855055092597 ], [ -150.139732334365988, 63.480725757039401 ], [ -150.139869875419009, 63.480648619214499 ], [ -150.140114024039008, 63.480473367409303 ], [ -150.140403737903995, 63.480195060622997 ], [ -150.140693584719997, 63.479947017925497 ], [ -150.14081576727699, 63.479854911826401 ], [ -150.141181908909005, 63.4796346215402 ], [ -150.141487095357007, 63.479466551891598 ], [ -150.142310877422005, 63.4791034303462 ], [ -150.143226413409991, 63.4787146562714 ], [ -150.143531556738992, 63.4785925359269 ], [ -150.143592514618007, 63.478573937683201 ], [ -150.144187560458988, 63.478359561816198 ], [ -150.144950585868003, 63.478138318549803 ], [ -150.146262453168987, 63.4778225396674 ], [ -150.146705155517992, 63.477726384047799 ], [ -150.147086611627998, 63.477619678116703 ], [ -150.148108741708, 63.477368128340501 ], [ -150.150031152585996, 63.476944801724898 ], [ -150.151511290510001, 63.476631083629201 ], [ -150.152091056905988, 63.476528363504798 ], [ -150.152243520772004, 63.476490828953501 ], [ -150.152319745519009, 63.476463655425597 ], [ -150.152594532080002, 63.4763373718746 ], [ -150.152869176706986, 63.4761662516743 ], [ -150.153403051768009, 63.4757731784821 ], [ -150.153616746600989, 63.475574706826997 ], [ -150.153921891727009, 63.475227288754802 ], [ -150.154074329541999, 63.4750328403222 ], [ -150.154364121561002, 63.474609932069797 ], [ -150.154593142550993, 63.4743008970893 ], [ -150.154837211221007, 63.473992249930802 ], [ -150.154867814128011, 63.473965019466597 ], [ -150.154913587783, 63.473903435690701 ], [ -150.154928648936988, 63.473889253935504 ], [ -150.154974533982994, 63.4738388809456 ], [ -150.154989940091014, 63.473812379304398 ], [ -150.155035559236012, 63.473766482706097 ], [ -150.155096428180997, 63.473709771419401 ], [ -150.155111949271998, 63.4736944806642 ], [ -150.155127108343009, 63.473674697713598 ], [ -150.155157564824009, 63.473648584277903 ], [ -150.155187977287994, 63.473617986646097 ], [ -150.15520330614001, 63.473599328196897 ], [ -150.155279717736988, 63.4735295688306 ], [ -150.155310174217988, 63.473503455262502 ], [ -150.155386629832009, 63.473438179061198 ], [ -150.155615382225989, 63.473259148275503 ], [ -150.155798280115988, 63.473118162117203 ], [ -150.156317280872997, 63.472797548606898 ], [ -150.156683208705999, 63.472591791977798 ], [ -150.157125695458006, 63.4723779205233 ], [ -150.157528668915006, 63.472232514640403 ], [ -150.158254690023, 63.471996810973998 ], [ -150.16094025836199, 63.471214198167701 ], [ -150.161580919753987, 63.471012143158298 ], [ -150.161779260582989, 63.470928708640201 ], [ -150.161886055897014, 63.470874297623801 ], [ -150.16190142696999, 63.470860123193702 ], [ -150.162023422677009, 63.470790413720501 ], [ -150.162206511009998, 63.470657271633101 ], [ -150.162374316305005, 63.470501320036497 ], [ -150.162526733459003, 63.470146594245499 ], [ -150.162755567599987, 63.469951866105198 ], [ -150.162877721410013, 63.469897850065401 ], [ -150.162908283892989, 63.469882946082301 ], [ -150.163015092682002, 63.469845347034997 ], [ -150.163320259366998, 63.469772506138199 ], [ -150.165639388731989, 63.469333430516699 ], [ -150.168584028504, 63.468742283228899 ], [ -150.173512212204002, 63.467769396064597 ], [ -150.173634313013991, 63.467742269625901 ], [ -150.174107375723992, 63.467635611510097 ], [ -150.174641110648992, 63.467502488846897 ], [ -150.175190609209011, 63.467349595894902 ], [ -150.176502599580004, 63.466960726619803 ], [ -150.177143497229991, 63.466784393706199 ], [ -150.177235084964991, 63.4667620862595 ], [ -150.178592895702991, 63.466555938288401 ], [ -150.182407179230012, 63.466135886352902 ], [ -150.18504675382701, 63.465831375623203 ], [ -150.185600729590988, 63.465774427482302 ], [ -150.18667912295399, 63.465663564749299 ], [ -150.187152401259993, 63.465625237800403 ], [ -150.187640488292999, 63.465594013167902 ], [ -150.188174587932991, 63.465571809133401 ], [ -150.18930364717599, 63.465560331283399 ], [ -150.189608819250992, 63.465567012282797 ], [ -150.190539587972012, 63.465605372618299 ], [ -150.191332726706008, 63.465667108298902 ], [ -150.192187300324008, 63.465742737496498 ], [ -150.192782502471005, 63.465788201922301 ], [ -150.193163805868011, 63.465792336580598 ], [ -150.193621711305013, 63.4657804956368 ], [ -150.194018187246996, 63.4657547550309 ], [ -150.194323551561013, 63.4657233262744 ], [ -150.194674363442999, 63.465678486581702 ], [ -150.194979273210009, 63.465621267253198 ], [ -150.195559052182006, 63.465483644952997 ], [ -150.196383018402003, 63.465269317428003 ], [ -150.197405286822004, 63.464995041974198 ], [ -150.19749680089501, 63.4649682367683 ], [ -150.197771330537989, 63.464900150717803 ], [ -150.197893513093987, 63.464869645260499 ], [ -150.198427613632987, 63.464727484817303 ], [ -150.198473396271993, 63.464716324073699 ], [ -150.198748181035995, 63.464643760272203 ], [ -150.199526044815997, 63.464430481539601 ], [ -150.200212779901989, 63.464250740204797 ], [ -150.200456941097997, 63.464186357915501 ], [ -150.200487243069006, 63.464178163985302 ], [ -150.200853581432, 63.464083273631502 ], [ -150.201097623151014, 63.464022249303802 ], [ -150.201158709488993, 63.464006995509202 ], [ -150.20144841437201, 63.4639650663946 ], [ -150.201951998242009, 63.463896085793998 ], [ -150.202303039193993, 63.4638736496753 ], [ -150.202470880421004, 63.463862236159997 ], [ -150.202653909464999, 63.463850088601298 ], [ -150.203004820161993, 63.4638433377702 ], [ -150.205842741874989, 63.4639156054117 ], [ -150.206666609279011, 63.463953386832699 ], [ -150.207170162607014, 63.464014392444703 ], [ -150.207353321906993, 63.464052675398499 ], [ -150.207566924213012, 63.464120871423397 ], [ -150.208177119243004, 63.464372869626096 ], [ -150.208207661963002, 63.464384853623201 ], [ -150.208299135612009, 63.464434251589502 ], [ -150.208390868873011, 63.464479173497097 ], [ -150.208406049502997, 63.464490766559599 ], [ -150.208589097411988, 63.4645716321238 ], [ -150.208695923269005, 63.464594522795501 ], [ -150.20878750651201, 63.464613663489402 ], [ -150.208879097840992, 63.464620475942297 ], [ -150.208985988376014, 63.464635522728798 ], [ -150.209077435973995, 63.464643452056599 ], [ -150.209184327407996, 63.464658498831 ], [ -150.209946868624996, 63.4648459995256 ], [ -150.210679368381989, 63.465010317715802 ], [ -150.211274551665014, 63.4651050199884 ], [ -150.212266294433988, 63.4652344516862 ], [ -150.212510367595002, 63.4652810004659 ], [ -150.212662894343993, 63.465337549881703 ], [ -150.212754493756989, 63.465383586018298 ], [ -150.212815498347993, 63.465452380034797 ], [ -150.212830819114998, 63.465475183318702 ], [ -150.21284600154101, 63.465486776780303 ], [ -150.21284601591401, 63.465604453219697 ], [ -150.212846033880993, 63.4657613557236 ], [ -150.212846107542987, 63.465780410158501 ], [ -150.212846102153009, 63.465883517221798 ], [ -150.21301397931299, 63.466340556960603 ], [ -150.213105408943989, 63.466437020938898 ], [ -150.213197030814996, 63.466497625978398 ], [ -150.213395505492002, 63.466608016767097 ], [ -150.213517290095012, 63.466661543019903 ], [ -150.213568540778994, 63.466683690027502 ], [ -150.213776731633999, 63.466772360552604 ], [ -150.214005599012012, 63.466920506515599 ], [ -150.214051438245008, 63.467004604419003 ], [ -150.214051410396991, 63.467053916400602 ], [ -150.214051599941001, 63.467069610790503 ], [ -150.214051360090991, 63.467191764695997 ], [ -150.21397528176999, 63.467405012411199 ], [ -150.213944662692995, 63.467516307398498 ], [ -150.213960015800012, 63.467580579065299 ], [ -150.213960043648001, 63.467634374764003 ], [ -150.213990550435, 63.467668771293802 ], [ -150.214036301632007, 63.467706917738298 ], [ -150.214112412292991, 63.467741351901097 ], [ -150.214204009011013, 63.467760488884601 ], [ -150.214280419709013, 63.467768032921498 ], [ -150.214356776507998, 63.467771093071299 ], [ -150.214417545739991, 63.467768153706302 ], [ -150.214478695857991, 63.467745050488297 ], [ -150.214524598871009, 63.4677181972977 ], [ -150.214570305152989, 63.467687978148497 ], [ -150.214600846075996, 63.467660734860203 ], [ -150.214722888495004, 63.467515898090802 ], [ -150.214951825941995, 63.4670767822128 ], [ -150.215073840514009, 63.466814267093703 ], [ -150.215073650969003, 63.466798572964997 ], [ -150.215165130906001, 63.466654080555202 ], [ -150.215623023766, 63.465959647477199 ], [ -150.215668735437987, 63.465853217880003 ], [ -150.215668661775993, 63.465834164296197 ], [ -150.215729727451986, 63.465688899313797 ], [ -150.215729589111987, 63.465677688380502 ], [ -150.215805916266987, 63.465563070621798 ], [ -150.215821282847998, 63.465551132867397 ], [ -150.215836513782989, 63.4655279845175 ], [ -150.215897500408005, 63.465479099709299 ], [ -150.215973801512007, 63.465413793555797 ], [ -150.216721427101987, 63.464978877305903 ], [ -150.216782493676988, 63.4649367188577 ], [ -150.216843416520987, 63.464895678020099 ], [ -150.216965488585004, 63.464819204614301 ], [ -150.217148624527994, 63.464700573010397 ], [ -150.217224936412009, 63.464662163704403 ], [ -150.217377398482, 63.464559563926898 ], [ -150.217606229926986, 63.464410710641999 ], [ -150.217835118864997, 63.464254014638598 ], [ -150.217850341716002, 63.464243194036399 ], [ -150.217865450481014, 63.4642357317435 ], [ -150.217911604123003, 63.464204402051699 ], [ -150.218353810601997, 63.463899578593399 ], [ -150.218735428408991, 63.463434074544402 ], [ -150.218903088177001, 63.463281426339599 ], [ -150.219253960245993, 63.463056096714801 ], [ -150.219345545285989, 63.462999021843302 ], [ -150.219528600381011, 63.462888230230398 ], [ -150.220230569096998, 63.462533954663499 ], [ -150.220337258410012, 63.462469417602399 ], [ -150.220581284858014, 63.462297411309201 ], [ -150.220733900540012, 63.4621712775199 ], [ -150.22081009923599, 63.462099242675301 ], [ -150.220855933078013, 63.462067903820902 ], [ -150.220871153233986, 63.462057082793301 ], [ -150.221130789708013, 63.461880988968602 ], [ -150.222992152875008, 63.460759264294097 ], [ -150.223632706469999, 63.460286865566999 ], [ -150.224212302186004, 63.459890249012901 ], [ -150.224670203131012, 63.4595353767834 ], [ -150.224853343565997, 63.459359581332102 ], [ -150.224929426378992, 63.459192280808999 ], [ -150.224975271001, 63.458924471495997 ], [ -150.225036216304005, 63.458787047388903 ], [ -150.225173641473987, 63.458639232616399 ], [ -150.225402561853002, 63.458466838016797 ], [ -150.225555163161999, 63.458367597504299 ], [ -150.225982137806, 63.458173320650602 ], [ -150.226119483026991, 63.458119642839002 ], [ -150.226500855593997, 63.457974642559002 ], [ -150.226806116602006, 63.4578568524473 ], [ -150.227523347695012, 63.457524228724203 ], [ -150.227690945478997, 63.457460107879598 ], [ -150.227797767742999, 63.457421346439297 ], [ -150.227889544123997, 63.4573945309264 ], [ -150.228011294590999, 63.4573718364108 ], [ -150.228148742218991, 63.4573641081885 ], [ -150.228835382981003, 63.457315364381401 ], [ -150.228987818102013, 63.457303531972002 ], [ -150.229140623327993, 63.457283863731803 ], [ -150.229293144687006, 63.457254101623398 ], [ -150.229415121529996, 63.457212359713502 ], [ -150.229537212458013, 63.457154930768098 ], [ -150.229644004178994, 63.457089270019999 ], [ -150.229720050161006, 63.457032917460403 ], [ -150.229750625219992, 63.456948517272103 ], [ -150.229766097803008, 63.456883907398797 ], [ -150.229735586523987, 63.456787876068901 ], [ -150.229674417541986, 63.456720206909999 ], [ -150.229552305952012, 63.456639788031097 ], [ -150.229430336295991, 63.456570581425296 ], [ -150.229170979197988, 63.456513587152003 ], [ -150.228942137871002, 63.456490985472598 ], [ -150.228880939243993, 63.456482712262698 ], [ -150.228255267141009, 63.456445584151602 ], [ -150.227858754366991, 63.456418737616502 ], [ -150.227782369719989, 63.456411199819797 ], [ -150.227553613732994, 63.4563953229502 ], [ -150.227233174790001, 63.456376003738498 ], [ -150.226699078742996, 63.456345669840204 ], [ -150.226348210267986, 63.456323337393798 ], [ -150.226103956544989, 63.456308185876203 ], [ -150.224853031851012, 63.456228310995598 ], [ -150.224670038738992, 63.456201260726203 ], [ -150.224547932538997, 63.456170148649697 ], [ -150.224471523637988, 63.456148040070701 ], [ -150.224410616065001, 63.456112876182601 ], [ -150.224380165871992, 63.456082965928601 ], [ -150.224364842410012, 63.4560601631878 ], [ -150.224364705866009, 63.456036625386503 ], [ -150.224380098497988, 63.4560022734819 ], [ -150.224395372553005, 63.455983608358302 ], [ -150.224425634997999, 63.455960839661103 ], [ -150.224502111273011, 63.4559381223306 ], [ -150.224593512159004, 63.455919144038397 ], [ -150.224669815059002, 63.455907628996101 ], [ -150.224731012787998, 63.455903576409803 ], [ -150.225188518473999, 63.455923010753502 ], [ -150.225646477808993, 63.455941334688802 ], [ -150.226134615147998, 63.455930163693402 ], [ -150.226760367200995, 63.455887732578503 ], [ -150.226989153731012, 63.455868870270599 ], [ -150.227629835784995, 63.455793192089999 ], [ -150.227858620517992, 63.455762000484903 ], [ -150.227950077098996, 63.4557475050362 ], [ -150.228362344526005, 63.455670525842599 ], [ -150.228560442808998, 63.455628469697402 ], [ -150.229003191869992, 63.455571311763798 ], [ -150.229048890065997, 63.455567985352303 ], [ -150.229552180187994, 63.455529168358098 ], [ -150.229567337460992, 63.455526189196199 ], [ -150.229811814864007, 63.455509961369401 ], [ -150.230360800487006, 63.455480142818999 ], [ -150.230742343733993, 63.4554763454951 ], [ -150.231489992680991, 63.455498616779003 ], [ -150.232039207373987, 63.455548367304999 ], [ -150.232619139060006, 63.4556358756235 ], [ -150.233015849462987, 63.455727715693797 ], [ -150.233305467208993, 63.455823571937302 ], [ -150.233580186396011, 63.4559302580329 ], [ -150.233854825632989, 63.456067200478003 ], [ -150.234038119680008, 63.456165971252403 ], [ -150.234404119378013, 63.456402722656399 ], [ -150.234602558121992, 63.456582565880304 ], [ -150.234663625595005, 63.4566659202073 ], [ -150.234709395657006, 63.4567533705142 ], [ -150.234740105463999, 63.456936820796003 ], [ -150.234709353435989, 63.457067165763803 ], [ -150.234678943667006, 63.457212088349202 ], [ -150.234633319132001, 63.457367834209897 ], [ -150.234633014603986, 63.4574294648299 ], [ -150.234663677697995, 63.457475067710099 ], [ -150.234724742476004, 63.457509110357499 ], [ -150.234816204445991, 63.457531594017702 ], [ -150.234938296272986, 63.457535798913803 ], [ -150.235045087096012, 63.457531772650498 ], [ -150.235121611880004, 63.4575012059478 ], [ -150.235182437705987, 63.457455672956897 ], [ -150.235289410886992, 63.457356392006801 ], [ -150.235350313968013, 63.457268274767102 ], [ -150.235411266456993, 63.457135330267 ], [ -150.23567058223199, 63.4566891182794 ], [ -150.235731587721006, 63.456548331047301 ], [ -150.235762112473992, 63.456437031528097 ], [ -150.235762159187004, 63.456379877617898 ], [ -150.235762260695992, 63.456314879072004 ], [ -150.235716401701012, 63.456208375861301 ], [ -150.235700924626997, 63.456174363380399 ], [ -150.235685735912, 63.456162773371297 ], [ -150.235624777135001, 63.456063732414897 ], [ -150.235533184909002, 63.455933658669501 ], [ -150.235395913350004, 63.455735189438897 ], [ -150.235289024611006, 63.455609212594098 ], [ -150.234657754207007, 63.455053997546401 ], [ -150.234584071692012, 63.4549771553921 ], [ -150.234523059015999, 63.454912750630001 ], [ -150.234490727750995, 63.454873977710598 ], [ -150.234457758681998, 63.4547923030946 ], [ -150.23444985799901, 63.454693692580598 ], [ -150.234495653213997, 63.454563727828997 ], [ -150.234693821565003, 63.454308733800801 ], [ -150.234755009411998, 63.454255365499201 ], [ -150.234968717719994, 63.454125161087298 ], [ -150.235090473577003, 63.454080047481 ], [ -150.235227782864996, 63.454026361590699 ], [ -150.23550274639399, 63.453945893791001 ], [ -150.23560923358599, 63.4539194459825 ], [ -150.237745465958994, 63.453373826461601 ], [ -150.238322916497992, 63.453236846639498 ], [ -150.239210043266013, 63.453026400472197 ], [ -150.242200467472998, 63.4522938298146 ], [ -150.242307258295, 63.452267384896103 ], [ -150.243634767960998, 63.451938875832703 ], [ -150.247769282921013, 63.4509358159765 ], [ -150.250393454104994, 63.450264470471303 ], [ -150.250988464013005, 63.450066515234198 ], [ -150.254162002605, 63.448929284447203 ], [ -150.255184545010991, 63.448624392623302 ], [ -150.255230284530995, 63.448578474480101 ], [ -150.255291365478001, 63.448520613812597 ], [ -150.255474284927999, 63.448265215796901 ], [ -150.255596264465993, 63.448101301376397 ], [ -150.255626961694986, 63.448055004932598 ], [ -150.255672858420013, 63.447997882872997 ], [ -150.255718342818, 63.4479564410791 ], [ -150.255977875085989, 63.4477612430506 ], [ -150.256389705033001, 63.447525044998898 ], [ -150.256908658180009, 63.447127919481197 ], [ -150.25736611356001, 63.446747179078002 ], [ -150.257671309889986, 63.446548643337799 ], [ -150.257808662297009, 63.446491577706297 ], [ -150.258342968550011, 63.446315605752297 ], [ -150.259136108181991, 63.446091219572303 ], [ -150.260005849853997, 63.445777979054903 ], [ -150.260616296411996, 63.445548998888299 ], [ -150.260722947097008, 63.445503487845102 ], [ -150.261455577110013, 63.445198004133701 ], [ -150.262035095571008, 63.4449424676463 ], [ -150.262141944783991, 63.444900322245701 ], [ -150.26217243270699, 63.444885398412097 ], [ -150.262370831026999, 63.444770465637397 ], [ -150.262538592304992, 63.444614419903601 ], [ -150.262630095598013, 63.444527062627998 ], [ -150.262660679639993, 63.444496451916201 ], [ -150.262676019271993, 63.444484509790001 ], [ -150.262752227849006, 63.444423664547699 ], [ -150.262813298915006, 63.444378128824297 ], [ -150.26296601880199, 63.444301272066603 ], [ -150.26307291652401, 63.444228869746297 ], [ -150.263149123304999, 63.444168024763897 ], [ -150.263316922310992, 63.4440265482244 ], [ -150.263362748069, 63.443999680803799 ], [ -150.263500023221013, 63.443893299643399 ], [ -150.263576179696003, 63.443840297472804 ], [ -150.263850720118, 63.443672360833297 ], [ -150.263927285325991, 63.443603680318297 ], [ -150.263988386935011, 63.443537972819499 ], [ -150.263988232424992, 63.443526762444201 ], [ -150.264110194893988, 63.443332584857799 ], [ -150.264186588525007, 63.443240365244399 ], [ -150.264324013694988, 63.443145194603801 ], [ -150.264506897211987, 63.443030991023903 ], [ -150.264705240734997, 63.442936226535402 ], [ -150.265162965609989, 63.442733658517703 ], [ -150.265300288372998, 63.442676585684801 ], [ -150.265392038702998, 63.4426419048756 ], [ -150.265636192712009, 63.442565097678397 ], [ -150.266002230139009, 63.442481259285699 ], [ -150.266048065777994, 63.442466718956197 ], [ -150.266093792720994, 63.4424555386856 ], [ -150.266170189944006, 63.4424204712369 ], [ -150.266810998660986, 63.442198955156996 ], [ -150.26711606563299, 63.442122551221402 ], [ -150.267390863872009, 63.4420767668393 ], [ -150.267787546426007, 63.4420463639673 ], [ -150.268062031152994, 63.442000571028899 ], [ -150.26823009156999, 63.4419588345866 ], [ -150.268291104245009, 63.441921140199 ], [ -150.268413157444996, 63.441825580400803 ], [ -150.268519859333992, 63.441707222977698 ], [ -150.268779063718, 63.441543376646699 ], [ -150.269084475643012, 63.441436720872403 ], [ -150.269481019857011, 63.441352518495499 ], [ -150.271327558128007, 63.441104024809803 ], [ -150.272654826147004, 63.440898546692203 ], [ -150.272944732252, 63.440837441992102 ], [ -150.273066793536003, 63.440799032384597 ], [ -150.27328049286001, 63.440719210220799 ], [ -150.27344840775001, 63.440646086301001 ], [ -150.273493969403006, 63.440623693406302 ], [ -150.273585702665002, 63.440589006496197 ], [ -150.273860250273998, 63.4405051024711 ], [ -150.275187707837006, 63.440172975189803 ], [ -150.275370920136993, 63.440108076808897 ], [ -150.275477591483991, 63.440067039722599 ], [ -150.275569162150987, 63.4400211415958 ], [ -150.275676063465994, 63.439963299383699 ], [ -150.275782759966006, 63.439902091066003 ], [ -150.275813191293992, 63.4398950072245 ], [ -150.275828521045014, 63.4398830635811 ], [ -150.275843712455014, 63.439872237377998 ], [ -150.275874188698992, 63.439857309719002 ], [ -150.275920200407995, 63.439833806794198 ], [ -150.275996279627009, 63.439788640941401 ], [ -150.276301443617996, 63.439623692288102 ], [ -150.276331919862002, 63.439608764901202 ], [ -150.276377878570003, 63.439570691052097 ], [ -150.276454096131005, 63.439524408932201 ], [ -150.27646928754001, 63.4395135821918 ], [ -150.276515297452988, 63.439490078181699 ], [ -150.27653048616699, 63.439479251830001 ], [ -150.277003234467003, 63.439208667626303 ], [ -150.277079610131011, 63.439173594996802 ], [ -150.277262644565013, 63.439075070864497 ], [ -150.27743050645401, 63.438944789772698 ], [ -150.277689959670994, 63.438715939740497 ], [ -150.277750926533002, 63.438643500804403 ], [ -150.277934043611992, 63.438441878930902 ], [ -150.278346028967007, 63.438052104592899 ], [ -150.278575023007988, 63.437872921421601 ], [ -150.278864617398, 63.437716543254098 ], [ -150.279429174417999, 63.437530053424297 ], [ -150.279780183029999, 63.437442447574902 ], [ -150.280634554527012, 63.437312500908703 ], [ -150.281611299024007, 63.437178880841302 ], [ -150.282099495651011, 63.437094694467802 ], [ -150.282374148363004, 63.437021985499698 ], [ -150.282633710276002, 63.436934331498001 ], [ -150.282755578423007, 63.436884703680697 ], [ -150.283121755089013, 63.436721264415198 ], [ -150.283777849538012, 63.436416015219798 ], [ -150.284174677620001, 63.436251097760596 ], [ -150.284281526833013, 63.436213421972703 ], [ -150.284525372719997, 63.436133216239398 ], [ -150.284845924850998, 63.436052683278703 ], [ -150.285303557199995, 63.435946432885501 ], [ -150.285471614920993, 63.435919246948899 ], [ -150.286066661659987, 63.435832109808601 ], [ -150.286799187469001, 63.435736071724101 ], [ -150.287021273465001, 63.435714302088101 ], [ -150.28750095226701, 63.435667278974996 ], [ -150.288340038031009, 63.435610871384597 ], [ -150.288614701522988, 63.435572891850299 ], [ -150.288782547241993, 63.435542334237198 ], [ -150.289072559348, 63.4354621527375 ], [ -150.28959134271301, 63.435278969367303 ], [ -150.289972526633989, 63.435160714248802 ], [ -150.291696992840997, 63.434698263154701 ], [ -150.292032605228002, 63.434579989167503 ], [ -150.292413982286007, 63.434412425682403 ], [ -150.292734348466013, 63.4342904094377 ], [ -150.292871809568993, 63.434249006058103 ], [ -150.293054965276013, 63.434206499817201 ], [ -150.293772020299002, 63.4340954758039 ], [ -150.294107790789013, 63.434030990714497 ], [ -150.294397625029006, 63.433962001431297 ], [ -150.295648809336001, 63.4335997922133 ], [ -150.296945478939989, 63.433245428458399 ], [ -150.29821213762699, 63.4329172029285 ], [ -150.298639214679014, 63.432825842908201 ], [ -150.298883419892007, 63.432794932022297 ], [ -150.299051162305005, 63.432780050092497 ], [ -150.299081787669991, 63.432776329307501 ], [ -150.299753127428005, 63.432741463748698 ], [ -150.300073509777008, 63.432706841620302 ], [ -150.302103057328992, 63.432367281474299 ], [ -150.303155782230988, 63.432234292834003 ], [ -150.303415086326993, 63.432188061537097 ], [ -150.303491235616008, 63.4321619359417 ], [ -150.303567631042, 63.432131334914303 ], [ -150.303628716481995, 63.432092509442001 ], [ -150.303750644815011, 63.432009248687301 ], [ -150.303796659218989, 63.431977892953 ], [ -150.303933790640002, 63.431906216031102 ], [ -150.304193184568987, 63.431783783713101 ], [ -150.304361039270987, 63.431715110044003 ], [ -150.304727190784007, 63.4315930851239 ], [ -150.304925865786004, 63.4315543111544 ], [ -150.305093353077012, 63.4315438996613 ], [ -150.305291946332005, 63.431551068737903 ], [ -150.305536185681007, 63.431585144226901 ], [ -150.305642939672992, 63.431615807310997 ], [ -150.305825993870002, 63.431692068115296 ], [ -150.306070281728012, 63.431821396220101 ], [ -150.306115687073998, 63.4318527794468 ], [ -150.306283844509011, 63.431947720027402 ], [ -150.306314186006006, 63.431966402029303 ], [ -150.306451691126995, 63.432042653061302 ], [ -150.306497409086006, 63.432074043277701 ], [ -150.306649979853006, 63.432173079249303 ], [ -150.306711079665007, 63.432207092928401 ], [ -150.306863658515994, 63.432275872290802 ], [ -150.307473924513005, 63.432485992886903 ], [ -150.307733410069005, 63.432554060442598 ], [ -150.307794480236993, 63.432565660412699 ], [ -150.307931661065993, 63.432569061816103 ], [ -150.308114710771008, 63.432542222618402 ], [ -150.308206448524999, 63.432512000065501 ], [ -150.308236862785009, 63.432504909173197 ], [ -150.308267351605991, 63.432482133050101 ], [ -150.308328331941993, 63.432416408069699 ], [ -150.308328174736999, 63.432314428324901 ], [ -150.308328426265007, 63.432279695191902 ], [ -150.308328366078001, 63.4322146989727 ], [ -150.308328267263988, 63.432187801988803 ], [ -150.30829779551101, 63.432119809900897 ], [ -150.308297941038006, 63.4320884362076 ], [ -150.308267192604006, 63.432012593103998 ], [ -150.308282426234996, 63.431852723197302 ], [ -150.308312991412009, 63.431784003488502 ], [ -150.308389352702989, 63.4317108157747 ], [ -150.308496157, 63.431673121962 ], [ -150.308740346941988, 63.431611938517598 ], [ -150.309182922627997, 63.431554551824497 ], [ -150.309373256772005, 63.431551198113198 ], [ -150.309579310536009, 63.431547567168799 ], [ -150.310433991950987, 63.431558661697302 ], [ -150.311670098934997, 63.431546701720599 ], [ -150.311807135135012, 63.431551216595302 ], [ -150.311929346438006, 63.431558725581397 ], [ -150.312051244228996, 63.431566227333299 ], [ -150.312142798726001, 63.431585304137698 ], [ -150.312249594039997, 63.4316081199471 ], [ -150.312402321113012, 63.431665690952201 ], [ -150.312478459622014, 63.431700073669901 ], [ -150.312616086014998, 63.4317830448338 ], [ -150.31264660358201, 63.431802851533398 ], [ -150.312661810262995, 63.431814433727503 ], [ -150.312829570642009, 63.4319631459988 ], [ -150.31287522661799, 63.4320203068769 ], [ -150.313012539498999, 63.432123441174497 ], [ -150.313088959179993, 63.432145503623097 ], [ -150.313241586539988, 63.432176177357299 ], [ -150.313317936152998, 63.432183670510199 ], [ -150.313424749434006, 63.432183700643499 ], [ -150.313760267497003, 63.4321610026117 ], [ -150.314965866796001, 63.431866988069899 ], [ -150.315347391177994, 63.431729630519698 ], [ -150.315743875204987, 63.431608330080898 ], [ -150.316171088802008, 63.431520286655697 ], [ -150.316949409825014, 63.431412911319697 ], [ -150.317269821818996, 63.431352479871002 ], [ -150.317315441862007, 63.431336798836199 ], [ -150.31739188939099, 63.431310674875398 ], [ -150.317574878010987, 63.431210983815703 ], [ -150.317758096599988, 63.431016047711502 ], [ -150.317971660278999, 63.430859963191203 ], [ -150.318353219696007, 63.430676654765101 ], [ -150.319405917647998, 63.430211856668201 ], [ -150.319466912357996, 63.430188711471899 ], [ -150.31960406803401, 63.430131588727598 ], [ -150.319848289416996, 63.430054701772001 ], [ -150.320092337424995, 63.4299867733314 ], [ -150.320519682174989, 63.429879671908203 ], [ -150.320611260926995, 63.429860643390803 ], [ -150.320748356416004, 63.429849463020901 ], [ -150.320870805771989, 63.429852488250603 ], [ -150.321404729342987, 63.429883609644897 ], [ -150.321694434225009, 63.4298526662526 ], [ -150.322076157135001, 63.429761242617403 ], [ -150.323494908684012, 63.429368212772602 ], [ -150.324120561025012, 63.429242465453498 ], [ -150.324883590925992, 63.4290551119905 ], [ -150.325127661392003, 63.429009588798003 ], [ -150.325432623261008, 63.428964447264804 ], [ -150.326195583093011, 63.4288913853525 ], [ -150.326546596197005, 63.428887719514201 ], [ -150.326836653219004, 63.428899357534597 ], [ -150.327508089096995, 63.428956261331003 ], [ -150.32756898049999, 63.428956643062698 ], [ -150.327782536992999, 63.428921568327702 ], [ -150.327904515632014, 63.428895441361199 ], [ -150.328377483120988, 63.4287468610394 ], [ -150.328423403200986, 63.4287311846061 ], [ -150.328713315594996, 63.428597138756203 ], [ -150.329033538942014, 63.428411172211099 ], [ -150.32918610342, 63.428330889582298 ], [ -150.329354120717994, 63.428257711532403 ], [ -150.329537138982005, 63.428192747578201 ], [ -150.329705048481998, 63.428112841660301 ], [ -150.329842441312991, 63.428033305610299 ], [ -150.330071345521986, 63.427960506536202 ], [ -150.330238894796992, 63.4279265364381 ], [ -150.330330672975009, 63.427910869200097 ], [ -150.330590087563991, 63.427895971874598 ], [ -150.330803619801998, 63.427898992488501 ], [ -150.330941033295005, 63.427918067716199 ], [ -150.331063041578005, 63.427952450108997 ], [ -150.331215686006004, 63.4280133616897 ], [ -150.331261381508, 63.4280324171513 ], [ -150.331322603491003, 63.428063060329102 ], [ -150.33145985438901, 63.428101180013897 ], [ -150.331551409783998, 63.428120244659397 ], [ -150.331734371455013, 63.428139319739799 ], [ -150.332436184762003, 63.4281588504873 ], [ -150.332863662463012, 63.428151450310999 ], [ -150.333244895791012, 63.428139547981701 ], [ -150.333961967882004, 63.428086608273702 ], [ -150.334160523408002, 63.428063482658096 ], [ -150.334450387292009, 63.428005625942603 ], [ -150.334847099490986, 63.427944795516503 ], [ -150.334999554375003, 63.427926135806302 ], [ -150.335411900852989, 63.427883618175201 ], [ -150.335716830383006, 63.427876555471698 ], [ -150.336128770822995, 63.427895657235602 ], [ -150.336251003684993, 63.427895303618399 ], [ -150.336632388829003, 63.427864346827498 ], [ -150.337364644245014, 63.427754615467499 ], [ -150.337990287601997, 63.427605278991898 ], [ -150.338219084014014, 63.4275559982785 ], [ -150.339088981093994, 63.427422749816301 ], [ -150.339333155763995, 63.427376086005502 ], [ -150.339668851694, 63.427270040119502 ], [ -150.340050098498011, 63.4271359789958 ], [ -150.340431786374012, 63.4270288207045 ], [ -150.340858772696009, 63.426926136627202 ], [ -150.341133415526002, 63.426838757945397 ], [ -150.341255695101012, 63.426784613891201 ], [ -150.34128593957999, 63.426758462874403 ], [ -150.341375242000993, 63.4266798485368 ], [ -150.341377577620989, 63.426677791844099 ], [ -150.341438563346998, 63.426636708993797 ], [ -150.341515032435012, 63.426594885865903 ], [ -150.341789521653993, 63.426498537122299 ], [ -150.342491258604014, 63.426297265782502 ], [ -150.34314758392, 63.426132975247 ], [ -150.343757840036005, 63.4260034084785 ], [ -150.343971514206999, 63.425987365249497 ], [ -150.344276708740011, 63.4259881352218 ], [ -150.344719240409006, 63.426003483225202 ], [ -150.345436212787007, 63.426052459986501 ], [ -150.346077099655986, 63.426071552115999 ], [ -150.346870451291011, 63.426064126485201 ], [ -150.347877725032987, 63.4260182420877 ], [ -150.348106589715997, 63.426021614530498 ], [ -150.349540950391003, 63.426106095058202 ], [ -150.349693321731991, 63.426121036715401 ], [ -150.349830688511986, 63.426155780529001 ], [ -150.349983412889998, 63.426200985962197 ], [ -150.350013699588999, 63.426243189021598 ], [ -150.350090068067004, 63.426326863569301 ], [ -150.350135911791, 63.426456852031897 ], [ -150.350151193031991, 63.426490843964999 ], [ -150.350181856126, 63.426555467788297 ], [ -150.350181594715991, 63.426567787500503 ], [ -150.35019692626301, 63.4265860928544 ], [ -150.350212120368013, 63.426605515355803 ], [ -150.350273409724991, 63.4267045067363 ], [ -150.350319041445999, 63.4267470859931 ], [ -150.350395248226988, 63.426811705621901 ], [ -150.350486850333994, 63.426861014941203 ], [ -150.35054796451999, 63.426902853754797 ], [ -150.350624234181993, 63.426933857395397 ], [ -150.350868492395989, 63.427051901344299 ], [ -150.351234567553007, 63.427200943738399 ], [ -150.351494009990006, 63.427300309190102 ], [ -150.351661773063995, 63.4273458805066 ], [ -150.351707743450987, 63.427352609809198 ], [ -150.351829734666012, 63.427356719882901 ], [ -150.352012813117994, 63.4273264681513 ], [ -150.352028181495996, 63.4273190006517 ], [ -150.352104411632013, 63.427291733392003 ], [ -150.352211364151998, 63.427211431955001 ], [ -150.35227243611601, 63.427138970756801 ], [ -150.352287378693006, 63.4271247690316 ], [ -150.352333316739987, 63.427055299383902 ], [ -150.35239434648301, 63.426952582047797 ], [ -150.352439900050996, 63.426906633972898 ], [ -150.35248576533499, 63.4268606938613 ], [ -150.352501157966998, 63.426845382483698 ], [ -150.352577397087003, 63.426800186907698 ], [ -150.352852126155994, 63.426673568751802 ], [ -150.352897916878987, 63.426651159709103 ], [ -150.352958663652998, 63.426624632835598 ], [ -150.352973931419996, 63.426620524666099 ], [ -150.35317240519899, 63.426529017580798 ], [ -150.353599453505012, 63.4263310517509 ], [ -150.353843611108005, 63.4262204923117 ], [ -150.354057245754007, 63.426128235279201 ], [ -150.354087882795994, 63.426116659627603 ], [ -150.354103251173996, 63.426109191411001 ], [ -150.354133647469013, 63.426102092504401 ], [ -150.35449985916901, 63.4259721092644 ], [ -150.354713560290008, 63.425930278334903 ], [ -150.35495750319501, 63.4259183220368 ], [ -150.355155907804004, 63.425934384192097 ], [ -150.355278083173999, 63.425949701682597 ], [ -150.355735740674987, 63.4260258967929 ], [ -150.356376697613996, 63.426113300457502 ], [ -150.356773234641992, 63.426193598943598 ], [ -150.356880259026013, 63.426219750073997 ], [ -150.357002267310008, 63.426261955516999 ], [ -150.357017579992004, 63.426334045605202 ], [ -150.357093987096988, 63.4265477011065 ], [ -150.357185452661014, 63.426661995329802 ], [ -150.357276782578992, 63.426731463519801 ], [ -150.357429451261993, 63.426800191729903 ], [ -150.35781101517, 63.426956319663098 ], [ -150.358024789952992, 63.427028782126897 ], [ -150.358131388536009, 63.427048198300497 ], [ -150.358223004118997, 63.427051559772202 ], [ -150.358345085166007, 63.427024291052497 ], [ -150.358467052126997, 63.426944352139401 ], [ -150.358619702842986, 63.426773278009399 ], [ -150.358741689567012, 63.426685496203099 ], [ -150.358970704269012, 63.426623862880398 ], [ -150.359519900995991, 63.426533080755398 ], [ -150.35982528327699, 63.426517014917103 ], [ -150.360038746344998, 63.426525595769299 ], [ -150.360236961408987, 63.426548370599598 ], [ -150.360938858259999, 63.4266742217659 ], [ -150.361518721674003, 63.4267657119116 ], [ -150.36173233296401, 63.426819115386799 ], [ -150.361884956729995, 63.426875511354602 ], [ -150.361945994558994, 63.426902775795597 ], [ -150.361991923623009, 63.42692518866 ], [ -150.362190247383012, 63.426990544880802 ], [ -150.362403782315994, 63.427039463294498 ], [ -150.362617445707997, 63.427059250769702 ], [ -150.363136203022009, 63.427055114533097 ], [ -150.363258408035989, 63.427062581297697 ], [ -150.363380278877997, 63.427077884522298 ], [ -150.363548256649011, 63.427116724023001 ], [ -150.363593972811998, 63.427135769632798 ], [ -150.363975668773008, 63.427306451406501 ], [ -150.364097628547995, 63.427372181679303 ], [ -150.364112775042003, 63.427379274243599 ], [ -150.364143246793986, 63.427394586139599 ], [ -150.36417381556501, 63.4274065378034 ], [ -150.364341578638999, 63.427459939280801 ], [ -150.364478889724012, 63.427490185245702 ], [ -150.364631668898994, 63.427509603517699 ], [ -150.364814708723003, 63.427505108098302 ], [ -150.365058705526991, 63.427459519354002 ], [ -150.36533335374699, 63.427394508181798 ], [ -150.365409577596012, 63.427349305032998 ], [ -150.365531955086993, 63.4272760951417 ], [ -150.365577798810989, 63.427230150800199 ], [ -150.365699692110013, 63.427119950465503 ], [ -150.36580659612099, 63.4269936953878 ], [ -150.365821787529995, 63.4269671728498 ], [ -150.365821518934013, 63.426933549577399 ], [ -150.365867350081999, 63.426841662133498 ], [ -150.365913310585995, 63.426684785723999 ], [ -150.366035340429988, 63.426555539318699 ], [ -150.366065819368998, 63.426517063139897 ], [ -150.366202953484986, 63.426410596544102 ], [ -150.366264062281004, 63.426360541804598 ], [ -150.366285284080988, 63.426345877957203 ], [ -150.366325150415008, 63.426318331684499 ], [ -150.36640158357099, 63.426276494830603 ], [ -150.366508117475007, 63.426219705467403 ], [ -150.366676009906996, 63.426154329002998 ], [ -150.366904824285001, 63.426109487583901 ], [ -150.367011725600008, 63.426100890532503 ], [ -150.367210059242012, 63.426112453330902 ], [ -150.367393204168991, 63.426150538639099 ], [ -150.367561001378988, 63.426242034877099 ], [ -150.36768296474699, 63.426307761965298 ], [ -150.367805065557008, 63.4263723709307 ], [ -150.368034182667003, 63.4264709656793 ], [ -150.368232320476011, 63.426525103494598 ], [ -150.368629306661006, 63.426619948405197 ], [ -150.368812359060996, 63.4266434621724 ], [ -150.368919006152993, 63.426647183753801 ], [ -150.369331128053005, 63.426631461164 ], [ -150.36969739365199, 63.426615740172998 ], [ -150.370521363465002, 63.426604452447101 ], [ -150.370795796988006, 63.426582008388898 ], [ -150.371299490452003, 63.426513604758 ], [ -150.371665674305007, 63.426475466485101 ], [ -150.371909694464989, 63.426467966213401 ], [ -150.372153908662, 63.426471675359998 ], [ -150.372443766257987, 63.426489943000703 ], [ -150.373069437462988, 63.426558971976803 ], [ -150.373344066818987, 63.426547733656903 ], [ -150.373618688987989, 63.426482707155003 ], [ -150.37389344500599, 63.426398634418497 ], [ -150.37421382016899, 63.426319033733598 ], [ -150.374412133149008, 63.426284644156901 ], [ -150.374641137070995, 63.426268930610902 ], [ -150.37471727018999, 63.426273025167497 ], [ -150.374976812340009, 63.426302876151198 ], [ -150.375541379241014, 63.426447724632197 ], [ -150.375938033947989, 63.426540300514098 ], [ -150.376105750309989, 63.426581360195001 ], [ -150.376166801614005, 63.426608618887997 ], [ -150.376273675080995, 63.426669488719199 ], [ -150.376319614027011, 63.426691896943801 ], [ -150.37642621889799, 63.426772929200602 ], [ -150.376472121911007, 63.426811024079299 ], [ -150.376838435120987, 63.427107919116203 ], [ -150.376884125233005, 63.427142647266798 ], [ -150.376975658170011, 63.427203143049397 ], [ -150.37699086934299, 63.427222562721497 ], [ -150.377051786797011, 63.427268867129598 ], [ -150.377234916453006, 63.427402185424498 ], [ -150.377311283132997, 63.427463432107103 ], [ -150.37737232545399, 63.427516463380996 ], [ -150.377433464792006, 63.427566134753199 ], [ -150.377662418407994, 63.427740909917802 ], [ -150.377677633173988, 63.427760329627297 ], [ -150.377708112113993, 63.427775637703299 ], [ -150.377876207563986, 63.4279164346489 ], [ -150.377967479092007, 63.4279970941557 ], [ -150.378227114666998, 63.4281804591038 ], [ -150.378547435931011, 63.428378745276198 ], [ -150.378852728380991, 63.4285766656185 ], [ -150.379234254560004, 63.428862721642702 ], [ -150.379524143596996, 63.4290916403503 ], [ -150.379631088930012, 63.4291906086777 ], [ -150.379661441206991, 63.429224963425398 ], [ -150.379936119071004, 63.4294960927772 ], [ -150.380271950647, 63.429755261651799 ], [ -150.380394004744005, 63.429884851237198 ], [ -150.380439791874011, 63.430003622357702 ], [ -150.380562022042, 63.430239667603999 ], [ -150.380623139821012, 63.430305025105497 ], [ -150.380729727623986, 63.430365885478302 ], [ -150.380882278627013, 63.430423380226202 ], [ -150.380989362300994, 63.430441671465097 ], [ -150.381141860302989, 63.430461066441602 ], [ -150.381431640643996, 63.430480437297 ], [ -150.381828532506006, 63.4304844814285 ], [ -150.382301422739999, 63.430457876537403 ], [ -150.382606663985001, 63.430422714439899 ], [ -150.383339050555008, 63.430323974172602 ], [ -150.383812224655998, 63.4302435847992 ], [ -150.384147941247988, 63.430205798248203 ], [ -150.384392233597993, 63.430193803553301 ], [ -150.384651526914013, 63.430197860181202 ], [ -150.384971792482986, 63.430232531549102 ], [ -150.385261791114004, 63.430255262047602 ], [ -150.385536448317993, 63.430251845502703 ], [ -150.385857031889998, 63.430217049598603 ], [ -150.38600947419701, 63.430198339535103 ], [ -150.386268955262011, 63.430151973562502 ], [ -150.386680899294987, 63.430053281784502 ], [ -150.389900551104006, 63.429236092606203 ], [ -150.39170425680399, 63.428800313461899 ], [ -150.392601366549002, 63.428568742369599 ], [ -150.393364255414014, 63.428404582190403 ], [ -150.394249288207988, 63.428183989212798 ], [ -150.394615536739991, 63.428114424085102 ], [ -150.394859710512009, 63.428079998890297 ], [ -150.395134249136987, 63.428054152843103 ], [ -150.39543964399499, 63.4280380179381 ], [ -150.395744576220011, 63.428030835525597 ], [ -150.396034449087011, 63.4280389743071 ], [ -150.396461693226001, 63.4280694888906 ], [ -150.398170747037, 63.4282296306503 ], [ -150.398689843016001, 63.428266842374001 ], [ -150.399498378874, 63.428305451219103 ], [ -150.401558425128002, 63.428374317500797 ], [ -150.402550217303997, 63.428427424642301 ], [ -150.402931842297988, 63.428419838889702 ], [ -150.403328627260009, 63.428385727087999 ], [ -150.404488303783012, 63.428233339970802 ], [ -150.406502609618997, 63.427931260838598 ], [ -150.407967311791992, 63.427736907994202 ], [ -150.415581565091003, 63.426957945149901 ], [ -150.416909185249011, 63.426836401883897 ], [ -150.417916309870009, 63.426775483782897 ], [ -150.418526592934995, 63.426752073400401 ], [ -150.419152091663989, 63.4267223024518 ], [ -150.421090303009009, 63.426603084529901 ], [ -150.421975197463013, 63.426519031837501 ], [ -150.423049531338989, 63.426391331439298 ], [ -150.423668890980991, 63.4263177083999 ], [ -150.425362816264993, 63.426137661766298 ], [ -150.426537426381003, 63.426039251130099 ], [ -150.427499065706002, 63.425943562792199 ], [ -150.428384136228999, 63.425878525274598 ], [ -150.428643496919989, 63.425863460519899 ], [ -150.428841656288, 63.425848045329801 ], [ -150.429207900328009, 63.425832181648303 ], [ -150.429711483299997, 63.425836419331802 ], [ -150.430215193832993, 63.425855223868901 ], [ -150.430626960897001, 63.425886388987401 ], [ -150.431069801586005, 63.425961997141499 ], [ -150.432351437883995, 63.426335594372098 ], [ -150.433770820948013, 63.426827891850799 ], [ -150.434213071443992, 63.426999838071801 ], [ -150.434533728677991, 63.427140858640101 ], [ -150.435037160733003, 63.427422955560601 ], [ -150.435556064471996, 63.427767049188503 ], [ -150.435647631546004, 63.427838712354799 ], [ -150.435693484252994, 63.427870064180198 ], [ -150.435724126684988, 63.427892086505501 ], [ -150.435845974171002, 63.427999210627398 ], [ -150.435906991337987, 63.428045490876002 ], [ -150.435968230388994, 63.428095138828397 ], [ -150.435998555716992, 63.428132841768402 ], [ -150.436135972801992, 63.428251542195198 ], [ -150.436242886694004, 63.428331415981702 ], [ -150.436563406485988, 63.428583357262099 ], [ -150.436685583653002, 63.428651270947498 ], [ -150.436731124644012, 63.4286826138474 ], [ -150.437829974441996, 63.429143666069599 ], [ -150.43869987781099, 63.4294636518011 ], [ -150.439203407782003, 63.4296359281687 ], [ -150.439798582979989, 63.429787985172901 ], [ -150.440011922979011, 63.429834545005399 ], [ -150.440469790685995, 63.429913844212003 ], [ -150.445596900016994, 63.430742262795299 ], [ -150.446512742331009, 63.430887380943503 ], [ -150.448420207038993, 63.431153636900497 ], [ -150.450602344221011, 63.4315082125554 ], [ -150.450836719170013, 63.431547265828897 ], [ -150.451975627541998, 63.431737032986298 ], [ -150.454127187869005, 63.432069537324502 ], [ -150.455805626196991, 63.432305589658696 ], [ -150.460658272361002, 63.4329689497063 ], [ -150.465052926851001, 63.433625756196399 ], [ -150.465693866721011, 63.433709321605797 ], [ -150.466227951988998, 63.433743288464498 ], [ -150.46718936853199, 63.4337739488371 ], [ -150.46760149851599, 63.4337926911167 ], [ -150.468623822631997, 63.433823666813801 ], [ -150.470592148200012, 63.433903956150203 ], [ -150.471935092719008, 63.433949231318898 ], [ -150.473293094799004, 63.434010537931002 ], [ -150.478404942651991, 63.4343197772045 ], [ -150.480068168909014, 63.434369193325502 ], [ -150.48101442997401, 63.434421813689099 ], [ -150.481456682267009, 63.434464759923799 ], [ -150.482233995380994, 63.434569545830797 ], [ -150.482524974074011, 63.434608770895302 ], [ -150.482830231489004, 63.434643994143499 ], [ -150.483059212054997, 63.434662849145397 ], [ -150.483348993293987, 63.4346696932352 ], [ -150.484401923012001, 63.434628452708097 ], [ -150.484722405973002, 63.434636019542197 ], [ -150.486462181267996, 63.434742072719601 ], [ -150.487270741380996, 63.434811572745502 ], [ -150.487636975539004, 63.434857187958897 ], [ -150.488155742733994, 63.434941133838898 ], [ -150.488842407751008, 63.435100747077698 ], [ -150.489590206716002, 63.435314459346102 ], [ -150.490719618996991, 63.4356615338518 ], [ -150.492108243746003, 63.436069607074103 ], [ -150.493618832761001, 63.436432360326599 ], [ -150.494427471026995, 63.436589216717501 ], [ -150.495831377916005, 63.436802655965202 ], [ -150.496701259725, 63.436981108692997 ], [ -150.497250598385989, 63.4371071976488 ], [ -150.497739018694006, 63.437275549588001 ], [ -150.498608884333009, 63.437603009756103 ], [ -150.498883384331009, 63.437725991638104 ], [ -150.499188825901001, 63.437831771469199 ], [ -150.499783962471014, 63.437995902546497 ], [ -150.500073571233997, 63.438057612236499 ], [ -150.500241456478989, 63.438080606466301 ], [ -150.500622976370011, 63.438106378797102 ], [ -150.500821376487011, 63.438099836799303 ], [ -150.501141842380008, 63.438075995410301 ], [ -150.501233432810011, 63.438061340771199 ], [ -150.501782834353008, 63.437924108521699 ], [ -150.502209932065995, 63.437843386575501 ], [ -150.502499786068995, 63.437802015244699 ], [ -150.503796732354004, 63.437661043525601 ], [ -150.505383711406012, 63.437466364208099 ], [ -150.506131564269992, 63.437412205285398 ], [ -150.506283965254994, 63.437393372178299 ], [ -150.506390869265005, 63.437363387731601 ], [ -150.506711514821006, 63.437263347760101 ], [ -150.507016392249, 63.4371797441108 ], [ -150.507184422123004, 63.437145590515101 ], [ -150.507596434427995, 63.437099232570802 ], [ -150.507809993615012, 63.437091916651902 ], [ -150.508084695733999, 63.437088274358402 ], [ -150.508633889766003, 63.437106754966003 ], [ -150.509747824973005, 63.4371104603254 ], [ -150.51090739010499, 63.437145478036904 ], [ -150.511334674668007, 63.437145405729503 ], [ -150.512048727521005, 63.437145752001797 ], [ -150.512067283121013, 63.437145761240998 ], [ -150.512525008895011, 63.4371486394787 ], [ -150.513364361458002, 63.437168295042397 ], [ -150.514173046437008, 63.4372029137879 ], [ -150.514768327636006, 63.437251581376998 ], [ -150.515088579729991, 63.437317339854701 ], [ -150.516492562975998, 63.4376941625301 ], [ -150.517026637463005, 63.4378545525786 ], [ -150.517392781789994, 63.437976280088101 ], [ -150.517804822840986, 63.438140535264203 ], [ -150.518415185856014, 63.438392338883901 ], [ -150.519056120335989, 63.438694152284597 ], [ -150.519208667746, 63.438751498568003 ], [ -150.519590316994993, 63.438907195454199 ], [ -150.52020071055199, 63.439193724357601 ], [ -150.520902516673004, 63.439464459732498 ], [ -150.521253717525013, 63.439574623440201 ], [ -150.521650180890987, 63.439636544222502 ], [ -150.521955372728996, 63.439678406157498 ], [ -150.523069490293011, 63.439831029645603 ], [ -150.523771345822013, 63.439887750261697 ], [ -150.524244514532995, 63.439941370686 ], [ -150.525556547124012, 63.440113161102502 ], [ -150.526273983930992, 63.440200484044801 ], [ -150.527250460729988, 63.440337541509699 ], [ -150.527906813893992, 63.440409987006397 ], [ -150.528211905120997, 63.440426062729003 ], [ -150.528715442278013, 63.4404030675705 ], [ -150.530058052624014, 63.440314471570602 ], [ -150.531675398326001, 63.440181842356999 ], [ -150.53207244379999, 63.440158597567901 ], [ -150.533094746355999, 63.440135341513397 ], [ -150.534223892736009, 63.4401280115082 ], [ -150.535475305214987, 63.440085422811798 ], [ -150.536558546786011, 63.440070283987097 ], [ -150.536985609465006, 63.440085817650299 ], [ -150.538023427723004, 63.440158124405698 ], [ -150.538328416541987, 63.4401696951887 ], [ -150.538603379172002, 63.440169364216302 ], [ -150.538877924984007, 63.440151096459097 ], [ -150.539656184921995, 63.440043694825199 ], [ -150.540007056990987, 63.440001428944498 ], [ -150.540418977667002, 63.439971784227602 ], [ -150.540632471278002, 63.439967780798703 ], [ -150.540861474302005, 63.439970859185301 ], [ -150.541655018175987, 63.440036345918301 ], [ -150.541838248443014, 63.4400439623357 ], [ -150.542021215503013, 63.440040368216003 ], [ -150.542077186834007, 63.440036691754003 ], [ -150.542600956746014, 63.440002289317199 ], [ -150.543043556686996, 63.439952062303902 ], [ -150.543424843914011, 63.439918336578003 ], [ -150.543745604455012, 63.439894409941999 ], [ -150.543913321714996, 63.439894940949003 ], [ -150.544264188392987, 63.439906444358002 ], [ -150.544508521168012, 63.439928920155602 ], [ -150.545866368736995, 63.440112795586103 ], [ -150.547026118921991, 63.440295426686497 ], [ -150.547209377933996, 63.440310879894803 ], [ -150.547392347689993, 63.440307278177002 ], [ -150.547911402345989, 63.4402722538875 ], [ -150.548735254478999, 63.440180428093001 ], [ -150.549605034779006, 63.440104228040703 ], [ -150.550047709278999, 63.440077510376902 ], [ -150.550337476144989, 63.440074138784901 ], [ -150.550795306123007, 63.440092586537801 ], [ -150.55218378444701, 63.440218851383399 ], [ -150.552580489460013, 63.4402414795684 ], [ -150.552763799676995, 63.440245723154497 ], [ -150.553770605396011, 63.440223088144499 ], [ -150.554243705835006, 63.440218349302299 ], [ -150.555403578191004, 63.440192522236899 ], [ -150.555968200787987, 63.4401842929176 ], [ -150.55647170830099, 63.440207140037401 ], [ -150.557677027325013, 63.440314553911698 ], [ -150.558241621175995, 63.440344408745297 ], [ -150.558577534498994, 63.440352171286101 ], [ -150.559050508275988, 63.440348534628697 ], [ -150.559355492603004, 63.4403331734216 ], [ -150.559523386830989, 63.440321366928103 ], [ -150.559935276965007, 63.440264778113303 ], [ -150.560149159546, 63.440257393916603 ], [ -150.560378121247993, 63.440271644964596 ], [ -150.560576383023999, 63.440298632365298 ], [ -150.561369892762002, 63.440432355968497 ], [ -150.561674912124005, 63.440470770084403 ], [ -150.561842763232988, 63.440470163575696 ], [ -150.562087022344997, 63.440436588681401 ], [ -150.562269937303, 63.440352300219899 ], [ -150.562819450236987, 63.440203646756103 ], [ -150.563338130295989, 63.439925435677097 ], [ -150.563521339901001, 63.439860198931001 ], [ -150.563612872839002, 63.439837662828801 ], [ -150.563750100379991, 63.439813939370801 ], [ -150.56390274480799, 63.4398062582232 ], [ -150.564101092822995, 63.4398108340554 ], [ -150.564421561410995, 63.439840634786897 ], [ -150.564940333995992, 63.439951196306303 ], [ -150.565077515723004, 63.439971165658299 ], [ -150.565321875445989, 63.439974560960898 ], [ -150.565535377141003, 63.439951475466003 ], [ -150.56590166250399, 63.439868049568702 ], [ -150.566221994546993, 63.439788046468401 ], [ -150.56646636235601, 63.439707410511097 ], [ -150.567091970679002, 63.439482070385303 ], [ -150.568190578831008, 63.439073801150997 ], [ -150.568419216239988, 63.438990559077702 ], [ -150.568556756394997, 63.438947793154597 ], [ -150.568831292325996, 63.438891377161603 ], [ -150.569090898256007, 63.438871589822902 ], [ -150.569502731796007, 63.438853067373699 ], [ -150.570402954204013, 63.438841310882303 ], [ -150.570662345437, 63.438845043331803 ], [ -150.571333587279014, 63.438876184683501 ], [ -150.572784540735995, 63.438961873335899 ], [ -150.573012373255011, 63.438975327287402 ], [ -150.573607316687998, 63.438997979350702 ], [ -150.573927831089009, 63.4389975113912 ], [ -150.574202583513994, 63.438982543911401 ], [ -150.574431349382991, 63.438963158719901 ], [ -150.574629630023992, 63.438932987125398 ], [ -150.575209608422, 63.438810761174203 ], [ -150.575667298262999, 63.438708127348796 ], [ -150.576048984342009, 63.438635115988802 ], [ -150.576338631732995, 63.438589117153803 ], [ -150.576735456221002, 63.438559027109697 ], [ -150.577223716628993, 63.4385478421001 ], [ -150.577589899582989, 63.438551777038803 ], [ -150.57800192177001, 63.438566847174101 ], [ -150.578566644080013, 63.438608952086703 ], [ -150.579222697207001, 63.438684523862698 ], [ -150.57960426919999, 63.4387156951137 ], [ -150.579893945337005, 63.438715626425399 ], [ -150.580657082137009, 63.438688335464903 ], [ -150.582122065481997, 63.438612168398201 ], [ -150.583632642818998, 63.438543756929398 ], [ -150.583937596603988, 63.4385283445433 ], [ -150.58421230231599, 63.438505516168803 ], [ -150.586211349368995, 63.438295910502603 ], [ -150.587660893368991, 63.438116262489302 ], [ -150.588744325382009, 63.437967428305903 ], [ -150.589156369128006, 63.437933172011597 ], [ -150.589537547659006, 63.437929578430399 ], [ -150.589858093501988, 63.437955965492897 ], [ -150.590224522595008, 63.438001327451502 ], [ -150.590636314812997, 63.438070135082 ], [ -150.591079064772003, 63.438162057621497 ], [ -150.591536748323989, 63.4382688846609 ], [ -150.591735204136995, 63.4383406480964 ], [ -150.591994701370993, 63.438455262429301 ], [ -150.592726840903993, 63.439005308038297 ], [ -150.592910347852012, 63.439111458716397 ], [ -150.593139005024995, 63.439188392867997 ], [ -150.593337537194003, 63.439237749577799 ], [ -150.59364259248801, 63.439295143375901 ], [ -150.593886883040994, 63.439320897341901 ], [ -150.594252917774014, 63.439337111451103 ], [ -150.595183714341999, 63.439351672649998 ], [ -150.595611039328986, 63.439370404050401 ], [ -150.596297824720011, 63.439370417305803 ], [ -150.596587699384003, 63.439390486678398 ], [ -150.59701497137101, 63.439450666193103 ], [ -150.597182654494986, 63.439462340090898 ], [ -150.597869362631002, 63.439446659076303 ], [ -150.59817446104401, 63.4394244998226 ], [ -150.598617039424994, 63.439389793786397 ], [ -150.599151213625987, 63.439367262134297 ], [ -150.599425852861998, 63.439366811452899 ], [ -150.599761466146987, 63.439393520541003 ], [ -150.600890802970014, 63.439531336613904 ], [ -150.602401532122997, 63.439691288996102 ], [ -150.602798123946997, 63.439745149987701 ], [ -150.603315519414991, 63.439839247016302 ], [ -150.603988519260014, 63.439961638886203 ], [ -150.604369876556007, 63.440019629718599 ], [ -150.605773725054007, 63.440279063299101 ], [ -150.60623146609899, 63.440347752590696 ], [ -150.606795966524999, 63.440408790052999 ], [ -150.607116582435992, 63.440423936732003 ], [ -150.607818336455011, 63.440438802239797 ], [ -150.608215202265995, 63.440465766186598 ], [ -150.608734143734011, 63.440526878507903 ], [ -150.609619036390995, 63.440648977039999 ], [ -150.609954842814005, 63.440682389013702 ], [ -150.610595859939991, 63.440728348337899 ], [ -150.610839961847006, 63.440739505183302 ], [ -150.611648533637009, 63.440724292799302 ], [ -150.611999509909992, 63.440732276550499 ], [ -150.613525573304997, 63.440789391415599 ], [ -150.614486620640008, 63.4408392490434 ], [ -150.614929328378992, 63.4408885233806 ], [ -150.615356597670996, 63.4409464087095 ], [ -150.615814231815989, 63.441021787951101 ], [ -150.616073853018008, 63.441075861726702 ], [ -150.616272142642003, 63.441144226179198 ], [ -150.616714543156007, 63.441339133137703 ], [ -150.616912860627991, 63.441396294588699 ], [ -150.617263888104986, 63.441472608082897 ], [ -150.617599850835006, 63.441529533500997 ], [ -150.617859025574006, 63.441560067055001 ], [ -150.618667733010994, 63.441640047934897 ], [ -150.620437843514992, 63.441769850459501 ], [ -150.620666788147986, 63.4417817668078 ], [ -150.621033166036995, 63.441773273663898 ], [ -150.622070829785002, 63.4417083046051 ], [ -150.622329960505994, 63.441700737229198 ], [ -150.622650620434996, 63.441704647636101 ], [ -150.623199670736994, 63.441747345983302 ], [ -150.625168281969991, 63.442029476235803 ], [ -150.625427734287996, 63.442052160424701 ], [ -150.625809185907002, 63.442063042434903 ], [ -150.626007512363003, 63.442059693568403 ], [ -150.626343387057005, 63.442040413279202 ], [ -150.626785768707009, 63.441979852024602 ], [ -150.627197720824995, 63.4418995539938 ], [ -150.627823287826004, 63.441712059574698 ], [ -150.628174242540013, 63.441563158123202 ], [ -150.628433832300999, 63.4414715662097 ], [ -150.628662593678001, 63.441410644277099 ], [ -150.628799717911988, 63.441384620274199 ], [ -150.628952374019008, 63.441365668480898 ], [ -150.629150773237001, 63.441353354327099 ], [ -150.629303507497013, 63.441361292114998 ], [ -150.629639250139007, 63.441414823827898 ], [ -150.630585156371012, 63.441589710931297 ], [ -150.631348212321996, 63.441742531080997 ], [ -150.631897372217992, 63.441842336514 ], [ -150.632233073538004, 63.441888018852403 ], [ -150.632385990155996, 63.441902679566397 ], [ -150.632584313915999, 63.441899321845099 ], [ -150.633179320230994, 63.441830988514901 ], [ -150.633804811774013, 63.441784628915499 ], [ -150.633946256006993, 63.441778783805098 ], [ -150.634278011926, 63.4417650737171 ], [ -150.634537504668998, 63.441765335990198 ], [ -150.639145702175995, 63.441956776580497 ], [ -150.640335863028014, 63.442009395056402 ], [ -150.642166884699009, 63.442051805777297 ], [ -150.643342015837987, 63.442051406146298 ], [ -150.644211782662012, 63.442039636106998 ], [ -150.644608471504995, 63.442051933900203 ], [ -150.64486792741701, 63.442085786843101 ], [ -150.64506631765201, 63.442131707366102 ], [ -150.645218828232004, 63.442177714569297 ], [ -150.645615587142998, 63.442344615722597 ], [ -150.646256457843009, 63.442650330287897 ], [ -150.646500546276002, 63.442753294183802 ], [ -150.64674492306699, 63.4428260151115 ], [ -150.64720277550299, 63.442916984990902 ], [ -150.647492395044992, 63.442948150430801 ], [ -150.647690919130014, 63.442940295416101 ], [ -150.648698118310989, 63.442802755599999 ], [ -150.649201435381997, 63.442761424365798 ], [ -150.64936936374599, 63.442757359877497 ], [ -150.649674466650993, 63.442787749142603 ], [ -150.649689823350997, 63.442788094945001 ], [ -150.649750739007999, 63.442799547791701 ], [ -150.650925836910005, 63.442924562487697 ], [ -150.652039747862005, 63.443004499394398 ], [ -150.652573981350997, 63.4430120254599 ], [ -150.652833194717999, 63.442989842858999 ], [ -150.653214845762989, 63.442943523691703 ], [ -150.653428386086006, 63.442894546881199 ], [ -150.653580899360009, 63.442818430760902 ], [ -150.654114959473986, 63.442524583423499 ], [ -150.654359143128005, 63.442410195428501 ], [ -150.654557466888008, 63.442337348937997 ], [ -150.654816714390989, 63.442264749670102 ], [ -150.65500001652299, 63.442238618001397 ], [ -150.655274571319012, 63.442222377420102 ], [ -150.655473007367988, 63.442234675134799 ], [ -150.656571661333999, 63.4423299206941 ], [ -150.657715956004012, 63.442341038358599 ], [ -150.657975445153994, 63.442352462466303 ], [ -150.658875744815987, 63.442420833912401 ], [ -150.659806562943999, 63.442505568524901 ], [ -150.660676519313, 63.442592292971398 ], [ -150.661164783314007, 63.442631246392303 ], [ -150.663804518708986, 63.442802427067697 ], [ -150.664018184795992, 63.442832979346001 ], [ -150.664170924444988, 63.442863287401998 ], [ -150.664277590402008, 63.442898165142097 ], [ -150.664506641934992, 63.442992918109397 ], [ -150.664578071475006, 63.443031506711002 ], [ -150.664811691838992, 63.443157712012002 ], [ -150.665025305824003, 63.443294690664302 ], [ -150.665925608180999, 63.4439545379865 ], [ -150.666398675382993, 63.444374037256203 ], [ -150.666734513247007, 63.444706441118399 ], [ -150.666902503594997, 63.444858079596003 ], [ -150.667009348317009, 63.444938891409997 ], [ -150.667299067572003, 63.445114539704598 ], [ -150.667558484857011, 63.445213328997603 ], [ -150.667879031598005, 63.445296679487697 ], [ -150.668123177522006, 63.4453469525481 ], [ -150.668397797895011, 63.445377741862501 ], [ -150.66877937797301, 63.4453739520333 ], [ -150.669023487965006, 63.445354764735299 ], [ -150.669283033708012, 63.445304553132502 ], [ -150.669648977710011, 63.445193982961896 ], [ -150.670534001521986, 63.444801496130403 ], [ -150.67205985471, 63.444102918164397 ], [ -150.672533043185013, 63.443935362589002 ], [ -150.672944847979011, 63.443813485701902 ], [ -150.674501368752999, 63.443439336788103 ], [ -150.675279488553997, 63.4432561739061 ], [ -150.675615290485013, 63.4431953312749 ], [ -150.676149232920011, 63.443129946949703 ], [ -150.677110667429986, 63.443034887593903 ], [ -150.677995499899993, 63.442939234318303 ], [ -150.679155126116996, 63.442836258640398 ], [ -150.680330100051009, 63.442767225899601 ], [ -150.681138756282991, 63.442714668257302 ], [ -150.681932493294994, 63.442671855682697 ], [ -150.682451182335996, 63.442649800536898 ], [ -150.683381879192012, 63.442649241466803 ], [ -150.683824475539012, 63.442672539659398 ], [ -150.684084044639008, 63.442714167826502 ], [ -150.684908087215007, 63.4429083949899 ], [ -150.685258811061004, 63.443011425029503 ], [ -150.685655675974004, 63.443145727558601 ], [ -150.686357713859991, 63.443427975365097 ], [ -150.686785060407004, 63.443587599551797 ], [ -150.687029098533998, 63.443644560927702 ], [ -150.687242793367005, 63.443663876684099 ], [ -150.688142942112989, 63.4437062998147 ], [ -150.688860239679997, 63.443728967815602 ], [ -150.68910439279199, 63.443728793112797 ], [ -150.689333184710989, 63.443717073964898 ], [ -150.689592627147988, 63.443698193596298 ], [ -150.690081042066993, 63.443640710626703 ], [ -150.690828428705004, 63.443492635292401 ], [ -150.691372209489003, 63.443392795046897 ], [ -150.691682995137, 63.443335733166499 ], [ -150.692705348896993, 63.443164628372699 ], [ -150.694185433819996, 63.442943181104098 ], [ -150.694627953810993, 63.442908190561702 ], [ -150.695177247555989, 63.442927100368301 ], [ -150.696657558854014, 63.443060761496099 ], [ -150.697511892622003, 63.443122276732097 ], [ -150.697908743162003, 63.443133314969003 ], [ -150.698442911074011, 63.443110427611302 ], [ -150.699099034270006, 63.443053270786301 ], [ -150.699587384508987, 63.443038326712099 ], [ -150.699983928722986, 63.443060555462402 ], [ -150.700350402731999, 63.443110123983303 ], [ -150.702898370729002, 63.443587767427999 ], [ -150.705477523740996, 63.444079497840796 ], [ -150.705843638423005, 63.444121203481501 ], [ -150.706118381864997, 63.444117196616503 ], [ -150.706377668893992, 63.444071397350697 ], [ -150.706835603974014, 63.443957172162797 ], [ -150.707476450419989, 63.443777531945301 ], [ -150.707796638732987, 63.443709551297502 ], [ -150.708117101931009, 63.443667341831798 ], [ -150.70851385185901, 63.443625697780803 ], [ -150.708971733041011, 63.443602205980703 ], [ -150.709627838269995, 63.443598776970703 ], [ -150.710314553592013, 63.443613944453297 ], [ -150.710757124786994, 63.443640521465099 ], [ -150.711199599861999, 63.443690621123601 ], [ -150.711672648198999, 63.443785084715898 ], [ -150.712145586941006, 63.443891867088503 ], [ -150.712450908136987, 63.443937814836602 ], [ -150.712771263537007, 63.443972891270803 ], [ -150.713640998021987, 63.444017848514697 ], [ -150.713885054114996, 63.444041156839099 ], [ -150.714144607943012, 63.4440748885538 ], [ -150.714846463470991, 63.4442169584323 ], [ -150.715426575718993, 63.444292485693097 ], [ -150.71655567538599, 63.444460771707099 ], [ -150.716891223992008, 63.444506256295298 ], [ -150.71710494218101, 63.444525529703597 ], [ -150.717547463968003, 63.444544243664197 ], [ -150.718478407860005, 63.444544589847098 ], [ -150.719577086079994, 63.4445822321875 ], [ -150.721057069494009, 63.444655145657897 ], [ -150.721514983014998, 63.444696592230002 ], [ -150.722094564358002, 63.4447317516696 ], [ -150.722422301215005, 63.444735368493497 ], [ -150.723422337230005, 63.444746399683098 ], [ -150.725268618582987, 63.444780276749803 ], [ -150.725863802763996, 63.444807923346197 ], [ -150.726062037590992, 63.444822362087002 ], [ -150.726367374057986, 63.444857079210699 ], [ -150.726626527236988, 63.444903102517202 ], [ -150.726809763793, 63.444945217793801 ], [ -150.727160836184993, 63.445043671534002 ], [ -150.727939126666001, 63.445299383016298 ], [ -150.728183258217996, 63.445356277134103 ], [ -150.728335876594002, 63.445379793197198 ], [ -150.728671522219003, 63.445390525353801 ], [ -150.729541287247002, 63.445376015416102 ], [ -150.730136382495004, 63.445378996839203 ], [ -150.730838289226995, 63.445413445827803 ], [ -150.731814878314992, 63.445546899375003 ], [ -150.735889289694001, 63.446161626142697 ], [ -150.737933875941991, 63.446443903256402 ], [ -150.738468180398002, 63.446508253183502 ], [ -150.739627544307012, 63.446623250463801 ], [ -150.742618518282995, 63.446878000131697 ], [ -150.742938916803013, 63.446901808895198 ], [ -150.74335113751701, 63.4469164220666 ], [ -150.743473188919012, 63.446912369010498 ], [ -150.743976776382993, 63.446939058613502 ], [ -150.744983618035008, 63.446981225107599 ], [ -150.745624668397994, 63.447026597268597 ], [ -150.746128083385003, 63.4471148893996 ], [ -150.747638887097992, 63.4476721517998 ], [ -150.747974782454008, 63.447778064759 ], [ -150.748417199138004, 63.447858296915797 ], [ -150.748859747874008, 63.447885877897498 ], [ -150.749256547209995, 63.4478665312581 ], [ -150.749759827449992, 63.447778930519902 ], [ -150.750843483143001, 63.447522509533499 ], [ -150.751499404218009, 63.447355335375299 ], [ -150.751713018201997, 63.447312942547597 ], [ -150.752140339596991, 63.447267368451101 ], [ -150.752922499121013, 63.447240998801 ], [ -150.753391505937998, 63.447225184709403 ], [ -150.754597012710008, 63.447175275554102 ], [ -150.756229648636008, 63.4471301758918 ], [ -150.756519724523002, 63.447129770709701 ], [ -150.756916531944, 63.447141769558499 ], [ -150.757511555326005, 63.447171524914801 ], [ -150.75909860444699, 63.447290075396097 ], [ -150.759968341627001, 63.447339239849697 ], [ -150.760792358152997, 63.447358279246799 ], [ -150.762394621140999, 63.447369582891497 ], [ -150.764240978850012, 63.4473928933065 ], [ -150.764530858005998, 63.447411511828797 ], [ -150.764790379494997, 63.447446273197997 ], [ -150.765080148158006, 63.447491773523701 ], [ -150.765461728236005, 63.447568392024998 ], [ -150.765873808813012, 63.447633349396 ], [ -150.766148468711009, 63.447656115481699 ], [ -150.766469046893008, 63.447644030512897 ], [ -150.76765894633499, 63.447469330967401 ], [ -150.768116832906998, 63.447419892870499 ], [ -150.768620554220007, 63.4473736888894 ], [ -150.76916957128401, 63.447358710125798 ], [ -150.769566333787992, 63.4473740358412 ], [ -150.769902348620008, 63.4474306114124 ], [ -150.770161662598014, 63.447519129983597 ], [ -150.770604185283986, 63.447716920124698 ], [ -150.770787273617003, 63.447827309087899 ], [ -150.771153588623008, 63.448133227740797 ], [ -150.771382639258007, 63.448265896829099 ], [ -150.771718178881002, 63.448407594558802 ], [ -150.772404800778986, 63.448606187680298 ], [ -150.773015388371988, 63.448747118782002 ], [ -150.773305444496003, 63.448795969938303 ], [ -150.773656233920008, 63.448838293512303 ], [ -150.773869762564004, 63.448854119160799 ], [ -150.774342745323992, 63.448876683102597 ], [ -150.775044723922008, 63.4488885193973 ], [ -150.776463976731009, 63.448930436071798 ], [ -150.778340959804012, 63.448967674316997 ], [ -150.779302263159991, 63.449001900549497 ], [ -150.77965311546501, 63.449040850873402 ], [ -150.779790556805011, 63.449062865761597 ], [ -150.780751807159987, 63.449265113554198 ], [ -150.781118192234999, 63.449334641787999 ], [ -150.781392879083, 63.449357379216401 ], [ -150.782155802083992, 63.449383940457899 ], [ -150.782552587046013, 63.449413794269702 ], [ -150.783040707317014, 63.449493787346398 ], [ -150.783388933846993, 63.449558610653902 ], [ -150.783986919873996, 63.449669924473099 ], [ -150.784582147175001, 63.449753345107702 ], [ -150.784933092904993, 63.4498146885674 ], [ -150.785360203195012, 63.449906800279003 ], [ -150.785741804833009, 63.450001290344403 ], [ -150.786062171910999, 63.450101178619803 ], [ -150.786962625184998, 63.450409614209804 ], [ -150.787450864931998, 63.4505321640776 ], [ -150.787664665765988, 63.450565898585602 ], [ -150.788213863392002, 63.450604623537103 ], [ -150.78923612103199, 63.450726355481997 ], [ -150.789877150733986, 63.450825303285797 ], [ -150.790319695877002, 63.450928935219899 ], [ -150.791601645686995, 63.451275805681298 ], [ -150.792074727260996, 63.451393531735903 ], [ -150.792761148835012, 63.451534891978604 ], [ -150.793631165390991, 63.4516757203331 ], [ -150.795096064294, 63.451886469124602 ], [ -150.795584388483007, 63.451950742580003 ], [ -150.796103251797007, 63.451999986959102 ], [ -150.796377670048997, 63.452008127765403 ], [ -150.796667747731988, 63.451996441315302 ], [ -150.798483507924004, 63.451767737324801 ], [ -150.800925158511006, 63.451423627970399 ], [ -150.801520070502988, 63.451347903506701 ], [ -150.80226785958601, 63.451291141345301 ], [ -150.803000372817991, 63.451256451294803 ], [ -150.803747934628007, 63.451236642385403 ], [ -150.803946135318995, 63.4512375337384 ], [ -150.804342920282011, 63.451256126473098 ], [ -150.804999136902012, 63.451328448791699 ], [ -150.805747102054994, 63.451389293816703 ], [ -150.806357407577991, 63.451412458022297 ], [ -150.806982883849003, 63.451420262130597 ], [ -150.807608480493997, 63.451397820646001 ], [ -150.808188469673013, 63.451355356713997 ], [ -150.808936318943012, 63.451286240518499 ], [ -150.809332766139988, 63.4512409606292 ], [ -150.809790495506007, 63.4511723480542 ], [ -150.810385740773, 63.451107797815297 ], [ -150.811225007996995, 63.451027184894897 ], [ -150.812094777515995, 63.450955060564901 ], [ -150.812628809783007, 63.4509160767089 ], [ -150.812979861514009, 63.450901182109 ], [ -150.81320874236701, 63.4509206407281 ], [ -150.813666339680992, 63.450993157825401 ], [ -150.814001646641003, 63.451089078507799 ], [ -150.814169971161988, 63.451137229848101 ], [ -150.814398884355001, 63.451191413008097 ], [ -150.814597307827995, 63.451213578415199 ], [ -150.815039826920014, 63.451236480576704 ], [ -150.815527959766996, 63.4512793987926 ], [ -150.815955585690006, 63.451335586417997 ], [ -150.816596485135989, 63.451465780633001 ], [ -150.817343966098008, 63.451659859305799 ], [ -150.817649152546011, 63.451717905547802 ], [ -150.817878045974993, 63.451751919710901 ], [ -150.818320555186006, 63.451850984420503 ], [ -150.818717332064011, 63.451931148953904 ], [ -150.819053324437988, 63.4519920906639 ], [ -150.819678798912008, 63.452076014033899 ], [ -150.821586190857005, 63.452282501615201 ], [ -150.822105003866, 63.452323812282401 ], [ -150.823127451949006, 63.4524307495087 ], [ -150.823997221469, 63.4525109015783 ], [ -150.824394079195002, 63.452564166737098 ], [ -150.824790616222998, 63.4526409487219 ], [ -150.825584069367011, 63.452820282005099 ], [ -150.825980942363998, 63.452926192782797 ], [ -150.826560859678011, 63.453109932976297 ], [ -150.827262907445004, 63.4533007513134 ], [ -150.827842914590008, 63.453448642639202 ], [ -150.828300469683001, 63.453598406092397 ], [ -150.828468488776991, 63.453666952631302 ], [ -150.829048241699013, 63.453949255319102 ], [ -150.830177664758992, 63.454398955403803 ], [ -150.830818607325, 63.454635505437203 ], [ -150.832176765711012, 63.455191989974097 ], [ -150.832420868517005, 63.455333841706498 ], [ -150.83327537296401, 63.455909855409203 ], [ -150.833916219410014, 63.456382747499802 ], [ -150.835198380322993, 63.457274764616997 ], [ -150.835534090626993, 63.4575272136995 ], [ -150.835717025348004, 63.457718169179103 ], [ -150.835946186475013, 63.4580646904354 ], [ -150.836541226028004, 63.459098931753701 ], [ -150.836617666369989, 63.459262981500402 ], [ -150.836785492325987, 63.459701175300097 ], [ -150.83680651919201, 63.459826702238701 ], [ -150.836816123081007, 63.460014357823702 ], [ -150.83677907565999, 63.460138328421003 ], [ -150.836744418656991, 63.460238362350402 ], [ -150.83671064739201, 63.460330117008802 ], [ -150.836694704091997, 63.460429362757303 ], [ -150.83668989091899, 63.460499206656202 ], [ -150.836701389354005, 63.460565840953997 ], [ -150.836721361597995, 63.460627913027203 ], [ -150.836740325033986, 63.460674551182798 ], [ -150.836788747821004, 63.460744339895903 ], [ -150.836857025172009, 63.460802695239799 ], [ -150.836961212677011, 63.460873667697399 ], [ -150.837050480063994, 63.460934839622901 ], [ -150.837223077870988, 63.461038088173297 ], [ -150.837370638733006, 63.461126579524297 ], [ -150.837465092992005, 63.461189046935502 ], [ -150.837530842484, 63.4612710581088 ], [ -150.837602658299005, 63.461370981715902 ], [ -150.837647542621994, 63.4614738899391 ], [ -150.837700515376014, 63.461600681027399 ], [ -150.837747925761988, 63.4617546205533 ], [ -150.837783322977998, 63.461871554573399 ], [ -150.83783553935001, 63.462005442341898 ], [ -150.837928851849995, 63.462203034875998 ], [ -150.838015713548003, 63.4623862652019 ], [ -150.838119019805987, 63.462565101964103 ], [ -150.838201589353986, 63.462688964384597 ], [ -150.838280112889009, 63.462800884557502 ], [ -150.838347890776987, 63.462888866766598 ], [ -150.838422624320998, 63.4629615843197 ], [ -150.838502038087, 63.463040329486397 ], [ -150.838584739687008, 63.463113216021497 ], [ -150.838678696279004, 63.463180414139302 ], [ -150.838773865597005, 63.4632400692782 ], [ -150.839715826428005, 63.463966280824799 ], [ -150.840066950922989, 63.464263854391902 ], [ -150.840372235286992, 63.464493242731599 ], [ -150.840616355160989, 63.464721335372502 ], [ -150.840662040781012, 63.464817519873399 ], [ -150.840692536787998, 63.464923464116303 ], [ -150.840601323650986, 63.4652475060279 ], [ -150.840601258074003, 63.465339359801398 ], [ -150.840540310076989, 63.4655184180898 ], [ -150.840494421437, 63.465697796303502 ], [ -150.840494292978008, 63.465778446967597 ], [ -150.840540100769005, 63.465897037984703 ], [ -150.840631948116993, 63.466014364405503 ], [ -150.840753894416991, 63.466117765983697 ], [ -150.840906450809996, 63.466231898354899 ], [ -150.84092188296799, 63.466243427301798 ], [ -150.841074320784003, 63.466358676787401 ], [ -150.841227000245993, 63.466495214989997 ], [ -150.841333748848001, 63.466640860719501 ], [ -150.841501608041995, 63.466903181198802 ], [ -150.841638867023988, 63.4670752388583 ], [ -150.841806719032007, 63.467243463203403 ], [ -150.842157903713996, 63.467541031979401 ], [ -150.842524295076998, 63.4677963555459 ], [ -150.842905647881992, 63.4680441529351 ], [ -150.843195557580003, 63.4682620085186 ], [ -150.843317769781009, 63.468410221002301 ], [ -150.843439840049001, 63.468600998331901 ], [ -150.843439925387997, 63.468753345295902 ], [ -150.84325690981899, 63.469218831015397 ], [ -150.843226173062988, 63.469368286046802 ], [ -150.843226297928993, 63.469493749713997 ], [ -150.843272287180014, 63.469607862999403 ], [ -150.843439831065012, 63.469841049653901 ], [ -150.843729870120995, 63.470146282478098 ], [ -150.843867258460989, 63.470302657315401 ], [ -150.844386223284999, 63.470852455589302 ], [ -150.845072873030006, 63.471596232937699 ], [ -150.846141251076006, 63.472824165131499 ], [ -150.846370104080989, 63.473140419672703 ], [ -150.84642522291, 63.473235573666798 ], [ -150.846507406182013, 63.473377444694499 ], [ -150.846705794620988, 63.4736639292191 ], [ -150.846797606037001, 63.473755486768802 ], [ -150.847087621735994, 63.473987899012002 ], [ -150.847240161960002, 63.474132268524997 ], [ -150.847591078046008, 63.474525035702499 ], [ -150.848186449076991, 63.475276950025197 ], [ -150.848552596097988, 63.475650993824097 ], [ -150.848674658280999, 63.475807039698502 ], [ -150.848812163400993, 63.476063109863397 ], [ -150.848934152819993, 63.476337895386202 ], [ -150.849010603941991, 63.4764291270603 ], [ -150.849072555357992, 63.476463955490701 ], [ -150.849143414466994, 63.476498647485698 ], [ -150.849204784672992, 63.476522470528103 ], [ -150.849281967921996, 63.476547812324903 ], [ -150.849394709184992, 63.476578490663499 ], [ -150.850277097338989, 63.476798664092399 ], [ -150.852154116344991, 63.477309902654298 ], [ -150.852566031631994, 63.477393650704698 ], [ -150.853771458453991, 63.4776196035046 ], [ -150.854061478645008, 63.477687333157803 ], [ -150.854366836672, 63.477791232074701 ], [ -150.854565239484003, 63.4779130377405 ], [ -150.854854974908989, 63.478134225387997 ], [ -150.854959929574989, 63.478217217297299 ], [ -150.855092845202989, 63.478344502191298 ], [ -150.855172345206995, 63.478423239517099 ], [ -150.855212993973993, 63.478491672851099 ], [ -150.855250106971994, 63.4785683295271 ], [ -150.855270898479006, 63.478648199417201 ], [ -150.85531288932799, 63.478755508411503 ], [ -150.855417533178013, 63.478871802153797 ], [ -150.855525645422006, 63.478981966692999 ], [ -150.855621467815013, 63.479057491296999 ], [ -150.855747791605012, 63.4791466998755 ], [ -150.855916754828996, 63.479235622178898 ], [ -150.856154569426991, 63.4793532633227 ], [ -150.85641035572101, 63.479477211103699 ], [ -150.856682980935005, 63.479618110961603 ], [ -150.856940530622012, 63.479750411522403 ], [ -150.857128795047998, 63.479843412431499 ], [ -150.858182022107997, 63.480380893992297 ], [ -150.859051599386987, 63.480796880226102 ], [ -150.859372368911011, 63.480960462643601 ], [ -150.859601121304991, 63.481101943593202 ], [ -150.859707952551986, 63.481185967718098 ], [ -150.859754612844, 63.481261977834599 ], [ -150.859840234866994, 63.4813835208436 ], [ -150.85992434772001, 63.481519257758798 ], [ -150.859970704381993, 63.481584253606897 ], [ -150.860013759735011, 63.481630210656 ], [ -150.860088199529997, 63.481681570625199 ], [ -150.860181264993003, 63.4817347454009 ], [ -150.860760789743011, 63.482086363913702 ], [ -150.862622862579002, 63.482879437836203 ], [ -150.86275986464301, 63.482937209003701 ], [ -150.862805835927986, 63.482951618488897 ], [ -150.862821012964986, 63.482959779368699 ], [ -150.862836311274009, 63.4829668220762 ], [ -150.86285949769001, 63.4829746745325 ], [ -150.863131056604004, 63.483073424230597 ], [ -150.863358531593008, 63.483163568391198 ], [ -150.863568158854008, 63.483246224051598 ], [ -150.863763744549999, 63.4833356966938 ], [ -150.863895280365, 63.483401297220198 ], [ -150.864026565551001, 63.483469262636703 ], [ -150.864159147902996, 63.483575192751701 ], [ -150.864304893270003, 63.4836825851228 ], [ -150.864413285788999, 63.483765481519299 ], [ -150.864466480427012, 63.483816392082304 ], [ -150.864505379274988, 63.483876486659099 ], [ -150.86451496609601, 63.483933002525099 ], [ -150.864514910400004, 63.484256737276603 ], [ -150.864454137574995, 63.4844470130855 ], [ -150.86443171023501, 63.484480889697799 ], [ -150.864332163427008, 63.484576630784296 ], [ -150.864225067176989, 63.484646072448399 ], [ -150.864072657209988, 63.484706718316502 ], [ -150.864011508888012, 63.4847255965079 ], [ -150.86391997684899, 63.484763998928798 ], [ -150.863721664767013, 63.484862886819997 ], [ -150.863599749907991, 63.4849622604264 ], [ -150.863523305971995, 63.485065952041602 ], [ -150.863508152292013, 63.485122762723101 ], [ -150.863523268243, 63.485161167016599 ], [ -150.86356915598401, 63.485283112929103 ], [ -150.864149127195986, 63.485901333192999 ], [ -150.864393202153991, 63.486145065794801 ], [ -150.864530613850008, 63.486255493851303 ], [ -150.864576297674006, 63.486293420613897 ], [ -150.865644627210003, 63.486908457464601 ], [ -150.866025943184013, 63.487110263428598 ], [ -150.866087013352001, 63.487148513070402 ], [ -150.866346657909986, 63.487278309398 ], [ -150.868772831422007, 63.488346397022802 ], [ -150.869154317176992, 63.488529154767697 ], [ -150.869215596652992, 63.488559566427099 ], [ -150.869596868608994, 63.488777044416501 ], [ -150.869871540184988, 63.488964279570403 ], [ -150.869993914083011, 63.489074386377098 ], [ -150.870634676087008, 63.4897117784597 ], [ -150.870741483978009, 63.4898114752312 ], [ -150.870894277525991, 63.489925580431603 ], [ -150.870955247083003, 63.489955984590601 ], [ -150.871062244517987, 63.489997435350901 ], [ -150.871092729744987, 63.490012637195797 ], [ -150.871199295988987, 63.490055199351197 ], [ -150.87127580909501, 63.490081448568297 ], [ -150.871290992420001, 63.490089608615598 ], [ -150.871382536136991, 63.490119533046098 ], [ -150.87144359013601, 63.490143217634603 ], [ -150.871962436383001, 63.490318766620199 ], [ -150.871992808421993, 63.490326125076699 ], [ -150.872038637772988, 63.490345009179897 ], [ -150.872069325121998, 63.490352374045003 ], [ -150.872420218749994, 63.490465227694202 ], [ -150.872577580230995, 63.490526140283997 ], [ -150.872927446186992, 63.490643732566099 ], [ -150.873253892164001, 63.490756089884002 ], [ -150.873523737092, 63.490841862666798 ], [ -150.873640939388991, 63.4908826854507 ], [ -150.873707021258014, 63.4909041364944 ], [ -150.873820667124988, 63.490938689079897 ], [ -150.874132924212006, 63.4910341495222 ], [ -150.87444708932199, 63.4911367622055 ], [ -150.87489220544299, 63.491306571929101 ], [ -150.875319566363004, 63.491493634944703 ], [ -150.875350054286002, 63.491508835993599 ], [ -150.875426376949008, 63.4915429207472 ], [ -150.875586427087995, 63.491632400298997 ], [ -150.875679744977987, 63.4916735571421 ], [ -150.875820850546006, 63.491750016495999 ], [ -150.875930183601014, 63.491824624099699 ], [ -150.876000766029989, 63.491887750590202 ], [ -150.876049459210009, 63.491956345752101 ], [ -150.876089048863008, 63.492035420470302 ], [ -150.876097914335986, 63.492099158325303 ], [ -150.876113093170005, 63.492324634877797 ], [ -150.876052076901004, 63.492687420116702 ], [ -150.875945555572997, 63.4933853109656 ], [ -150.875930326434002, 63.4934846894228 ], [ -150.875853979515995, 63.493694807628401 ], [ -150.875488048987989, 63.494277487223499 ], [ -150.875411550254995, 63.494465198296901 ], [ -150.875396204335004, 63.494556733347302 ], [ -150.875411675121001, 63.494636591046998 ], [ -150.875518360840999, 63.494731801803802 ], [ -150.875681939562014, 63.494850836452102 ], [ -150.875796475659996, 63.494926738877098 ], [ -150.875962805921006, 63.495016767885502 ], [ -150.876127856083002, 63.495093728233002 ], [ -150.876301509411007, 63.495164940353298 ], [ -150.876435003553013, 63.495212786629899 ], [ -150.876585573770996, 63.4952503198569 ], [ -150.876773366582, 63.4952886331711 ], [ -150.877100190750014, 63.495347640866498 ], [ -150.877479313037014, 63.495416039705397 ], [ -150.877746366899999, 63.495460753808999 ], [ -150.877920087601012, 63.495480987923102 ], [ -150.878102783370991, 63.495491924593502 ], [ -150.878296364025999, 63.495500718906598 ], [ -150.878525008622006, 63.495505503922601 ], [ -150.878812270086996, 63.495510330229401 ], [ -150.879238155075001, 63.495514499076997 ], [ -150.879598490895006, 63.495513703311801 ], [ -150.881286633722993, 63.495464102843897 ], [ -150.881515551407006, 63.495459925971097 ], [ -150.881627429388999, 63.495463306676399 ], [ -150.881778225083991, 63.495473572664899 ], [ -150.881928580605006, 63.495487977835403 ], [ -150.882122181922, 63.495509216157998 ], [ -150.882290463324011, 63.495530517003402 ], [ -150.882360345964997, 63.495540697177603 ], [ -150.882797186805988, 63.495589761524997 ], [ -150.884796039822987, 63.495868983198498 ], [ -150.886428895837014, 63.496112537799803 ], [ -150.886459592167995, 63.496119898773202 ], [ -150.886581667824998, 63.496147090101204 ], [ -150.886886582981987, 63.496216182151301 ], [ -150.887207161164014, 63.496306883779098 ], [ -150.888656675519996, 63.4967347798991 ], [ -150.888901112499013, 63.496810448021201 ], [ -150.889160426476991, 63.496894266430701 ], [ -150.890106635440986, 63.497272448191801 ], [ -150.890930699577012, 63.497585348546401 ], [ -150.891556254000989, 63.497798893189902 ], [ -150.892563587929999, 63.498084235949399 ], [ -150.89292997300501, 63.498197395379897 ], [ -150.893768967141, 63.498458827999002 ], [ -150.894394592531995, 63.498642116333997 ], [ -150.89447087387299, 63.498664987759902 ], [ -150.894562465201005, 63.4986948984008 ], [ -150.89471506561199, 63.498737279671801 ], [ -150.894745726010996, 63.498747999441797 ], [ -150.894775994744009, 63.498756470875101 ], [ -150.894867706446007, 63.498794224720903 ], [ -150.894913482796994, 63.498801898863498 ], [ -150.895050889103004, 63.498836122027498 ], [ -150.895401721644987, 63.498977843200997 ], [ -150.895447383908987, 63.499004557614903 ], [ -150.895493336328997, 63.499088407266399 ], [ -150.895478013765995, 63.499183304564603 ], [ -150.895432137701988, 63.499248441029501 ], [ -150.895279722345009, 63.499473788218701 ], [ -150.895249346712006, 63.499511242094997 ], [ -150.89523384538299, 63.4995299626014 ], [ -150.895081341990988, 63.4997440995662 ], [ -150.89483733710199, 63.500011220986501 ], [ -150.894791434987013, 63.500133482723598 ], [ -150.894791570633004, 63.500213016603702 ], [ -150.894867953482986, 63.500327742029903 ], [ -150.895432553621987, 63.500888363057904 ], [ -150.895493387533008, 63.5009803609112 ], [ -150.89566145872999, 63.5011361976117 ], [ -150.895859727692994, 63.501316185752302 ], [ -150.896042967840998, 63.5015104229877 ], [ -150.896133832432014, 63.501602911826303 ], [ -150.896393711450997, 63.5018303133836 ], [ -150.896580222365003, 63.501957488744701 ], [ -150.896760373207002, 63.502069119422799 ], [ -150.897110865287999, 63.502258980472497 ], [ -150.897348702344004, 63.502405005209802 ], [ -150.897567133095009, 63.502532842122498 ], [ -150.897822845728001, 63.502686350589002 ], [ -150.898145018419001, 63.502892218529901 ], [ -150.898478254762011, 63.5031196535083 ], [ -150.898720356121004, 63.503301330061497 ], [ -150.898923388849994, 63.503448999873498 ], [ -150.899218363249986, 63.5036602270917 ], [ -150.899580671770991, 63.503915531621303 ], [ -150.899841898261997, 63.5040928611824 ], [ -150.900085012022004, 63.5042650726567 ], [ -150.900320643713997, 63.504432385354697 ], [ -150.900499954632011, 63.504552292125297 ], [ -150.90063017621199, 63.504632056964503 ], [ -150.900704422867989, 63.5047118436228 ], [ -150.900747751310007, 63.504781504878203 ], [ -150.900794906573992, 63.504865471025703 ], [ -150.900814297607013, 63.504934633765302 ], [ -150.900816242459996, 63.505017661693898 ], [ -150.900794249905005, 63.505100191643599 ], [ -150.900752522261996, 63.505192981847202 ], [ -150.900708259573008, 63.505284533024501 ], [ -150.900630343299014, 63.505391983294302 ], [ -150.900558738586994, 63.505490080073898 ], [ -150.900496655120008, 63.505599045198402 ], [ -150.900415331534987, 63.505713537399302 ], [ -150.900334379853007, 63.5058244805481 ], [ -150.900254048906987, 63.505929509500398 ], [ -150.90015868106201, 63.5060508225991 ], [ -150.900068082372002, 63.506152081358898 ], [ -150.899990409541005, 63.506257165610499 ], [ -150.899916762060997, 63.506349292441797 ], [ -150.899839833932987, 63.5064472785361 ], [ -150.899723804835986, 63.506562234993297 ], [ -150.899537940708996, 63.506759302587199 ], [ -150.899431077123012, 63.5069195061645 ], [ -150.899369402388999, 63.507043309586599 ], [ -150.899335523325988, 63.507137447530901 ], [ -150.899314645581001, 63.507209331302697 ], [ -150.899308231609012, 63.507295741541 ], [ -150.899320314848012, 63.507383721950099 ], [ -150.89933222111901, 63.507447988583699 ], [ -150.899361629266991, 63.507523288119202 ], [ -150.899403763847005, 63.507629676074501 ], [ -150.899433098331997, 63.507731055863097 ], [ -150.899454577050989, 63.507831086480302 ], [ -150.899493036622999, 63.507997860565602 ], [ -150.899522866079991, 63.508186072949698 ], [ -150.899553223747006, 63.508391692080799 ], [ -150.899553495936999, 63.508589966398098 ], [ -150.899583847315, 63.508777663582499 ], [ -150.899598401818992, 63.508866799457998 ], [ -150.899602993108999, 63.509083045031801 ], [ -150.899612781152001, 63.509263923932899 ], [ -150.899643838606011, 63.509364153935699 ], [ -150.899680472802004, 63.509441737582598 ], [ -150.899752876115997, 63.5095442493053 ], [ -150.899873456078012, 63.509644917080898 ], [ -150.900031894639, 63.5097506383986 ], [ -150.900235082776987, 63.509887165004102 ], [ -150.900384097113005, 63.509991267053699 ], [ -150.900483321426009, 63.5100516567989 ], [ -150.90061691168799, 63.510119872583502 ], [ -150.900903544333005, 63.510253863908602 ], [ -150.901217716628992, 63.510399806903401 ], [ -150.901412917844993, 63.510490641403003 ], [ -150.90195257895499, 63.5107436943834 ], [ -150.902277081877003, 63.5108827368785 ], [ -150.902639596110987, 63.511025412387497 ], [ -150.902897965959994, 63.5111545437465 ], [ -150.903148612991998, 63.511296319199502 ], [ -150.903397176831987, 63.511457967366702 ], [ -150.903541016871003, 63.511550578651502 ], [ -150.903855494595007, 63.511754850171698 ], [ -150.904359321009991, 63.512075437167397 ], [ -150.904752937615001, 63.512318336767102 ], [ -150.905100609883988, 63.512541789143903 ], [ -150.905522886339014, 63.512816579057599 ], [ -150.905882746950994, 63.5130459726808 ], [ -150.906120721449014, 63.513217354128898 ], [ -150.906267540302991, 63.5133427452243 ], [ -150.906390458580006, 63.5134519908813 ], [ -150.906497119146991, 63.513563744903003 ], [ -150.906585367843007, 63.5136680042188 ], [ -150.906636798189993, 63.513757274265203 ], [ -150.906653098121012, 63.513906988522997 ], [ -150.906644075441989, 63.514084631837697 ], [ -150.906623917247003, 63.514246395223701 ], [ -150.906620438970009, 63.514301516156102 ], [ -150.90658844996301, 63.5143736571235 ], [ -150.906496974518006, 63.514564429924697 ], [ -150.906435801044012, 63.514695197034797 ], [ -150.906437233855996, 63.514699008534301 ], [ -150.906444010747009, 63.514712184524299 ], [ -150.906451374237008, 63.514724688668998 ], [ -150.906453252614995, 63.514727797878301 ], [ -150.906468557212008, 63.514753139063103 ], [ -150.906477789197993, 63.514767124679302 ], [ -150.906487821582999, 63.514781107484303 ], [ -150.906496945772005, 63.514793346389197 ], [ -150.906516421247005, 63.514806142949901 ], [ -150.906528641030008, 63.514819440277797 ], [ -150.906537499317011, 63.514831669150901 ], [ -150.906546249806013, 63.514845373494801 ], [ -150.906556336090006, 63.514860360209603 ], [ -150.906568928674005, 63.514873991627397 ], [ -150.906582428555993, 63.514886978044601 ], [ -150.906601371329998, 63.514899857491002 ], [ -150.906616846607989, 63.514913157980203 ], [ -150.906636962582013, 63.514927206414903 ], [ -150.90665494685399, 63.514940196814102 ], [ -150.906667060634987, 63.514952956452198 ], [ -150.906680612619994, 63.514967198364999 ], [ -150.906688883409004, 63.514979180395102 ], [ -150.90670665298299, 63.514992562572999 ], [ -150.906720952365987, 63.515005618242803 ], [ -150.906736001842006, 63.515017880287203 ], [ -150.906751424118994, 63.515028822699001 ], [ -150.906763161506007, 63.515033918526797 ], [ -150.906778263983, 63.515046543115801 ], [ -150.906793469766001, 63.515060216909802 ], [ -150.906818177926993, 63.515084219746697 ], [ -150.906829969213987, 63.515097496914301 ], [ -150.906842243793989, 63.515110219625598 ], [ -150.906856223375996, 63.515121845449798 ], [ -150.90687153875399, 63.515135614153301 ], [ -150.906892027529011, 63.515148127727201 ], [ -150.906911450901987, 63.515159427436501 ], [ -150.906916787792994, 63.515171815607999 ], [ -150.906931088971987, 63.515183120916497 ], [ -150.906945336252988, 63.515195583992401 ], [ -150.906963052826995, 63.515208647982199 ], [ -150.907009581965013, 63.515234098508103 ], [ -150.907177381870014, 63.515364364992202 ], [ -150.907382055820989, 63.515479525519098 ], [ -150.907567283941006, 63.5155744120311 ], [ -150.907729648140986, 63.515643217534802 ], [ -150.907923942058005, 63.515712684272799 ], [ -150.908128110257991, 63.515779510855701 ], [ -150.908331170834998, 63.515826396412102 ], [ -150.908662086828997, 63.515874506536598 ], [ -150.908956921990011, 63.515900530132598 ], [ -150.909506793351994, 63.515965977002097 ], [ -150.910959443726995, 63.516179569324898 ], [ -150.911371594372014, 63.516246427263297 ], [ -150.911948355904002, 63.516360791050403 ], [ -150.912585706106, 63.516507703917 ], [ -150.91326827121199, 63.516698461656397 ], [ -150.913477765522998, 63.516761043671998 ], [ -150.913685177539008, 63.516822461835702 ], [ -150.913893845399002, 63.516883905905601 ], [ -150.914422438367012, 63.517026537406302 ], [ -150.915059447210012, 63.517207575094098 ], [ -150.915482836677995, 63.517320178072403 ], [ -150.91575467676401, 63.517382700640503 ], [ -150.916067579740997, 63.517450338897802 ], [ -150.916378479473991, 63.517506554439699 ], [ -150.916786873364998, 63.5175790097747 ], [ -150.917049141901998, 63.517641332287702 ], [ -150.917210127188014, 63.517693026930601 ], [ -150.917297697657006, 63.517731871357299 ], [ -150.917543616854999, 63.517839332076797 ], [ -150.917675057449003, 63.517928827421798 ], [ -150.917768480441993, 63.518014692088599 ], [ -150.917840297156005, 63.518092997295803 ], [ -150.917895554326009, 63.5181766507161 ], [ -150.91795824505499, 63.518311672551398 ], [ -150.918087632998009, 63.518543388166599 ], [ -150.918128499157007, 63.518703567694203 ], [ -150.918168396033991, 63.518842386366998 ], [ -150.918208809442007, 63.518945651040802 ], [ -150.918261913349994, 63.5190193011967 ], [ -150.918339594266001, 63.519072119715098 ], [ -150.918427005733008, 63.519111511430303 ], [ -150.918578715912986, 63.5191723729694 ], [ -150.91879177114501, 63.519246480376097 ], [ -150.919067947400009, 63.519329002853397 ], [ -150.919350659796009, 63.519410237711703 ], [ -150.919667903432014, 63.519497874373499 ], [ -150.919898559356, 63.519556693876403 ], [ -150.920110649798005, 63.5196094401023 ], [ -150.920337144725011, 63.519646833530103 ], [ -150.920554799331995, 63.519676930887897 ], [ -150.920845750177989, 63.519709963442601 ], [ -150.921051670991005, 63.519729859542103 ], [ -150.921260046898993, 63.519756919448902 ], [ -150.921486394503006, 63.519795730625297 ], [ -150.92165118684801, 63.519841808890099 ], [ -150.921911766552995, 63.519937292536902 ], [ -150.922094236844998, 63.520002664862602 ], [ -150.922306949818989, 63.520058766429699 ], [ -150.922503527254008, 63.520106921091497 ], [ -150.922763524851007, 63.520160650435699 ], [ -150.923031238975, 63.520201734944898 ], [ -150.923239916716994, 63.520225952955997 ], [ -150.923598669705996, 63.520253263932901 ], [ -150.923840167397003, 63.520269621667403 ], [ -150.924102238303988, 63.520303474646099 ], [ -150.924379391027003, 63.520346173529703 ], [ -150.924682087346014, 63.5203893982587 ], [ -150.924935025980005, 63.520418793888901 ], [ -150.925182616044992, 63.520438120327697 ], [ -150.925472159230992, 63.520454041769 ], [ -150.925737046357, 63.520460920229503 ], [ -150.926000218599995, 63.520453535887903 ], [ -150.926270666297, 63.520437765850197 ], [ -150.926583213540994, 63.520417170901602 ], [ -150.926892865513992, 63.520393670420198 ], [ -150.927201629053997, 63.520378687411203 ], [ -150.927692846716013, 63.520363190901399 ], [ -150.928308508892002, 63.520320377889 ], [ -150.928642669601999, 63.5203073366661 ], [ -150.928901316131999, 63.520312658258 ], [ -150.92917460070899, 63.520331084352399 ], [ -150.929341474451007, 63.5203572789219 ], [ -150.929600858497992, 63.520409294285201 ], [ -150.929796432514991, 63.5204458018735 ], [ -150.92999542731701, 63.520485740030502 ], [ -150.930200313270007, 63.520523558883497 ], [ -150.930425105890009, 63.5205531254052 ], [ -150.930634232789998, 63.520573074989599 ], [ -150.930902018779989, 63.520582848105903 ], [ -150.931687255034007, 63.5206018355791 ], [ -150.93277525767499, 63.520632730199701 ], [ -150.933299093165004, 63.520642070315503 ], [ -150.93351957387199, 63.520645176477103 ], [ -150.933954242586992, 63.5206811350292 ], [ -150.93415757625101, 63.5206952691438 ], [ -150.934429002213989, 63.520700843401499 ], [ -150.93476866420599, 63.520696437506999 ], [ -150.934973620227993, 63.520694955123702 ], [ -150.935193216993014, 63.520706577471898 ], [ -150.935417725744998, 63.520732525367499 ], [ -150.935575175261988, 63.520757097401699 ], [ -150.935793447908992, 63.520805378255197 ], [ -150.93599326826299, 63.520837484270601 ], [ -150.936193051786006, 63.520872949523799 ], [ -150.936397667346, 63.520907393374003 ], [ -150.936815183628994, 63.520957529238501 ], [ -150.937257968621992, 63.521007870087097 ], [ -150.937735880437998, 63.521058930600802 ], [ -150.938261838647009, 63.521109552042198 ], [ -150.938585785512004, 63.521133267419202 ], [ -150.938909882394995, 63.521155562499096 ], [ -150.93921643787499, 63.521161848407601 ], [ -150.939618203098007, 63.521175776011603 ], [ -150.939937092446996, 63.521186580283803 ], [ -150.940460793189999, 63.5211973144593 ], [ -150.940984494831014, 63.521208047028701 ], [ -150.941300190670006, 63.521218783999799 ], [ -150.941631411192986, 63.521234105815303 ], [ -150.94195885070701, 63.521255039822201 ], [ -150.942266395232991, 63.521282678246997 ], [ -150.942548391672005, 63.521309793556497 ], [ -150.942763185144997, 63.521336954500299 ], [ -150.943197219648994, 63.521405234642899 ], [ -150.943409423279007, 63.521436463633599 ], [ -150.943625252509008, 63.521472247360997 ], [ -150.943843015812007, 63.521513671229002 ], [ -150.944060315584011, 63.521559565683503 ], [ -150.944272787810007, 63.521606481398301 ], [ -150.944477483321009, 63.521655477750102 ], [ -150.944677467167992, 63.521704377491901 ], [ -150.944874109280988, 63.521752088403503 ], [ -150.945068237908998, 63.521799747568203 ], [ -150.945260826825006, 63.521844014250902 ], [ -150.945452821954007, 63.521884908493398 ], [ -150.945640964208991, 63.521923482873198 ], [ -150.945827168796995, 63.521956416703503 ], [ -150.946044478451, 63.521974585004699 ], [ -150.946266987553997, 63.521989094565001 ], [ -150.94659502714299, 63.522004339868602 ], [ -150.946980840981013, 63.522017921014502 ], [ -150.947331674422003, 63.522029363792797 ], [ -150.947718664154991, 63.5220315862625 ], [ -150.948115235317999, 63.522034003383503 ], [ -150.948399153254002, 63.522042652549402 ], [ -150.94864214753801, 63.522044774087803 ], [ -150.949024768763991, 63.522058284723499 ], [ -150.949343376042009, 63.522071908298599 ], [ -150.949651963511997, 63.522089594705101 ], [ -150.950055766112996, 63.522114916538399 ], [ -150.950462322949988, 63.522144561114203 ], [ -150.950810519834988, 63.522181547902001 ], [ -150.951051312348994, 63.522204959999598 ], [ -150.951267145172011, 63.522222170912997 ], [ -150.951583149133, 63.522230047029097 ], [ -150.951786501662014, 63.522244157146901 ], [ -150.952002629133005, 63.522258528793301 ], [ -150.952230504770995, 63.522283097511099 ], [ -150.952508156958004, 63.522324822990001 ], [ -150.95255248073201, 63.522331596465698 ], [ -150.952877943054006, 63.522397318962099 ], [ -150.953181257414002, 63.522466104015301 ], [ -150.953495295859994, 63.5225550237394 ], [ -150.953743150929, 63.522634056630999 ], [ -150.953935137075007, 63.522696301222098 ], [ -150.954155719291009, 63.522760551015701 ], [ -150.954374134771001, 63.522814798425401 ], [ -150.954648716516004, 63.522882994530796 ], [ -150.955021827276994, 63.522988764955997 ], [ -150.955238633873989, 63.523058626336599 ], [ -150.95538896424199, 63.523121441517802 ], [ -150.955525347367001, 63.523195352838698 ], [ -150.955631966611008, 63.523278615636599 ], [ -150.955741162224001, 63.5233989178694 ], [ -150.955827887378007, 63.523488888393899 ], [ -150.955923019864997, 63.523590410122402 ], [ -150.955984373901003, 63.523647142224597 ], [ -150.95605516024699, 63.523705490606403 ], [ -150.956152082177994, 63.523758680120203 ], [ -150.956382640185012, 63.523881456165903 ], [ -150.956700836934004, 63.524054387338602 ], [ -150.95703427360101, 63.524234742078598 ], [ -150.957155724030997, 63.524298388882002 ], [ -150.957287339796011, 63.5243565533113 ], [ -150.957394579777002, 63.5244028396733 ], [ -150.957786388970987, 63.524575845780298 ], [ -150.958033092399006, 63.524689597903503 ], [ -150.958593275521991, 63.524973111800598 ], [ -150.95891370099099, 63.5251711788706 ], [ -150.959233977339011, 63.525419646914102 ], [ -150.959524087362013, 63.5256215757897 ], [ -150.959768228795014, 63.5257744027112 ], [ -150.960058102559998, 63.525957283507701 ], [ -150.960296080652, 63.526092243708398 ], [ -150.960532915188992, 63.526216563492902 ], [ -150.960728401170996, 63.526307322043799 ], [ -150.960908797253012, 63.526389237438103 ], [ -150.96106888422301, 63.526450821897697 ], [ -150.961242478261994, 63.526505569668302 ], [ -150.961487779419997, 63.526578846716198 ], [ -150.961801154910006, 63.526674846832698 ], [ -150.962197990177998, 63.5267995753413 ], [ -150.962516655846997, 63.526909908779601 ], [ -150.962850608146994, 63.5270020426643 ], [ -150.963247415567992, 63.527162447825603 ], [ -150.963568026090002, 63.527334744836203 ], [ -150.963814010865008, 63.5274555445366 ], [ -150.964005589175997, 63.527553331268301 ], [ -150.964278005083003, 63.527705398224498 ], [ -150.964431404994002, 63.527800986105902 ], [ -150.964594241707005, 63.527898188220199 ], [ -150.964733136521005, 63.527979254933101 ], [ -150.964915578966014, 63.528072586661899 ], [ -150.965237063547988, 63.528245565714798 ], [ -150.965371323954002, 63.528309466253901 ], [ -150.96566304555401, 63.5284917970341 ], [ -150.965832279170002, 63.528589128534797 ], [ -150.965948528355, 63.5286725782098 ], [ -150.966083633176993, 63.528784659456797 ], [ -150.966241113236009, 63.528877687434303 ], [ -150.966353459239997, 63.528936874012203 ], [ -150.966426468917007, 63.528973921669802 ], [ -150.966544490476991, 63.529009039659201 ], [ -150.966669922239987, 63.529034349346603 ], [ -150.966761867504999, 63.5290576084683 ], [ -150.966951269197011, 63.5290998133529 ], [ -150.967115746233986, 63.5291501005984 ], [ -150.967276152105995, 63.529208839346097 ], [ -150.967480694903003, 63.5292741656095 ], [ -150.96762367256099, 63.529346776865502 ], [ -150.967765921683991, 63.529426485664899 ], [ -150.967879130070997, 63.529508450164201 ], [ -150.967999880712995, 63.529610483824698 ], [ -150.968172597995988, 63.529736333859297 ], [ -150.968346613345005, 63.529880704570701 ], [ -150.968480289846013, 63.529981578126097 ], [ -150.968571011605007, 63.530033211179799 ], [ -150.968717481911995, 63.530103046105602 ], [ -150.968859314217013, 63.5301557167844 ], [ -150.969121933995012, 63.530247826173998 ], [ -150.969366872233991, 63.5303704389651 ], [ -150.969534717952996, 63.530484736154399 ], [ -150.970068751117992, 63.530782320791303 ], [ -150.970740111537992, 63.531068127247302 ], [ -150.970984279920003, 63.531194051730303 ], [ -150.971182636019989, 63.531308965819299 ], [ -150.971365771963008, 63.531461656177299 ], [ -150.971527333068991, 63.5316054187848 ], [ -150.971603818326997, 63.531702284429898 ], [ -150.971675661989991, 63.5317819846464 ], [ -150.97176231438101, 63.531873366101301 ], [ -150.971851155066986, 63.531943451963798 ], [ -150.971970920258002, 63.532024122820999 ], [ -150.97221029253501, 63.532218182448503 ], [ -150.972451116489992, 63.5324293418171 ], [ -150.972587561598004, 63.532565832845897 ], [ -150.972857423594007, 63.532806032201201 ], [ -150.972994008840004, 63.532972398977499 ], [ -150.973159200037998, 63.533140769392404 ], [ -150.973276923356991, 63.5332726124483 ], [ -150.973301451856003, 63.533314364297098 ], [ -150.973313614147003, 63.5334141927896 ], [ -150.973303517981009, 63.533637336320098 ], [ -150.973323080592991, 63.533758654215802 ], [ -150.973345849292002, 63.533848739807098 ], [ -150.97337035623201, 63.533953086779803 ], [ -150.973383393480987, 63.534044397224001 ], [ -150.973384382526007, 63.534128350993797 ], [ -150.973365302309986, 63.534200571968299 ], [ -150.973350036340008, 63.534303315073203 ], [ -150.973398667536003, 63.534394666832704 ], [ -150.973460794123014, 63.534475591381003 ], [ -150.97353221557799, 63.534559549486403 ], [ -150.973615833459007, 63.534649445189203 ], [ -150.973731341534005, 63.534742289103797 ], [ -150.973923363611988, 63.534857116438602 ], [ -150.974039792458996, 63.534916949565499 ], [ -150.974174976332989, 63.534972324030299 ], [ -150.97435618898399, 63.535047126226402 ], [ -150.974496746580002, 63.535112568028801 ], [ -150.974617695749998, 63.535181879696502 ], [ -150.974724410215003, 63.535265129938701 ], [ -150.974809196805012, 63.535343667649997 ], [ -150.974907192222986, 63.535449502780899 ], [ -150.974999529152996, 63.535548109607902 ], [ -150.975090707255987, 63.535626776646097 ], [ -150.975174340409012, 63.535685374755502 ], [ -150.975245921764014, 63.535736615576198 ], [ -150.975347570629992, 63.535775661629799 ], [ -150.975456918956013, 63.535802061000801 ], [ -150.975592553783997, 63.535821878627701 ], [ -150.97589795942099, 63.535840865569902 ], [ -150.976330729098009, 63.535866698823902 ], [ -150.976714554963991, 63.535901498479099 ], [ -150.977087777116992, 63.535946040326401 ], [ -150.977374009111998, 63.535995934398699 ], [ -150.977606072696005, 63.536043308366303 ], [ -150.977797032067997, 63.536116879173299 ], [ -150.977977099366996, 63.536203033397499 ], [ -150.978337084843986, 63.5364080580595 ], [ -150.978726117344991, 63.536642121503299 ], [ -150.979046467355005, 63.536827849299002 ], [ -150.979419248434994, 63.537033130069098 ], [ -150.979792757150989, 63.537262608512499 ], [ -150.980116752523998, 63.537444139116502 ], [ -150.98022828645199, 63.537511833510997 ], [ -150.980377866726002, 63.537614439395199 ], [ -150.980468777130994, 63.5376959436459 ], [ -150.980538192647998, 63.537768476624898 ], [ -150.980607026954999, 63.537846688407903 ], [ -150.98070969540899, 63.537960245522598 ], [ -150.980792189498004, 63.538008339957102 ], [ -150.980908228477006, 63.538063321337702 ], [ -150.981059850621989, 63.538114755229898 ], [ -150.981227741256987, 63.538163671200699 ], [ -150.981402751938987, 63.538205618036898 ], [ -150.981665774162991, 63.538263569584601 ], [ -150.981954068689987, 63.538324876632998 ], [ -150.982296248659992, 63.538391539397402 ], [ -150.982478085639997, 63.538429354936802 ], [ -150.982654986377014, 63.538452844969903 ], [ -150.983003125770011, 63.538492596612002 ], [ -150.983280822873013, 63.538532347398203 ], [ -150.983532812886011, 63.538573001972502 ], [ -150.983827797168004, 63.538631595229702 ], [ -150.984119294188986, 63.538692961529399 ], [ -150.984317258623008, 63.5387296786934 ], [ -150.984465260558011, 63.5387540050694 ], [ -150.984698767733988, 63.538793231522199 ], [ -150.985374734713986, 63.538881293004998 ], [ -150.985405325942992, 63.538884149807998 ], [ -150.985435805781009, 63.538888125394998 ], [ -150.985648678654997, 63.538934559504703 ], [ -150.985786625747011, 63.538964648930801 ], [ -150.985908742726991, 63.539006316795302 ], [ -150.986030745620013, 63.539049102176001 ], [ -150.986202865524007, 63.5391231475637 ], [ -150.986473305136997, 63.539239487915999 ], [ -150.9866357951, 63.539290026673697 ], [ -150.986773055879013, 63.539325515427301 ], [ -150.986923096091004, 63.539361262313498 ], [ -150.987070810565001, 63.5393884252898 ], [ -150.987322525693997, 63.539431912976603 ], [ -150.987564506679007, 63.539476625430297 ], [ -150.987666910129008, 63.539508564741297 ], [ -150.987803300440987, 63.539552570596101 ], [ -150.987895826016995, 63.539587156812701 ], [ -150.988014060478008, 63.539620837976301 ], [ -150.988114863130988, 63.539637096150202 ], [ -150.988229609433006, 63.539642254830298 ], [ -150.988289390518986, 63.539651340957597 ], [ -150.988423652720996, 63.539623405710103 ], [ -150.988790526479988, 63.539542600237901 ], [ -150.989138805111992, 63.5394557296068 ], [ -150.989355355690009, 63.539404613948697 ], [ -150.989512067688992, 63.539375052147399 ], [ -150.989583380448011, 63.539366531118702 ], [ -150.989648882005014, 63.539352202912099 ], [ -150.989685970748013, 63.539376952246698 ], [ -150.989764508657004, 63.539411436606699 ], [ -150.989836559830991, 63.539458411433202 ], [ -150.989909633287994, 63.539526746284402 ], [ -150.989961787677004, 63.539580432663399 ], [ -150.990036309217999, 63.539634570846303 ], [ -150.990140750047999, 63.539677930872003 ], [ -150.990242063842004, 63.539699096314102 ], [ -150.990271860960007, 63.539705100351298 ], [ -150.990518411674003, 63.539773740416202 ], [ -150.990757649203999, 63.539845422346403 ], [ -150.991077217679987, 63.539945750728599 ], [ -150.99131937204001, 63.540051631624202 ], [ -150.991479741081008, 63.540111766059702 ], [ -150.991646936420011, 63.540167768857998 ], [ -150.991747173134002, 63.540221000533599 ], [ -150.991850894414, 63.5402714574995 ], [ -150.992039744540989, 63.5403663068277 ], [ -150.992187189519996, 63.540427601750899 ], [ -150.992352505583, 63.540502059827503 ], [ -150.992519558988988, 63.540559482371897 ], [ -150.99271174545899, 63.540621677456301 ], [ -150.992876039239007, 63.540674775799999 ], [ -150.99302276377, 63.540743168575197 ], [ -150.993138404793996, 63.540802399780802 ], [ -150.993243732261988, 63.540868536825599 ], [ -150.993300839061988, 63.5409365472959 ], [ -150.993356054011002, 63.540991717152998 ], [ -150.993413739326996, 63.541054049781302 ], [ -150.993466048225997, 63.541106316001802 ], [ -150.993542029530005, 63.541146255664501 ], [ -150.993653740425003, 63.541181222985898 ], [ -150.993823407029993, 63.541213089143703 ], [ -150.993999608877999, 63.541243664467601 ], [ -150.994200794670007, 63.541281135214597 ], [ -150.994381107208994, 63.541325825156903 ], [ -150.994733439040004, 63.541388831468502 ], [ -150.995033818602991, 63.541467569250102 ], [ -150.995308792012992, 63.541548591002503 ], [ -150.995410564846992, 63.541600499700401 ] ] } }

