var MULTIPLE_SELECT_ENTRY_CLASS = 'bhims-select2';

function deepCopy(inObject) {
	/*
	Return a true deep copy of an object
	*/
	
	let outObject, value, key;

	if (typeof inObject !== "object" || inObject === null) {
		return inObject; // Return the value if inObject is not an object
	}

	// Create an array or object to hold the values
	outObject = Array.isArray(inObject) ? [] : {};

	for (key in inObject) {
		value = inObject[key];

		// Recursively (deep) copy for nested objects, including arrays
		outObject[key] = deepCopy(value);
	}

	return outObject;
}

function print(i) {
	console.log(i);
}


/*
Run a SELECT query by either sending WHERE (and possibly ORDER BY) parameters to use the 
SQLAlchemy ORM or raw SQL and parameters to execute parameterized SQL
*/
function queryDB({tables=[], selects={}, joins=[], where={}, orderBy=[], sql='', sqlParameters={}, returnTimestamp=false}={}) {
	
	var requestData = Object.keys({...selects, ...where}).length || tables.length ? 
		{	
			tables: tables,
			select: selects,
			joins: joins,
			where: where,
			order_by: orderBy
		} : 
		{sql: sql, params: sqlParameters};

	if (returnTimestamp) requestData.queryTime = (new Date()).getTime();
	
	return $.post({
		url: '/flask/db/select',
		data: JSON.stringify(requestData),
		contentType: 'application/json'
	});
}	


function fillSelectOptions(selectElementID, sqlArgs, optionClassName='') {
	
	return queryDB(sqlArgs).then(
		doneFilter=response => {
			if (pythonReturnedError(response)) {
				print(`fillSelectOptions() failed for ${selectElementID} with error: ` + response);
			} else {
				const queryResult = response.data || [];
				const $el = $('#' + selectElementID);
				for (const row of queryResult) {
					$el.append(
						`<option class="${optionClassName}" value="${row.value || row.code}">${row.name}</option>`
					);
				}
				const defaultValue = $el.data('default-value');
				if (defaultValue !== undefined) $el.val(defaultValue);
			} 
		},
		failFilter=(_, status, error) => {
			console.log(`fill select failed with status ${status} because ${error} from query:\n${queryString}`)
		}
	);
}


function fillAllSelectOptions(noFillClass='no-option-fill') {

	return $(`select:not(.${noFillClass})`).map( (_, el) => {
		const $el = $(el);
		const placeholder = $el.attr('placeholder');
		const lookupTable = $el.data('lookup-table');
		const lookupTableName = lookupTable ? lookupTable : $el.attr('name') + 's';
		const id = el.id;
		if (lookupTableName != 'undefineds') {//if neither data-lookup-table or name is defined, lookupTableName === 'undefineds' 
			if (placeholder) $('#' + id).append(`<option class="" value="">${placeholder}</option>`);
			
			let sqlArgs = {orderBy: [{table_name: lookupTableName, column_name: 'sort_order'}]};
			if ($el.is('.include-disabled-options')) { 
				sqlArgs.tables = [lookupTableName];
			} else {
				sqlArgs.where = {[lookupTableName]: [{
					column_name: 'sort_order', 
					operator: 'IS NOT', 
					comparand: 'NULL'}
				]};
			}

			return this.fillSelectOptions(id, sqlArgs);
			
		}
	});
}


function parseURLQueryString(queryString=window.location.search) {
	if (queryString.length) {
		return Object.fromEntries(
			decodeURIComponent(queryString.slice(1))
				.split('&')
				.map(s => {
					const match = s.match(/=/)
					if (!match) {
						// Even if there's no value, .fromEntries() needs [key, value]
						//	so just set the value equal to true
						return [s, true];
					} else {
						// Need to return [key, value]
						return [
							s.slice(0, match.index), 
							s.slice(match.index + 1, s.length) //+1 to skip the = separator
						];
					}
				}
			)
		);
	} else {
		// no search string so return an empty object
		return {};
	}
}


