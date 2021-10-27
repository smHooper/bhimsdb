

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
				queryResult.forEach(function(object) {
					$('#' + selectElementID).append(
						`<option class="${optionClassName}" value="${object.value}">${object.name}</option>`
					);
				})
			} else {
				console.log(`error filling in ${selectElementID}: ${queryResultString}`);
			}
		},
		failFilter=function(xhr, status, error) {
			console.log(`fill select failed with status ${status} because ${error} from query:\n${sql}`)
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

	/*const $modal = $(`
		<div class="modal fade" id="${modalID}" tabindex="-1" role="dialog" aria-labelledby="${modalID}-label" aria-hidden="true">
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
		</div>
		`)
		.appendTo('body')
		.modal(); //bootstrap modal plugin method to show modal*/
	
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
Copy specified text to the clipboard
*/
function copyToClipboard(text, modalMessage='') {
	const clipboard = navigator.clipboard;
	if (!clipboard) {
		showModal(`Your browser refused access to the clipboard. This feature only works with a HTTPS connection. Right-click and copy from <a href="${text}">this link</a> instead.`, 'Clipboard access denied');
		return;
	}
	clipboard
		.writeText(text)
		.then(() => {
			showModal(modalMessage || `Successfully copied ${text} to clipboard`, 'Copy successful');
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