

function queryDB(sql) {

	return $.ajax({
		url: 'bhims.php',
		method: 'POST',
		data: {action: 'query', queryString: sql, db: 'bhims'},
		cache: false
	});
}


function fillSelectOptions(selectElementID, queryString, optionClassName='') {
	
	let deferred = queryDB(queryString)
	deferred.then(
		doneFilter=function(queryResultString){
			
			queryResultString = queryResultString.trim();

			var queryResult;
			try {
				queryResult = $.parseJSON(queryResultString);
			} catch {
				//console.log(`error filling in ${selectElementID}: ${queryResultString}`);
			}
			if (queryResult) {
				const $select = $('#' + selectElementID)
				$select.find('option:not([value=""])').remove();
				queryResult.forEach(function(object) {
					$select.append(
						`<option class="${optionClassName}" value="${object.value}">${object.name}</option>`
					);
				})
			} else {
				console.log(`error filling in ${selectElementID}: ${queryResultString}`);
			}
		},
		failFilter=function(xhr, status, error) {
			console.log(`fill select failed with status ${status} because ${error} on #${selectElementID}`)
		}
	);

	return deferred;
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


function showModal(message, title, modalType='alert', footerButtons='') {

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
	const $modal = $('#alert-modal').empty()
		.append($(innerHTML))
		.modal();
	
	$modal.find('.close-modal').click(function() {
		$modal.modal('hide');
	})
}

/*
Helper function to check a Postgres query result for an error
*/
function queryReturnedError(queryResultString) {
	return queryResultString.trim().startsWith('ERROR') || queryResultString.trim() === '["query returned an empty result"]';
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
function copyToClipboard(text, modalMessage='') {
	const clipboard = navigator.clipboard;
	if (!clipboard) {
		showModal(`Your browser refused access to the clipboard. This feature only works with a HTTPS connection. Right-click and copy from <a href="${text}">this link</a> instead.`, 'Clipboard access denied');
		// If the browser refuses access to the clipboard (because this is an insecure connection), 
		//	copy the text the janky way by adding a textarea element to the dom and copying it's text
		// const temporaryID = `temporary-text-${new Date().valueOf()}`;
		// $(`<textarea id="${temporaryID}" style="display:none">${text}</textarea>`).appendTo('body');
		// copyFromSelection(temporaryID);
		// $('#' + temporaryID).remove();
		// showModal(modalMessage || `Successfully copied ${text} to clipboard`, 'Copy successful');
	} else {
		clipboard
			.writeText(text)
			.then(() => {
				showModal(modalMessage || `Successfully copied ${text} to clipboard`, 'Copy successful');
			})
			.catch((err) => {
				console.error(`Error copying text to clipboard: ${err}`);
			});
	}
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

						<li class="nav-item selected">
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
							<a href="bhims-entry.html">
								<img class="sidebar-nav-item-icon" src="imgs/entry_form_icon_50px.svg">
								<span class="sidebar-nav-item-label">new encounter</span>
							</a>
						</li>

					</ul>

				</div>
			</nav>
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

	return $.post({
		url: 'bhims.php',
		data: {action: 'getEnvironment'}
	});

}