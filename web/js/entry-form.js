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

let UNIT_PER_METER_MAP = new Map([
	["ft", 3.2808399],
	["yd", 1.0936132],
	["m", 1],
]);
var MULTIPLE_SELECT_ENTRY_CLASS = 'bhims-select2';

var BHIMSEntryForm = (function() {
	
	/*
	Main Constructor
	*/
	var _this;
	var Constructor = function() {
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
				icon: L.icon({
					iconUrl: LEAFLET_MARKER_ICON_URL.icon, //defined in bhims.js
					iconSize: [25, 41],
					iconAnchor: [12, 41],
					shadowUrl: LEAFLET_MARKER_ICON_URL.shadow
				}),
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
		this.maxFileUploadSize = 2147483648;
		this.userRolesForNotification = [1]; // if user has one of these roles, an email notification should be sent on submission
		this.dataAccessUserRoles = [2, 3]; // to determine if user should be able to open query page
		this.roadsGeoJSON;
		this.dataEntryConfig = {};
		this.fileCacheTiming = {}; // for estimating download times for large files when installing PWA
		this.dbSchema = 'public';
		this.customEvents = {
			sericeWorkerReady: 'service-worker-ready',
			fieldsFull: 'fields-full'
		}
		this.reactionCodes = {};
		this.formConfiguration = {
			pages: {},
			sections: {},
			accordions: {},
			fieldContainers: {},
			fields: {}
		};
		_this = this;
	}


	Constructor.prototype.getLocationCoordinates = function() {
		return $.get({
			url: '/flask/db/select/locations',
		}).done(response => {
			if (pythonReturnedError(response)) {
				const message = 
					'Default coordinates for encounter locations could not be loaded. When you select' + 
					' a placename or backcountry unit where the encounter occurred, the latitude and' +
					' longitude will not be filled with default values. You should fill in these fields' +
					' mannually if you know the location where the encounter occurred.';
				showModal(message, 'Warning: Default Coordinates Unavailable');
			} else {
				const result = response.data || {};
				for (const {code, latitude, longitude} of (result.backcountry_unit_codes || [])) {
					_this.backcountryUnitCoordinates[code] = {lat: latitude, lon: longitude}
				};
				for (const {code, latitude, longitude} of (result.place_name_codes || [])) {
					_this.placeNameCoordinates[code] = {lat: latitude, lon: longitude}
				};
			}
		}).fail(() => {
			print('getting placename/BC coordinates failed')
		})
	}


	Constructor.prototype.showInstallationReadyMessage = function() {
		const message = '<span class="install-ready-message">' +
			'The app is ready to use offline on your device. If you collect' +
			' a BHIMS report while offline, be sure to press the <strong>' +
			'Upload offline data</strong> button when reconnect to Arrowhead' +
			' WiFi. If you delete the app from this device\'s home screen,' +
			' you will lose any reports you did not upload.' +
		'</span>'
		showModal(message, 'App Ready for Offline Use');

		window.localStorage.installReady = true;
	}


	Constructor.prototype.showCacheProgress = function({resourceName, loaded, total}) {
		const $list = $('#alert-modal .modal-download-progress-list');
		let $li = $list.find(`li[data-resource="${resourceName}"]`);
		let cacheTiming = (_this.fileCacheTiming[resourceName] = _this.fileCacheTiming[resourceName] || {});
		// If it doesn't exist yet in the list, add it
		const progressText = `${(loaded/1000000).toFixed(1)} / ${Math.round(total/1000000)} MB`;
		if (!$li.length) {
			const htmlID = 'progress-item-' + removeSpecialCharacters(resourceName);
			$li = $(`
				<li class="modal-download-progress-item" data-resource="${resourceName}">
					<label class="modal-download-progress-label" for="${htmlID}">${cacheTiming.name || resourceName}</label>
					<div class="attachment-progress-bar-container">
						<div class="attachment-progress-bar">
							<div class="attachment-progress-indicator"></div>
						</div>
					</div>
					<span class="modal-download-progress-ratio">${progressText}</span>
				</li>
			`).appendTo($list);

			cacheTiming.startTime = new Date();
		}

		// Set progress bar width and progress text
		const previousBytesLoaded = parseInt($li.data('loaded') || 0)
		const newProgress = (cacheTiming.progress = loaded / total);

		if (previousBytesLoaded < loaded) {
			const $barContainer = $li.find('.attachment-progress-bar');
			$li.find('.attachment-progress-indicator')
				.css('width', `${Math.ceil($barContainer.width() * newProgress)}px`);
			$li.find('.modal-download-progress-ratio')
				.text(progressText);
			$li.data('loaded', loaded)
		}


		// calculate remaining time for this file
		const elapsedTime = new Date() - cacheTiming.startTime;
		if (elapsedTime === 0) return;

		cacheTiming.totalTime = elapsedTime * (1 / newProgress);
		cacheTiming.remainingTime = cacheTiming.totalTime - elapsedTime;

		// find the file with the most time remaining and set the estimated timer with that
		const remainingTimes = Object.values(_this.fileCacheTiming).map(t => t.remainingTime);

		if (remainingTimes.every(t => t === 0)) {
			// show new message telling the user to install
			//showModal('The BHIMS app is ready to install. ', 'Installation Ready')
			this.showInstallationReadyMessage();
		}

		const maxRemaining = Math.max(...remainingTimes);
		const fileWithMostRemaining = Object.values(_this.fileCacheTiming).filter(f => f.remainingTime === maxRemaining)[0];
		// if all files are reporting and progress is at least 5% on the one 
		//	with the longest to go, set the timer
		if (remainingTimes.every(t => t !== undefined) && fileWithMostRemaining.progress >= 0.05) {
			const remainingTimeText = millisecondsToTimeInterval(maxRemaining);
			// millisecondsToTimeInterval() will return an empty string if 
			//	the given milliseconds < 1 second
			if (remainingTimeText) {
				$('#alert-modal .modal-download-time-value')
					.removeClass('blink')
					.text(remainingTimeText);
			}
		}

	}

	/*
	Show the file
	*/
	Constructor.prototype.showCacheProgressModal = function() {
		const modalBody = `
			<div class="mb-3">
			There are a few resources that will take a while to download.
			Please leave your device on and the app open while the downloads 
			finish.
			</div>
			<h6 class="w-100 mb-2">Download Progress</h6>
			<ul class="modal-download-progress-list"></ul>
			<div class="d-inline w-100">
				<label class="modal-download-time-label mr-2 me-2">Estimated time remaining:</label>
				<span class="modal-download-time-value blink">Calculating...</span>
			</div>
		`;
		showModal(modalBody, 
			'Preparing BHIMS App Installation', 
			{
				footerButtons: '<!--empty-->', 
				dismissable: false
			}
		);
	}


	Constructor.prototype.onLargeResourceMessage = function(data) {
		var cachedResources = [];
		var cacheMatchPromises = [];
		for (const url of data.resources) {
			// check if the resource is already cached
			cacheMatchPromises.push(
				caches.match(url).then(response => {
					if (response) {
						print(url + ' already cached')
						cachedResources.push(url);
					} else {
						print(url + ' not cached')
						// add the file to the cache timing property so that showFetchProgress
						//	knows how many files to expect
						const resourceName = url.split('/').pop();
						_this.fileCacheTiming[resourceName] = {name: resourceName};

						// tell the service worker to fetch it so it can be cached
						// **** this pattern doesn't work because the service worker thinks the
						//	resource is already cached by the time it receives the fetch request 
						//	to respondWithProgress()
						$.get(url);
					}
				})
			);
		}
		// once all promises have resolved (or failed), show progress or a message saying the app is ready to install (if all resources are already cached)
		Promise.all(cacheMatchPromises)
			.then( () => {
				if (cacheMatchPromises.length === cachedResources.length) {
					this.showInstallationReadyMessage();
				} else {	
					// There's at least one resource that needs to be cached
					_this.showCacheProgressModal();
				}
			})
			// if any failed, just show progress modal anyway
			.catch( () => {_this.showCacheProgressModal()})
	}


	/*
	When registering the service worker, track progress of large resources and 
	show the user the progress so they know when it's safe to install
	*/
	Constructor.prototype.preparePWAInstall = function() {
		// New registration will only occur if registration doens't already exists.
		//	Technically if there's an update to the servcice worker, a new registration
		//	would occur, but the pre-cache strategy for offline use includes the service
		//	worker, so the user would have to clear their cache to see the update
		registerServiceWorker();

		// and show them the download progress
		navigator.serviceWorker.ready.then(registration => {
			// Let the cachePWAUserInfo() method know the service worker
			//	(and therefore the cache) is ready
			window.dispatchEvent(new CustomEvent(_this.customEvents.serviceWorkerReady));

			registration.active.postMessage({message: 'get large resources' });

			// listen for progress communication from service worker
			navigator.serviceWorker.onmessage = e => {
				const messageType = e.data.type;
				const $modal = $('#alert-modal');
				if (messageType === 'large resources response') {
					_this.onLargeResourceMessage(e.data);
				}// handle progress updates
				else if (messageType === 'cache progress') {
					if (!$modal.find('.install-ready-message').length &&
						!$modal.find('.modal-download-progress-list').length
						) {
						_this.showCacheProgressModal();
					}
					if (e.data.resourceName in _this.fileCacheTiming) {
						_this.showCacheProgress(e.data);
					}
				} else if (messageType === 'cache error') {
					// TODO: handle errors (maybe try forcing reloading resource)
				}
			}
		});
	}


	/*
	Prompt user to install PWA
	*/
	Constructor.prototype.confirmPWAInstall = function() {

		const eventHandler = () => {
			$('#alert-modal .confirm-button').click(() => {
				_this.preparePWAInstall();
			})
		}
		const message = 
			'Looks like you\'re viewing the BHIMS web app on a mobile device.' +
			' Would you like to install the app for offline use? If you don\'t' +
			' install the app, you won\'t be able to collect BHIMS reports without'+
			' a connection to the NPS network.';
		const footerButtons = `
			<button class="generic-button secondary-button modal-button close-modal" data-dismiss="modal">No</button>
			<button class="generic-button modal-button confirm-button">Yes</button>
		`
		showModal(
			message, 
			'Install App?', 
			{
				footerButtons: footerButtons,
				eventHandlerCallable: eventHandler, 
				dismissable: false
			}
		);
	}


	/*
	If a user installs the app as a PWA, it needs to have the flask/userInfo 
	request cached. To cache it, the service worker needs to be registered first.
	Add an event listener that will wait until 
	*/
	Constructor.prototype.cachePWAUserInfo = function(pwaRequestID) {
		// The mobile request has expired or is invalid. Redirect the user back to the mobile request page
		if (pwaRequestID) {
			window.addEventListener(_this.customEvents.serviceWorkerReady, ()=> {
				// if the userInfo response is valid, add it to the cache as 
				//	flask/user_info so that when the PWA is offline, that endpoint
				//	will return the cached response. Although this duplicates the 
				//	request, it's necessary since there's no way to wait for both
				//	the custom event and the user info query
				getUserInfo({pwaRequestID: pwaRequestID})
					.done(response => {
						if (pythonReturnedError(response) || !response) {
							const message = 'Your mobile request has expired or is invalid. Return to the' +
							` <a href="${this.dataEntryConfig.mobile_request_url}">mobile request page</a>` + 
							' and create a new request.';
							const footerButton = ` <a class="generic-button" href="${this.dataEntryConfig.mobile_request_url}">OK</a>`
							showModal(
								message, 
								'Invalid Mobile Request', 
								{
									footerButtons: footerButton, 
									dismissable: false
								}
							);
							$('#main-form-container').remove();
						} else {
							const putResponse = new Response(
								JSON.stringify(response),
								{
									headers: {'Content-Type': 'application/json'}
								}
							);
							const cloneResponse = putResponse.clone();
							putResponse.text().then(text => console.log('Response Body:', text));
							window.caches.keys()
								// Get the first key (via destructuring with a 1-element array)
								//	because we only have one cache
								.then(([cacheName]) => {return window.caches.open(cacheName)})
								.then(cache => {
									cache.put('/flask/user_info', cloneResponse)
									.catch(
										// TODO handle errors
									)
								})
						}
					})
			})
		}
	}



	/* 
	Configure the form using meta tables in the database
	*/
	Constructor.prototype.configureForm = function(mainParentID=null, isNewEntry=true) {

		const queryParams = parseURLQueryString();
		const pwaRequestID = queryParams.mobile

		// Add the an listener to wait for the service worker, 
		//	then put the user info into the cache. Add the event before
		//	doing anything else so the app is listening before the service
		//	worker could be activated
		_this.cachePWAUserInfo(pwaRequestID);

		// Register the service worker to make the app run as a PWA
		if (isMobile() && !window.localStorage.installReady) { 
			this.preparePWAInstall();
		}

		this.presentMode = queryParams.present === 'true'

		// ajax
		const getEnvDeferred = getEnvironment()
			.done(resultString => {
				this.serverEnvironment = resultString.trim();
				this.dbSchema = this.serverEnvironment === 'prod' ? 'public' : 'dev';
			})

		// ajax
		var deferred = $.Deferred();		
		const userInfoDeferred = getUserInfo({pwaRequestID: pwaRequestID})
			.done(result => {
				if (pythonReturnedError(result)) {
					console.log(result)
				} else {
					const userInfo = result;
					_this.username = userInfo.username;
					_this.userRole = userInfo.role;

					if (!isNewEntry) {
						// If this is the query page, check if the user has permission to access it
						const canAccessData = _this.dataAccessUserRoles.includes(parseInt(userInfo.role))
						if (!canAccessData) {
							showPermissionDeniedAlert();
						}
					}

					
				}
			});
		
		// ajax
		// Query configuration tables from database
		getEnvDeferred.done(() => {
			$.when(
				userInfoDeferred,
				loadConfigValues(this.dataEntryConfig),
				this.getFormConfiguration()
			).then((userInfoResponse, loadConfigResponse, _) => {
				if (pythonReturnedError(userInfoResponse)) {
					// TODO: update 500 error response to return an 
					//	object with the error type and full traceback as separate properties
					//showModal('An unexpected error occurred while retrieving user information:\n' + userInfoResponse, 'Unexpected Error');
					return;
				}
				const pages = this.formConfiguration.pages;
				if (isNewEntry) {
					if (Object.keys(_this.dataEntryConfig).length) {
						$('#title-page-title').text(_this.dataEntryConfig.entry_form_title);
						$('#title-page-subtitle').text(_this.dataEntryConfig.park_unit_name);
						$('.form-page.title-page .form-description').html(_this.dataEntryConfig.entry_form_description_html);
						$('#pre-submit-message').text(_this.dataEntryConfig.entry_pre_submission_message);
						$('#post-submit-message').html(_this.dataEntryConfig.entry_post_submission_message);
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
				const sections = this.formConfiguration.sections;
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
				const accordions = this.formConfiguration.accordions;
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
				const fieldContainers = this.formConfiguration.fieldContainers;
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
				const fields = this.formConfiguration.fields;
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
								
								const characterCounterHTML = fieldInfo.max_length ?
									`<span class="character-count-container hidden ml-2">(<em class="character-count"></em> of ${fieldInfo.max_length})</span>` : 
									'';
								var fieldLabelHTML = `<label class="field-label" for="${fieldInfo.html_id}">${fieldInfo.label_text || ''}${characterCounterHTML}</label>`
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
								if (fieldInfo.max_length && fieldInfo.html_input_type === 'text')
									inputFieldAttributes += ` data-max-length=${fieldInfo.max_length}`;
								if (fieldInfo.html_input_type == 'datetime-local') 
									inputFieldAttributes +=' pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}"';
								if (fieldInfo.css_class.includes(MULTIPLE_SELECT_ENTRY_CLASS))
									inputFieldAttributes += ' multiple="true"';
								const inputTagClosure = inputTag != 'input' ? `</${inputTag}>` : ''; 
								const required = fieldInfo.required === true;
								const $field = $(`
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
							<select class="input-field no-option-fill coordinates-select ignore-on-insert" name="coordinate_format" id="input-coordinate_format" value="ddd" required>
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
							<input class="input-field input-with-unit-symbol text-right coordinates-ddd" type="number" step="0.00001" min="-90" max="90" name="latitude" placeholder="Lat: dd.ddd" id="input-lat_dec_deg" required>
							<span class="required-indicator">*</span>
							<span class="unit-symbol">&#176</span>
							<label class="field-label" for="input-lat_dec_deg">Latitude</label>
						</div>
						<div class="field-container col-6">
							<input class="input-field input-with-unit-symbol text-right coordinates-ddd" type="number" step="0.00001" min="-180" max="180" name="longitude" placeholder="Lon: ddd.ddd" id="input-lon_dec_deg" required>
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
							<img id="encounter-marker-img" src="imgs/leaflet-marker-icon-2x.png" class="draggable-marker" alt="drag and drop the marker">
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
								<label class="generic-button text-center file-input-label" for="attachment-upload" disabled>select file</label>
								<input class="input-field hidden attachment-input" id="attachment-upload" type="file" accept="" name="uploadedFile" data-dependent-target="#input-file_type" data-dependent-value="!<blank>" onchange="entryForm.onAttachmentInputChange(event)" required disabled>
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
				// ajax
				const lookupTableDeferred = $.get({url: '/flask/lookup_options'})
					.done(response => {
						var deferred = $.Deferred();
						if (pythonReturnedError(response)) {
							showModal('The form cannot be loaded because of an error while retrieving lookup values from the database:\n' + response,
								'Database Error'
							)
							return; 
						}
						$('select').map( (_, el) => {
							const $el = $(el);
							const placeholder = $el.attr('placeholder');
							const lookupTable = $el.data('lookup-table');
							const lookupTableName = lookupTable ? lookupTable : $el.attr('name') + 's';
							const id = el.id;

							// reaction code selects get updated when the 'reaction by' 
							//	select is updated 
							if (lookupTableName === 'reaction_codes') {
								for (row of response[lookupTableName]) {
									const actionBy = row.action_by;
									if (!(actionBy in this.reactionCodes) ) this.reactionCodes[actionBy] = [];
									this.reactionCodes[actionBy].push({code: row.code, name: row.name})
								}
							
							} else if (lookupTableName in response) { 
								if (placeholder) $('#' + id).append(`<option class="" value="">${placeholder}</option>`);
								if (!$el.is('.no-option-fill')) {
									fillSelectOptions(id, response[lookupTableName]);
								}
							}
							deferred.resolve();
						})
						return deferred;
				})

				lookupTableDeferred.then(function() {
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
					for (const el of $(`.${MULTIPLE_SELECT_ENTRY_CLASS}`)) {
						const $select = $(el);
						$select.select2({
							width: '100%',
							placeholder: $select.attr('placeholder') || $select.find('option[value=""]').text()
						});
						
						// .select2 removes the .default class for some reason
						$select.addClass('default');
					}

					// Indicate that configuring form finished
					deferred.resolve();
				});

				$('select').change(this.onSelectChange);
				
				// Add distance measurement units to unit selects
				$('.short-distance-select')
					.empty()
					.append(`
						<option value="m">meters</option>
						<option value="ft">feet</option>
						<option value="yd">yards</option>
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

				if (!this.maps.main.mileposts) {
					const mapDeferred = this.configureMap('encounter-location-map', this.maps.main);
					this.configureMap('modal-encounter-location-map', this.maps.modal)
					this.maps.modal.map.on('moveend', e => { // on pan, get center and re-center this.maps.main.map
							const modalMap = e.target;
							this.maps.main.map.setView(modalMap.getCenter(), modalMap.getZoom());
						}).scrollWheelZoom.enable();
					
					// If the coordinates have not been set and the app is running as a PWA,
					//	try to get the coordinates from the Geolocation API
					mapDeferred.then(() => {
						// Location services is blocked on DOI computers, but it might work on mobile
						//	I can't test on a laptop though
						if (!this.markerIsOnMap() && isPWA()) {
							//this.getCurrentLocation();
						}
					})
				}

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
				userInfoDeferred.then(() => {

					if (isNewEntry) $('#input-entered_by').val(_this.username).change();	

					// Set the view of the form according to user role
					if (this.userRole < 2) { // >2 === assessment or admin
						// Remove the asseessment section bcecause this user doesn't have 
						//	the permission to assess the encounter
						$('.form-section.requires-assessment-role').remove();
					} else {
						// Remove locks on admin sections
						$('.unlock-button, .locked-section-screen').remove();
						$('.form-section.admin-section, .form-section.requires-assessment-role').removeClass('locked');
						//$('#input-assessed_by').val(this.username);
						
						if (isNewEntry) {
							if (!isPWA()) {
								addSidebarMenu();
							}
							$('#disable-required-slider-container').removeClass('hidden');
							$('.main-content-wrapper').appendTo('.main-container-with-sidebar');
							$('#username').text(this.username);
							
						}
					}
				});

				// Fill datetime_entered field
				const $datetimeEnteredField = $('#input-datetime_entered');
				if ($datetimeEnteredField.length) { // could be disabled
					_this.setDatetimeEntered();
				}

				_this.getLocationCoordinates();

				window.addEventListener('fields-full', e => {
					customizeEntryForm();//setTimeout(() => {customizeEntryForm()}, 5000);
				});

			})
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

			// Value is either:
			//		- a string/number corresponding to a single field
			//		- an array of values for multiple-choice-enabled selects or 
			//		- an array of objects containing a series of values corresponding 
			//		  to an accordion with potentially several cards
			if (Array.isArray(value) && typeof(value[0]) === 'object') { // corresponds to an accordion
				// Loop through each object and add a card/fill fields 
				const $accordion = $('.accordion').filter((_, el) => $(el).data('table-name') === key);

				//if the accordion is hidden, ignore it
				if (
					!$accordion.length || 
					($accordion.is('.hidden') && !$accordion.is('.collapse'))
				) continue;
				
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
				if (value !== null) {
					if ($input.is('.input-checkbox')) {
						$input.prop('checked', value);
					} else {
						$input.val(value);
					}
					$input.change();//call change event callbacks
				}
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
			const reactionDeferreds = []; // collect deferreds to dispatch fields-full event
			for (index in reactions) {
				const $card = this.addNewCard($reactionsAccordion, index);
				const $reaction = $('#input-reaction-' + index);
				const reactionByValue = reactions[index].reaction_by;
				const $reactionBy = $('#input-reaction_by-' + index)
					.val(reactionByValue)
					// Don't trigger change because it will call .updateReactionsSelect(). We need the 
					//	deferred returned from it and we don't want to call it twice. Other .change
					// 	event handlers aren't necessary

				
				this.updateReactionsSelect($reactionBy)
				// For some reason the index var doesn't correspond to the appropriate 
				//	iteration of the for loop (even though $reaction does). Get the 
				//index from the id to set the select with the right val
				const thisIndex = $reaction.attr('id').match(/\d+$/)[0]
				$reaction
					.val(reactions[thisIndex].reaction_code)
					.change();
			}
			// Once reaction_code fields have been set, dispatch the fields-full event
			window.dispatchEvent(fieldsFullEvent);
			
			
		} else { 
			// If there are no reactions to worry about, signal that fields have been filled
			window.dispatchEvent(fieldsFullEvent);
		}
	}


	/* 
	Get info from the database about each field 
	*/
	Constructor.prototype.getFieldInfo = function(entryFieldConfig) {
		const pageName = window.location.pathname.split('/').pop();
		const fieldValueString = window.localStorage[pageName] ? window.localStorage[pageName] : null;
		if (fieldValueString) this.fieldValues = $.parseJSON(fieldValueString).fieldValues;

		for (const row of Object.values(entryFieldConfig)) {
			const columnName = row.field_name;
			this.fieldInfo[columnName] = {};
			for (const property in row) {
				this.fieldInfo[columnName][property] = row[property];
			}
		}
	}


	/*
	Get form configuration either from the database or cached data
	*/
	Constructor.prototype.getFormConfiguration = function() {

		return $.get({url: '/flask/entry_form_config'})
			.done(response => {
				if (pythonReturnedError(response)) {
					showModal('Error when retrieving form configuration: <br><br>' + response, 'Form Configuration Error')
				} else {
					this.formConfiguration = deepCopy(response.form_config);
					this.acceptedAttachmentExtensions = deepCopy(response.accepted_attachment_extensions);
					this.getFieldInfo(this.formConfiguration.fields);
				}
			})
			.fail((xhr, status, error) => {
				showModal('Error when retrieving form configuration: ' + error, 'Form Configuration Error')
			})
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
			// safari's implementation of scroll-snap is breaks smooth scroll so temporarily
			//	disabled it, then reenable it
			const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
			const form = document.querySelector('.form-body');
			const snapType = form.style.scrollSnapType;
			if (isSafari) {
				form.style.scrollSnapType = 'none';
				setTimeout(() => {
					form.style.scrollSnapType = snapType; // or reset to original value
				}, 500);
			}
			document.getElementById(
					nextElementID.replace('#', '')
				).scrollIntoView({
					behavior: 'smooth',
					block: 'nearest',
					inline: 'start'
				});
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


	Constructor.prototype.isAdminSectionUserCanIgnore = function(el) {
		const rolesThatCanIgnore = ["1"]
		return $(el)[0].classList.contains("admin-section") && rolesThatCanIgnore.includes(_this.userRole)
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
						if (this.isAdminSectionUserCanIgnore(el)) return false;
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
						.filter((_, el) => {
							if (this.isAdminSectionUserCanIgnore(el)) return false; 
							else return true;
						})
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
				.filter((_, el) => {
					if (_this.isAdminSectionUserCanIgnore(el)) return false; 
					else return true;
				})
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
	Helper method to set the datetime_entered field
	*/
	Constructor.prototype.setDatetimeEntered = function() {

		const $datetimeEnteredField = $('#input-datetime_entered');
		const now = new Date();
		
		//	calculate as a numeric timestamp with the appropiate timezone offset
		//		* 60000 because .getTimezoneOffset() returns offset in minutes
		//		but the numeric timestamp needs to be in miliseconds 
		// Also round to the nearest minute
		const nowLocalTimestamp = Math.round((now.getTime() - (now.getTimezoneOffset() * 60000)) / 60000) * 60000;
		$datetimeEnteredField[0].valueAsNumber = nowLocalTimestamp;
		$datetimeEnteredField.change();
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
			if (!_this.fieldValues[tableName]) _this.fieldValues[tableName] = [];
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
			if (!_this.fieldValues[tableName]) _this.fieldValues[tableName] = [];
			const tableRows = _this.fieldValues[tableName];
			
			// Get the index of this card within the accordion
			const index = ($input.attr('id').match(/\d+$/) || [])[0];
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
		const validationDisabled = $('#disable-required-slider-container input[type=checkbox]').is(':checked');

		const $fields = $parent
			.find('.field-container:not(.disabled)')
			.find('.input-field:required, .required-indicator + .input-field').not('.hidden').each(
			(_, el) => {
				const $el = $(el);
				const $hiddenParent = $el.parents('.collapse:not(.show, .row-details-card-collapse), .card.cloneable, .field-container.disabled, .hidden');
				// Only check for empty fields if validation is enabled (it can be disabled by admins)
				if (!validationDisabled) {
					if (!($el.hasClass(MULTIPLE_SELECT_ENTRY_CLASS) ? $el.val().length : $el.val()) && $hiddenParent.length === 0) {
						$el.addClass('error');
					} else {
						$el.removeClass('error');
					}
				}
				// Always check if a value exceeds the max length, regardless of whether validation is disabled
				const maxLength = $el.data('max-length');
				let valueLength = 0;
				try {
					valueLength = el.value.length;
				} catch {
					console.log('Could not get value length for field ' + el.id);
				}
				if (valueLength > maxLength) {
					$el.addClass('error');
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
			showModal(`Are you sure you want to delete this ${itemName}?`, `Delete ${itemName}?`, {modalType: 'confirm', footerButtons: footerButtons});
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

		const $el = $(e.target);
		const maxLength = $el.data('max-length');
		const valueLength = ($el.val() || '').length;
		if (maxLength && valueLength && valueLength > maxLength) {
			// Show a message if the user pressed any key other than delete or backspace
			const keyCode = e.keyCode || e.charCode;
			if (!(keyCode == 8 || keyCode == 46)) { 
				const message = 
				`You've entered a value that exceeds the maximum number of characters for this field (${maxLength}).` + 
				' If you need to add more detail to your response, you can specify that in the narrative description' + 
				' of the encounter.';
				showModal(message, 'Value Exceeds Maximum Field Length');
			}
			$el.addClass('error');
		} else {
			$el.removeClass('error');
		}

		// show character counter and update (if it exists)
		$el.closest('.field-container')
			.find('.character-count-container')
				.removeClass('hidden')
				.find('.character-count')
					.text(valueLength);
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


	/*
	Helper function to toggle mileposts for different zoom levels
	*/
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


		var layerControl,
			baseMaps; //.addTo(map); 
		if (window.navigator.onLine) {
			// if connected to the network, use tile services for basemap
			baseMaps = {
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
		} else {
			// If not connected to the netowrk, load mbtiles from cache
			baseMaps = {'USGS Topos': L.tileLayer.mbTiles('resources/topo.mbtiles').addTo(map)};
		}
		layerControl = L.control.layers(baseMaps).addTo(map);

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

		const unitsDeferred = $.get({url: 'resources/management_units.json'})
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
		const roadsDeferred = $.get({url: 'resources/roads.json'})
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
				if (!_this.roadsGeoJSON) _this.roadsGeoJSON = {...geojson};

			}).fail((xhr, error, status) => {
				console.log('Road geojson read failed: ' + error);
			});
		const milepostsDeferred = $.get({url: 'resources/mileposts.json'})
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

		return $.when(unitsDeferred, roadsDeferred, milepostsDeferred);
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
		$('.coordinates-ddd').addClass('dirty');
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
		showModal(message, `Move the encounter location?`, {modalType: 'confirm', footerButtons: footerButtons});
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

		if (latDegrees && latMinutes && lonDegrees && lonMinutes && latDecimalSeconds && lonDecimalSeconds) {
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
	The Geolocation API method .getCurrentPosition() takes a success and an error function
	as it's arguments. 
	*** This method is completely untested because location services are blocked 
		for browsers on DOI laptop/desktop devices. Need to test on mobile device
	*/
	Constructor.prototype.onGeolocationPositionSuccess = function(position) {
		const coordinates = position.coords;
		$('#input-lat_dec_deg').val(coordinates.latitude);
		$('#input-lon_dec_deg').val(coordinates.longitude).change();
		$('#input-datum').val(1).change(); //WGS84
		$('#input-location_accuracy').val(1).change(); //<=10m
	}

	Constructor.prototype.onGeolocationPositionError = function(error) {
		print(error)
	}

	/*
	Convenience method for testing
	*/
	Constructor.prototype.getCurrentLocation = function() {
		navigator.geolocation.getCurrentPosition(
			this.onGeolocationPositionSuccess,
			this.onGeolocationPositionError
		)
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
		const roadID = $('#input-road_name').val() || _this.fieldValues.road_name_code;
		const roadsGeoJSON = _this.roadsGeoJSON;
		let milepostFeatures = _this.maps.main.mileposts;

		// If the layers haven't been added to the map, do nothing
		if (!(roadID && milepostFeatures && roadsGeoJSON)) return;

		let roadFeature = _this.roadsGeoJSON.features.filter(f => f.properties.road_id == roadID);
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
		const reactionOptions = this.reactionCodes[actionBy] || [];
		
		// If the actionBy value doesn't exist in the ractionCodes, exit
		if (reactionOptions.length === 0) {
			return $.Deferred().resolve();
		}

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
		return fillSelectOptions(reactionSelectID, reactionOptions);
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
		const $fileInputLabel = $fileTypeSelect.closest('.card-body').find('.file-input-label');
		const fileInputID = $fileInput.attr('id');

		if ($fileTypeSelect.val()) {
			$fileInput.removeAttr('disabled')
			$fileInputLabel.removeAttr('disabled')
		}
		else {
			$fileInput.attr('disabled', true)
			$fileInputLabel.attr('disabled', true)
		}

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
			showModal(`You already selected a file. Do you want to upload a new <strong>${fileType}</strong> file instead?`, `Upload a new file?`, {modalType: 'confirm', footerButtons: footerButtons});
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
				if (fileType == 2 && blob.size > _this.maxFileUploadSize) {
					$barContainer.addClass('hidden');
					const card = $barContainer.closest(".card")
					$(card).find(".filename-label").html('')
					showModal(`File too big to upload. Please replace with a file less than ${_this.maxFileUploadSize/1073741824}gb`, "File too large");
					return;
				} 
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
		
		_this.setDatetimeEntered();

		// Remove text from the .recorded-text-container. The narrative field 
		//	is actually a textarea, which records the value of the text entered 
		//	(or dictated) and a regular div, which is what the user sees.
		$('.recorded-text-container > *').text('')

		// Set all selects to their first option, which should be the default
		for (const el of $('select')) {
			const $select = $(el);
			
			// skip selects from cloneable parents
			if ($select.closest('.cloneable').length) continue;

			// set the value of the select to the first option
			const $options = $select.find('option');
			if ($options.length) {
				$select.val(
					($options[0] || {}).value
				).change();
			}
		}

		// reset default values
		_this.setDefaultInputValues();

		if (_this.markerIsOnMap()) {
			_this.encounterMarker.remove();
			$('#encounter-marker-container').slideDown(0);
		}

		// If the user has any errors, remove them
		$('.input-field.error').removeClass('error');

		// Clear localStorage
		_this.fieldValues = {};
		window.localStorage.clear();

		const pageIndex = parseInt($('.form-page.selected').data('page-index'));
		if (pageIndex !== 0) _this.goToPage(-pageIndex);
		
		// Reset submission page
		const $confirmationContainer = $('.submition-confirmation-container')
			.addClass('hidden').attr('aria-hidden', true);
		const $postSubmitMessage = $('#post-submit-message');
		$postSubmitMessage.find('.post-submit-append-message')
			.addClass('hidden').attr('aria-hidden', true);
		$postSubmitMessage.find('.encounter-id-text')
			.text('');
		// hide the link to the new submission
		$('.success-query-link')
			.attr('href', '#')
			.addClass('hidden').attr('aria-hidden', true);
		$confirmationContainer.siblings()
			.removeClass('hidden')
			.attr('aria-hidden', false);

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
		showModal(message, 'Reset Form?', {modalType: 'confirm', footerButtons: footerButtons});
	}


	/*
	Helper function to convert unordered parameters 
	into pre-prepared SQL statement and params
	*/
	Constructor.prototype.valuesToSQL = function(values, tableName, {timestamp=getFormattedTimestamp(), encounterID=null}={}) {

		
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
			if (encounterID == null) {
				currvalClause = `, currval(pg_get_serial_sequence('encounters', 'id'))`;
			} else {
				parametized += ', $' + (sortedFields.length + 1);
				parameters.push(encounterID);
			}
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


	/*
	Helper method to get INSERT sql for a multiple choice select
	*/ 
	Constructor.prototype.getMultipleSelectSQL = function(inputElement, encounterID=null) {
		const $select = $(inputElement);
		const values = $select.val();

		const fieldName = inputElement.name;
		const fieldInfo = _this.fieldInfo[fieldName];
		const tableName = fieldInfo.table_name;
		
		let sqlStatements = [],
			sqlParameters = [];
		for (const i in values) {
			const [statement, params] = _this.valuesToSQL(
				Object.fromEntries([[fieldName, values[i]], ['display_order', parseInt(i) + 1]]),
				tableName,
				{encounterID: encounterID}
			);
			sqlStatements.push(statement);
			sqlParameters.push(params);
		}

		return [sqlStatements, sqlParameters];
	}


	Constructor.prototype.onSubmitButtonClick = function(e) {

		e.preventDefault();

		showLoadingIndicator('onSubmitButtonClick');

		// Validate all fields. This shouldn't be necessary since the user can't move 
		//	to a new section with invalid fields, but better safe than sorry
		for (const page of $('.form-page:not(.title-page)')) {
			const $page = $(page);
			const allFieldsValid = $page.find('.validate-field-parent')
				.filter((_, el) => {
					if (_this.isAdminSectionUserCanIgnore(el)) return false; 
					else return true;
				})
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
				showModal(modalMessage, 'Missing or invalid information', {modalType: 'alert', footerButtons: buttonHTML});
				return;
			}
		}	

		// Record that the user clicked the submission button to log 
		//	any potential silent faliures
		$.post({
			url: 'flask/save_submission_time',
			data: {
				username: _this.username
			}
		}).done(response => {
			if (!(response === true)) {
				console.log(response)
			}
		}).fail(() => {
			console.log('save_submission_time failed')
		});

		// Save attachments
		const $attachmentInputs = $('.card:not(.cloneable) .attachment-input');
		var deferreds = [],
			uploadedFiles = {},
			failedFiles = [],
			parkFormID = $('#input-park_form_id').val(); // in case user entered something manually
		const timestamp = getFormattedTimestamp();
		
		// Only create a new park_form_id if the user didn't enter one
		if (!parkFormID) {
			const encounterDate = $('#input-start_date').val();
			const year = (encounterDate ? 
				new Date(encounterDate) : 
				new Date() // default to current year
			).getFullYear();
			deferreds.push(
				$.get({url: `flask/next_form_id/${year}`})
					.done(response => {
						const pythonError = pythonReturnedError(response);
						if (pythonError) {
							print('Failed to create park_form_id with error: ' + pythonError)
						} else {
							parkFormID = response.trim();
							$('#input-park_form_id').val(parkFormID).change();
						}
					}).fail((xhr, status, error) => {
						print('Failed to create park_form_id with error: ' + error)
					})
			)
		}
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
										client_filename: fileName,
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

		const showFailedFilesMessage = failedFiles => {
			const message = `
				The following files could not be saved to the server:<br>
				<ul>
					<li>${failedFiles.join('</li><li>')}</li>
				</ul>
				<br>Your encounter was not saved as a result. Check your internet and network connection, and try to submit the encounter again.`;
			hideLoadingIndicator();
			showModal(message, 'File uploads failed');
		}

		// When all of the uploads have finished (or failed), check if any failed. 
		//	If they all succeeded, then insert data
		$.when(
			...deferreds
		).done(function() {
			if (failedFiles.length) {
				showFailedFilesMessage(failedFiles);
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
				const inputsWithData = $('.input-field:not(.ignore-on-insert, .bhims-select2)')
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
					var value = _this.fieldValues[fieldName] || '';
					if (!(fieldName in _this.fieldValues) || typeof(_this.fieldValues[tableName]) === 'object') continue;

					if (!(tableName in unorderedParameters)) {
						unorderedParameters[tableName] = {}
					}
					

					// Convert short distance fields units if necessary
					const $input = $(input);
					if ($input.is('.short-distance-field')) {
						const $unitsSelect = $(`.short-distance-select[data-calculation-target="#${input.id}"]`);
						value = Math.round(value / UNIT_PER_METER_MAP.get($unitsSelect.val()));
					}

					unorderedParameters[tableName][fieldName] = value;
				}


				// Make sure that encounters is the first insert since everything references it
				const [encountersSQL, encountersParams] = _this.valuesToSQL(unorderedParameters.encounters, 'encounters', {timestamp: timestamp});
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

				// Handle multiple choice selects
				for (const input of $(`.${MULTIPLE_SELECT_ENTRY_CLASS}`)) {
					const [statements, params] = _this.getMultipleSelectSQL(input);
					sqlStatements = [...sqlStatements, ...statements];
					sqlParameters = [...sqlParameters, ...params];
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
						showModal(`An unexpected error occurred while saving data to the database: ${queryResultString.trim()}.<br><br>Try reloading the page. The data you entered will be automatically reloaded (except for attachments).`, 'Unexpected error')
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

					// Send email notification only if this
					const result = $.parseJSON(queryResultString)[0];
					const queryURL = window.encodeURI(`query.html?{"encounters": {"id": {"value": ${result.id}, "operator": "="}}}`)
					const userRole = parseInt(_this.userRole);
					if (_this.userRolesForNotification.includes(userRole)) {
						$.post({
							url: 'flask/notifications/submission', 
							data: {query_url: queryURL}
						}).done(response => {
							if (response !== 'true') {
								console.log('Email notification failed to send. Reponse: ' + response)
							}
						})
						.fail((xhr, status, error) => {console.log('Email notification failed with')})
					}
					// If this is an rating or admin user, show them a link to the data via the query page
					if (_this.dataAccessUserRoles.includes(userRole)) {
						// Show encounter ID
						if (parkFormID) {
							const $postSubmitMessage = $('#post-submit-message');
							$postSubmitMessage.find('.post-submit-append-message')
								.removeClass('hidden');
							$postSubmitMessage.find('.encounter-id-text')
								.text(parkFormID);
						}
						// show link
						$('.success-query-link')
							.attr('href', queryURL)
							.removeClass('hidden').attr('aria-hidden', false);
					}

				}).fail((xhr, status, error) => {
					showModal(`An unexpected error occurred while saving data to the database: ${error}.\n\nTry reloading the page. The data you entered will be automatically reloaded (except for attachments).`, 'Unexpected error')
				}).always(() => {
					hideLoadingIndicator();
				})
			}
		}).fail((failedXHR, status, error) => {
			if (failedFiles.length) {
				showFailedFilesMessage(failedFiles);
			} else {
				console.log(failedXHR.responseJSON || failedXHR.responseText);
				showModal(
					'An unexpected error occurred while saving data to the database. Make sure you' +
					' are connected to the NPS network and try again. If the problem persists,' + 
					' contact the database administrator.', 
					'Database Error'
				);
				hideLoadingIndicator();
			}
			return; 
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
