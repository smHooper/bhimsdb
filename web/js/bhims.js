const PWA_DISPLAY_MODES = ['fullscreen', 'standalone', 'minimal-ui'];
const LEAFLET_MARKER_ICON_URL = {
	icon: 'imgs/leaflet-marker-icon.png',
	shadow: 'imgs/leaflet-marker-shadow.png'
};

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


function queryDB(sql, {schema='public'}={}) {

	return $.ajax({
		url: 'bhims.php',
		method: 'POST',
		data: {action: 'query', queryString: sql, db: 'bhims'},
		cache: false
	});
}

function print(args) {
	console.log(args)
}


function millisecondsToTimeInterval(milliseconds) {
	/*
	Convert miliseconds to a human-readable time interval like 1 hour 30 minutes
	*/
	
	const seconds = Math.floor(milliseconds / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	const remainingSeconds = seconds % 60;
	const remainingMinutes = minutes % 60;

	let result = '';

	if (hours > 0) {
		result += `${hours} hour${hours > 1 ? 's' : ''} `;
	}

	if (remainingMinutes > 0 || hours > 0) { 
		result += `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''} `;
	}

	// only return seconds if there's less than an hour
	if (remainingSeconds > 0 && hours === 0) {
		result += `${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`;
	}

	return result.trim();
}


function fillSelectOptions(selectElementID, options, optionClassName='') {
	
	const $select = $('#' + selectElementID)
	$select.find('option:not([value=""])').remove();
	
	for (const object of options) {
		$select.append(
			`<option class="${optionClassName}" value="${object.code}">${object.name}</option>`
		);
	}
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
	if (!(indicator.data('callers') || []).length) {
		$('#loading-indicator-background').addClass('hidden');
		indicator.addClass('hidden');
	}

}

function removeSpecialCharacters(htmlStr) {

	return htmlStr
		.replace(/[^\w]/g, '-') // replace non-alphanumeric chars with '-'
		.replace(/^-|-+$/g, ''); // remove any hyphens from beginning or end
}

function showModal(message, title, {modalType='alert', footerButtons='', dismissable=true, eventHandlerCallable=()=>{}}={}) {

	var modalID = removeSpecialCharacters(title)


	if (!footerButtons) {
		switch(modalType) { 
			case 'alert': 
				footerButtons = '<button class="generic-button modal-button close-modal" data-dismiss="modal">Close</button>';
				break;
			case 'confirm':
				footerButtons = `
					<button class="generic-button secondary-button modal-button close-modal" data-dismiss="modal">Close</button>'
					<button class="generic-button modal-button close-modal confirm-button" data-dismiss="modal">OK</button>
				`;
				break;
			case 'yes-no': 
				footerButtons = `
					<button class="generic-button secondary-button modal-button close-modal" data-dismiss="modal">No</button>
					<button class="generic-button modal-button close-modal confirm-button" data-dismiss="modal">Yes</button>
				`
				break;
		}
	}

	const upperRightCloseButton = dismissable ? 
		`<button type="button" class="close close-modal" data-dismiss="modal" aria-label="Close">
	          <span aria-hidden="true">&times;</span>
	        </button>` :
	    '';
	const innerHTML = `
	  <div class="modal-dialog" role="document">
	    <div class="modal-content">
	      <div class="modal-header">
	        <h5 class="modal-title">${title}</h5>
			${upperRightCloseButton}
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
	});

	// Remove class that indicates the modal is being shown
	$modal.on('hide.bs.modal', () => {
		$modal.removeClass('showing')
	});

	eventHandlerCallable.call();

	return $modal;
}


function getUserInfo({pwaRequestID=null, fillUsername=true}={}) {
	const pwaRequestIDString = pwaRequestID ? '/' + pwaRequestID : ''
	return $.get({
		url: '/flask/user_info' + pwaRequestIDString,
	}).done(function(result) {
		if (pythonReturnedError(result)) {
			const message = 'An error occurred while retrieving user information. Try reloading the page. If this problem persists, contact your system administrator.'
			const footerButton = '<a class="generic-button" href="bhims-index.html">OK</a>';
			hideLoadingIndicator();
			showModal(message, 'Error Retrieving User Info', 'alert', footerButton, {dismissable: false});
			console.log(result);

		} else {
			if (fillUsername) $('#username').text(result.ad_username);
		}	
	});
}


function showPermissionDeniedAlert() {
	$('.main-content-wrapper').remove();
	const message = 'You do not have sufficient permissions to view data. Contact the BHIIMS program administrator if you need access.';
	const footerButton = '<a class="generic-button" href="index.html">OK</a>'
	showModal(message, 'Permission Denied', 'alert', footerButton, {dismissable: false});
}

/*
Helper function to check a Postgres query result for an error
*/
function queryReturnedError(queryResultString) {
	return queryResultString.match(/^[\s["]*ERROR/) || queryResultString.trim() === '["query returned an empty result"]';
}


/*
Helper function to check a flask request threw an error
*/
function pythonReturnedError(resultString) {
	resultString = String(resultString); // force as string in case it's something else
	return resultString.startsWith('ERROR: Internal Server Error') ?
		resultString.match(/[A-Z]+[a-zA-Z]*Error: .*/)[0].trim() :
		false;
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
	const mainWithSidebar = $('.main-container-with-header');
	const mainWithSidebarExists = mainWithSidebar.length;
	$(`
		${mainWithSidebarExists ? '' : '<div class="main-container-with-header">'} 
			<!-- nav sidebar -->
			<nav class="sidebar" role="navigation">
				<div class="sidebar-sticky">
					<div class="sidebar-background"></div>
					<ul class="sidebar-nav-group">

						<li class="nav-item selected">
							<a href="dashboard.html">
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
							<a href="entry-form.html">
								<img class="sidebar-nav-item-icon" src="imgs/entry_form_icon_50px.svg">
								<span class="sidebar-nav-item-label">new encounter</span>
							</a>
						</li>

					</ul>

				</div>
			</nav>
		${mainWithSidebarExists ? '' : '</div>'} 
	`).prependTo(mainWithSidebarExists ? '.main-container-with-header' : 'main');
	
	$('.sidebar-nav-group > .nav-item.selected').removeClass('selected');
	$('.sidebar-nav-group .nav-item > a')
		.filter((_, el) => el.href.endsWith(window.location.pathname.split('/').pop()))
		.parent()
			.addClass('selected');
}


function addPageHeaderBar({pageTitle=''}={}) {
	if (!pageTitle) {
		const pathName = window.location.pathname.toLowerCase();
		pageTitle = 
			pathName.match('entry') ? 'entry form' :
			pathName.match('query') ? 'query' :
			pathName.match('dashboard') ? 'dashboard' : 
			pathName.replace(/-/g, ' ');
	}
	const $header = $(`
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
				<h4 class="page-title">BHIMS ${pageTitle}</h4>
			</div>
			<div id="offline-encounter-list-button-container" class="header-menu-item-group ${true || isPWA() ? '' : 'hidden'}">
				<button id="show-offline-encounter-list-button" class="icon-button">
					<i class="fas fa-2x fa-list"></i>
				</button>
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

	return $header;
} 


/*
Helper function to ask server if the app is running in the production or development environment 
*/
function getEnvironment() {

	return $.get({
		url: '/flask/environment'
	});
}


/*
Check if the app is running as a PWA
*/
function isPWA() {
	return true || PWA_DISPLAY_MODES.some(
		(displayMode) => window.matchMedia(`(display-mode: ${displayMode})`).matches
	);
}

/*
Test if the user is using a mobile device
*/
function isMobile() {
	const a = navigator.userAgent||navigator.vendor||window.opera; 
	return /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4));
}


/*
Load configuration values from the database
*/
function loadConfigValues(config) {

	return $.get({url: '/flask/db_config'})
		.done(response => {
			if (pythonReturnedError(response)) {
				print('Problem querying config values: ' + response);
			} else {
				for (const property in response) {
					config[property] = response[property];
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
							s.slice(0, match.index).toLowerCase(), 
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


function registerServiceWorker() {
	/*
	Try to register the ServiceWorker. If the user's browser doesn't 
	support he API and they've installed the PWA, warn them 
	*/
	// register service worker
	if ('serviceWorker' in navigator) {
		return navigator.serviceWorker.register('/service-worker.js');
	} else if (isPWA()) {
		const message = 'You\'ve installed the BHIMS app but your system does' + 
			' not support the ServiceWorker API, which is necessary for the' + 
			' app to run properly. Contact your database administrator to help' +
			' you install the app properly on your mobile device';
		showModal(message, 'System Not Supported')
		return false;
	} else {
		return false;
	}
}