function validateFields($parent, {focusOnFieldWithError=true, validationDisabled=false}={}) {
	
	const $fields = $parent
		.find('.field-container:not(.disabled)')
		.find('.input-field:required, .required-indicator + .input-field')
		.not('.hidden')
		.each((_, el) => {
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
		if (focusOnFieldWithError) $fields.first().focus();
		return false;
	} else {
		return true;
	}

}

function toggleDependentFields($select) {
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
				toggleDependentFields($thisField, hide=false)
			} else {
				$thisContainer.collapse('hide');
				//$thisContainer.addClass('hidden');
				toggleDependentFields($thisField, hide=true)
			}
		}
	});
}


function onSelectChange($select) {
	// Set style depending on whether the default option is selected
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
	toggleDependentFields($select);
}


/*
Return an array of objects sorted by a given field
*/
function sortDataArray(data, sortField, {ascending=true}={}) {
	return data.sort( (a, b) => {
		// If the values are integers, make them numeric before comparing because string 
		//	numbers have a different result than actual numbers when comparing values
		const comparandA = a[sortField].toString().match(/^\d+$/, a[sortField]) ? parseInt(a[sortField]) : a[sortField];
		const comparandB = b[sortField].toString().match(/^\d+$/, b[sortField]) ? parseInt(b[sortField]) : b[sortField];
		return ((comparandA > comparandB) - (comparandB > comparandA)) * (ascending ? 1 : -1);
	})
}

function showLoadingIndicator(caller, timeout=15000) {

	//set a timer to turn off the indicator after a max of 15 seconds because 
	//  sometimes hideLoadingIndicator doesn't get called or there's some mixup 
	//  with who called it
	/*if (timeout) {
		setTimeout(hideLoadingIndicator, timeout);
	}*/
	
	// For anonymous functions, the caller is undefined, so (hopefully) the 
	//	function is called with the argument given
	var thisCaller = caller == undefined ? showLoadingIndicator.caller.name : caller;

	var indicator = $('#loading-indicator').removeClass('hidden')
	$('#loading-indicator-background').removeClass('hidden');

	// check the .data() to see if any other functions called this
	indicator.data('callers', indicator.data('callers') === undefined ? 
		[thisCaller] : indicator.data('callers').concat([thisCaller])
	)

}


function hideLoadingIndicator(caller) {
	

	var indicator = $('#loading-indicator')
	// if no caller was given, just remove the indicator
	if (caller === undefined || indicator.data('callers') == undefined) {
		 indicator.data('callers', [])
	} else if (indicator.data('callers').includes(caller)) {
		indicator.data(
			'callers', 
			indicator.data('callers').filter(thisCaller => thisCaller != caller)
		);
	}

	// Hide the indicator if there are no more callers
	if (!indicator.data('callers').length) {
		$('#loading-indicator-background').addClass('hidden');
		indicator.addClass('hidden');
	}

}


function showModal(message, title, modalType='alert', footerButtons='', {dismissable=true}={}) {

	var modalID = title
		.replace(/[^\w]/g, '-') // replace non-alphanumeric chars with '-'
		.replace(/^-|-+$/g, '') // remove any hyphens from beginning or end

	if (!footerButtons) {
		switch(modalType) { 
			case 'alert': 
				footerButtons = '<button class="generic-button modal-button close-modal" data-dismiss="modal">Close</button>';
				break;
			case 'confirm':
				footerButtons = `
					<button class="generic-button secondary-button modal-button close-modal" data-dismiss="modal">Close</button>';
					<button class="generic-button modal-button close-modal" data-dismiss="modal">OK</button>
				`;
				break;
		}
	}

	const innerHTML = `
	  <div class="modal-dialog" role="document">
	    <div class="modal-content">
	      <div class="modal-header">
	        <h5 class="modal-title">${title}</h5>
	        <button type="button" class="close close-modal" data-dismiss="modal" aria-label="Close">
	          <span aria-hidden="true">&times;</span>
	        </button>
	      </div>
	      <div class="modal-body">
	        <p>${message}</p>
	      </div>
	      <div class="modal-footer">
	      	${footerButtons}
	      </div>
	    </div>
	  </div>
	`;
	const options = dismissable ? {} : {backdrop: 'static', keyboard: false};
	const $modal = $('#alert-modal').empty()
		.append($(innerHTML))
		.modal(options);
	
	$modal.find('.close-modal').click(function() {
		$modal.modal('hide');
	})
}


function getConfig() {
	return $.get({
		url: '/flask/config',
	}).done(result => {
		if (!pythonReturnedError(
				result, 
				{errorExplanation: 'An error occurred while loading configuration values from the database.'}
			)) {
			CONFIG = {...result};
			CONFIG['db_contact_message']
				.replace(
					'{db_admin_email}',
					CONFIG['db_admin_email']
				);
		}
	})
}
CONFIG = {};
getConfig();


function getUserInfo() {
	return $.get({
		url: '/flask/user_info',
	}).done(function(result) {
		if (pythonReturnedError(result, {errorExplanation: 'An error occurred while loading user information.'})) {
			throw 'User role query failed: ' + result;
		} else {

		}
	});
}


function showPermissionDeniedAlert() {
	$('.main-content-wrapper').remove();
	const message = 'You do not have sufficient permissions to view data. Contact the BHIIMS program administrator if you need access.';
	const footerButton = '<a class="generic-button" href="bhims-index.html">OK</a>'
	showModal(message, 'Permission Denied', 'alert', footerButton, {dismissable: false});
}

/*
Helper function to check a Postgres query result for an error
*/
function queryReturnedError(queryResultString) {
	return queryResultString.match(/^[\s["]*ERROR/) || queryResultString.trim() === '["query returned an empty result"]';
}


/*
Copy text from a selection. 
*/
function copyFromSelection(elementID, deselect=true) {
	
	var range = document.createRange();
	range.selectNode(document.getElementById(elementID));
	
	// clear current selection
	window.getSelection().removeAllRanges(); 
	
	window.getSelection().addRange(range); // to select text
	
	document.execCommand("copy");
	
	// Deselect
	if (deselect) window.getSelection().removeAllRanges();
}


	/*
	Copy specified text to the clipboard
	*/
function copyToClipboard(text, {modalMessage='', triggeringElement=null, tooltipContainer='body'}={}) {
		const clipboard = navigator.clipboard;
		if (!clipboard) {
			this.showModal(`Your browser refused access to the clipboard. This feature only works with a HTTPS connection. Right-click and copy from <a href="${text}">this link</a> instead.`, 'Clipboard access denied');
			return;
		}
		const $trigger = $(triggeringElement);
		clipboard
			.writeText(text)
			.then(() => {
				if (modalMessage) {
					this.showModal(modalMessage || `Successfully copied ${text} to clipboard`, 'Copy successful');
				} 
				// check if 'tooltip' is in the triggering element's data-toggle 
				//	(if the attribute is defined)
				else if (($trigger.data('toggle') || '').match('tooltip')) {
					// Show it
					$trigger.tooltip({
						title: 'Copied!',
						container: tooltipContainer,
						trigger: 'focus'
					}).tooltip('show');
					// Then remove it after a set amount of time
					setTimeout(() => {$trigger.tooltip('dispose')}, 2000);

				}
			})
			.catch((err) => {
				console.error(`Error copying text to clipboard: ${err}`);
			});
	}


/* 
Helper functions to compute the width of a text string with a given font family, size, and weight
(from: https://stackoverflow.com/a/21015393)
*/
function getTextWidth(text, font) {
	// re-use canvas object for better performance
	const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
	const context = canvas.getContext("2d");
	context.font = font;
	const metrics = context.measureText(text);

	return metrics.width;
}

function getCanvasFont(el=document.body) {
	const $el = $(el);
	const fontWeight = $el.css('font-weight') 	|| 'normal';
	const fontSize = $el.css('font-size') 		|| '16px';
	const fontFamily = $el.css('font-family') 	|| 'Times New Roman';

	return `${fontWeight} ${fontSize} ${fontFamily}`;
}



function animateCountUp(el, nFrames, frameDuration, easeFunction=(t) => t, maxVal=null) {
	/*
	Animate counting of an element with numeric text
	*/
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

/*
Round a number, x, to a specifed precision (because Math.round() always returns an integer)
*/
function trueRound(x, precision=0) { 
	const exponent = Math.pow(10, precision);
	return Math.round( x * exponent) / exponent;
}


/*

*/
function addSidebarMenu() {
	$(`
		<!-- nav sidebar -->
		<div class="main-container-with-sidebar">
			<nav class="sidebar" role="navigation">
				<div class="sidebar-sticky">
					<div class="sidebar-background"></div>
					<ul class="sidebar-nav-group">

						<li class="nav-item">
							<a href="bhims-dashboard.html">
								<img class="sidebar-nav-item-icon" src="imgs/dashboard_icon_50px.svg">
								<span class="sidebar-nav-item-label">dashboard</span>
							</a>
						</li>

						<li class="nav-item">
							<a href="query.html">
								<img class="sidebar-nav-item-icon" src="imgs/query_icon_50px.svg">
								<span class="sidebar-nav-item-label">query data</span>
							</a>
						</li>

						<li class="nav-item">
							<a href="analysis.html">
								<img class="sidebar-nav-item-icon" src="imgs/analysis_icon_50px.svg">
								<span class="sidebar-nav-item-label">analyze data</span>
							</a>
						</li>

						<li class="nav-item">
							<a href="manage-users.html">
								<img class="sidebar-nav-item-icon" src="imgs/user_icon_50px.svg">
								<span class="sidebar-nav-item-label">manage users</span>
							</a>
						</li>

						<li class="nav-item">
							<a href="config.html">
								<img class="sidebar-nav-item-icon" src="imgs/settings_icon_50px.svg">
								<span class="sidebar-nav-item-label">configure app</span>
							</a>
						</li>

						<li class="nav-item">
							<a href="entry-form.html">
								<img class="sidebar-nav-item-icon" src="imgs/entry_form_icon_50px.svg">
								<span class="sidebar-nav-item-label">new encounter</span>
							</a>
						</li>

					</ul>

				</div>
			</nav>
		</div>
	`).prependTo('main');

	$(`
		<nav class="bhims-header-menu">
			<div class="header-menu-item-group">
				<button class="icon-button sidebar-collapse-button" title="Toggle sidebar menu">
					<div class="sidebar-collapse-button-line"></div>
					<div class="sidebar-collapse-button-line"></div>
					<div class="sidebar-collapse-button-line"></div>
				</button>
				<a class="home-button" role="button" href="bhims-index.html">
					<img src="imgs/bhims_icon_50px.svg" alt="home icon">
				</a>
				<h4 class="page-title">BHIMS dashboard</h4>
			</div>
			<div class="header-menu-item-group" id="username-container">
				<img id="username-icon" src="imgs/user_icon_50px.svg" alt="username icon">
				<label id="username"></label>
			</div>
		</nav>
	`).insertBefore('main');

	$('.sidebar-collapse-button').click((e) => {
		$('.sidebar-collapse-button, nav.sidebar').toggleClass('collapsed');
	});
	
	$('.sidebar-nav-group > .nav-item.selected').removeClass('selected');
	$('.sidebar-nav-group .nav-item > a')
		.filter((_, el) => el.href.endsWith(window.location.pathname.split('/').pop()))
		.parent()
			.addClass('selected');
}


/*
Helper function to ask server if the app is running in the production or development environment 
*/
function getEnvironment() {

	return $.get({
		url: '/flask/environment',
	});

}

/*
Load configuration values from the database
*/
function loadConfigValues(config) {

	return getConfig()
		.done(response => {
			if (!pythonReturnedError(response)) {
				for (const key in response) {
					config[key] = response[key];
				}
			}
		})
}


function parseURLQueryString(queryString=window.location.search) {
	if (queryString.length) {
		const parsed = decodeURIComponent(queryString.slice(1))
				.split('&')
				.map(s => {
					const match = s.match(/=/)
					if (!match) {
						return s
					} else {
						// Need to return [key, value]
						return [
							s.slice(0, match.index), 
							s.slice(match.index + 1, s.length) //+1 to skip the = separator
						]
					}
				}
			);
		params = {};
		try {
			params = Object.fromEntries(parsed)
		} catch {
		}
		return params;

	} else {
		// no search string so return an empty object
		return {};
	}
}

// function pythonReturnedError(resultString) {

// 	return resultString.toString().startsWith('ERROR: Internal Server Error') ?
// 	   resultString.match(/[A-Z]+[a-zA-Z]*Error: .*/)[0].trim() :
// 	   false;
// }
/*
Use the current-value data property to reset an input's value
*/
function resetRevertableField($input, {triggerChange=true}={}) {
	const previousValue = $input.data('current-value');
	if ($input.is('[type=checkbox]')) {
		$input.prop('checked', previousValue === 'true')
	} else if ($input.is('select')) {
		if (previousValue) {
			$input.val(previousValue)
		}
	} else {
		$input.val(previousValue)
	}
	if (triggerChange) $input.change();
}


function getDBContactMessage() {
	return (' ' + CONFIG.db_contact_message) || 
		' Make sure you\'re still connected to the NPS network and try again.' +
		` <a href="mailto:${CONFIG.db_admin_email}">Contact your database` +
		' adminstrator</a> if the problem persists.';
}

function onCopyErrorButtonClick(e) {
	const $button = $(e.target).closest('button');
	const error = $button
		.closest('.modal-body')
		.find('.modal-error-text-container')
		.text();
	copyToClipboard(error, {triggeringElement: $button, tooltipContainer: '#alert-modal'})
}


function pythonReturnedError(resultString, {errorExplanation=''}={}) {
	resultString = String(resultString); // force as string in case it's something else
	if (resultString.startsWith('ERROR: Internal Server Error')) {
		// almost all Python excetions have a class anme in the form *Error (e.g., ValueError).
		//	That's not a hard and fast rule, however, and so if the match is null, return something generic
		const pythonException = (resultString.match(/[A-Z]+[a-zA-Z]*Error: .*/) || ['unknown custom exception thrown']
		)[0].trim();
		
		const dbContact = getDBContactMessage();
		// Show the error modal 
		if (errorExplanation !== '') {
			const messageBody = `
				${errorExplanation}${dbContact} 
				<div class="w-100 d-flex justify-content-between">
					<button 
						role="button"
						class="text-only-button pl-0" 
						type="button" 
						data-toggle="collapse" data-target=".modal-error-details-target" aria-expanded="false" aria-controls="modal-error-details-collapse"
					>
						Error details
					</button>
					<button 
						role="button"
						class="text-only-button modal-error-details-target copy-error-text-button collapse"
						data-toggle="tooltip"
						data-placement="bottom"
					>
						Copy error text
					</button>
				</div>
				<p id="modal-error-details-collapse" class="collapse modal-error-details-target modal-error-text-container pt-3">
					${resultString}
				</p>`;
			showModal(messageBody, 'Unexpected Error');
		}

		return pythonException;
	} else {
		return false;
	}
}

(function( $ ) {
 	// helper method to hide/unhide an element (using the custom utility class, .hidden) AND set the ARIA-hidden attribute appropriately
	$.fn.ariaHide = function(isHiding=true) {
		return this.toggleClass('hidden', isHiding)
			.attr('aria-hidden', isHiding);
	}	
	// Toggle opacity: 0 with .transparent class rather than display: none as with the .hidden
	$.fn.ariaTransparent = function(isHiding=true) {
		return this.toggleClass('transparent', isHiding)
			.attr('aria-hidden', isHiding);
	}
 	
 	/* 
 	For late binding (i.e., delegated) events added with something like 
 	$(document).on('change', 'selector', (e)=>{...}),
 	add a function to trigger the event manually 
 	*/
 	$.fn.triggerDelegatedEvent = function(eventType, delegate=document) {
 		const e = $.Event(eventType);
 		e.target = this[0];
 		$(delegate).trigger(e);

 		return this;
 	}

 	/*
 	Helper function to remove a DOM element with a fade
 	*/
 	$.fn.fadeRemove = function({fadeTime=500, onRemove=()=>{}}={}) {
 		 return this.fadeOut(fadeTime, () => {
 		 	this.remove();
 		 	onRemove.call();
 		 });
 	}
}( jQuery ));