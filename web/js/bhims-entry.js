

/*Custom jQuery selector for selecting sections and section indicators*/
$.expr[':'].isSection = function(element, index, meta) {
	//meta[3] is the param passed in isSection(<section-index>)
	return $(element).data('section-index') == meta[3];
}


function fillFieldsFromSavedData() {

	
	var key, index, fieldName;//initialize vars instantiated in for statements

	for (const key in FIELD_VALUES) {
		const value = FIELD_VALUES[key];
		
		if (key === 'reactions' || key === 'attachments') continue; // reactions are set manually below

		// Value is either a string/number corresponding to a single field or an object 
		//	containing a series of values corresponding to an accordion with potentially 
		//	several cards
		if (typeof(value) === 'object') { // corresponds to an accordion
			// Loop through each object and add a card/fill fields 
			const $accordion = $('.accordion')
				.filter((_, el) => {return $(el).data('table-name') === key})
			for (const index in value) {
				const $card = addNewCard($accordion, index);
				const inputValues = value[index];
				for (const fieldName in inputValues) {
					const thisVal = inputValues[fieldName];
					
					// Find input where the name === to this field
					const $input = $card
						.find('.input-field')
						.filter((_, el) => {return ($(el).attr('name') || '').startsWith(fieldName)});
					
					// If this is a checkbox, set the checked property. Otherwise,
					//	just set the val directly
					if ($input.is('.input-checkbox')) {
						$input.prop('checked', thisVal);
					} else {
						$input.val(thisVal);
					}
					//This will unnecessarily call onInputFieldChange() but this is probably
					//	the best way to ensure that all change event callbacks are get called
					if ($accordion.data('table-name') == 'reactions') {
						let b = 1;
					}
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

	// Because the reaction select options are based on the reaction-by select and 
	//	the order in which inputs are filled is random, the reaction val might be 
	//	set before the reaction-by val. That makes the reaction val null and also 
	//	messes up setting the card label. The solution here is just to set each 
	//	reaction manually.
	if ('reactions' in FIELD_VALUES) {
		const $reactionsAccordion = $('#reactions-accordion');
		const reactions = FIELD_VALUES.reactions;
		for (index in reactions) {
			const $card = addNewCard($reactionsAccordion, index);
			const $reaction = $('#input-reaction-5-' + index);
			const $reactionBy = $('#input-reaction_by-5-' + index)
				.val(reactions[index].reaction_by)
				.change();
			updateReactionsSelect($reactionBy)
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
}


function getFieldInfo() {

	// Check if the user has a field values from a saved session
	const fieldValueString = window.localStorage.fieldValues;
	if (fieldValueString) FIELD_VALUES = $.parseJSON(fieldValueString);

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
	queryDB(sql).then(
		doneFilter=(queryResultString) => {
			const queryResult = $.parseJSON(queryResultString);
			if (queryResult) {
				const hasSavedSession = Object.keys(FIELD_VALUES).length;
				queryResult.forEach( (row) => {
					const columnName = row.column_name;
					FIELD_INFO[columnName] = {};
					FIELD_INFO[columnName].tableName = row.table_name;
					FIELD_INFO[columnName].dataType = row.data_type;
				});
				
				/*if (hasSavedSession) {
					fillFieldsFromSavedData();	
				}*/
			}
		},
		failFilter=(xhr, status, error) => {
			showModal(`An unexpected error occurred while connecting to the database: ${error} from query:\n${sql}.\n\nTry reloading the page.`, 'Unexpected error')
		}
	);

}


function onInputFieldChange(event) {

	const $input = $(event.target);
	const $accordion = $input.closest('.accordion');

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
	
	const val = $input.is('.input-checkbox') ? $input.prop('checked') : $input.val();

	const fieldInfo = FIELD_INFO[fieldName];
	if (!fieldInfo) {
		console.log(`${fieldName} not in FIELD_INFO. ID: ${$input.attr('id')}`);
		/*FIELD_VALUES[fieldName] = val;
		return;*/
	} 
	
	// If the field is inside an accordion, it belongs to a 1-to-many relationship and 
	//	there could, therefore, be multiple objects with this column. In that case,
	//	append it to the appropriate object (as IDed by the index of the card)
	if ($accordion.length) {

		const tableName = $accordion.data('table-name');//fieldInfo.tableName;

		// If this is the first time a field has been changed in this 
		//	accordion, FIELD_VALUES[tableName] will be undefined
		if (!FIELD_VALUES[tableName]) FIELD_VALUES[tableName] = {};
		const tableRows = FIELD_VALUES[tableName];
		
		// Get the index of this card within the accordion
		const index = $input.attr('id').match(/\d+$/)[0];
		if (!tableRows[index]) tableRows[index] = {};
		tableRows[index][fieldName] = val;
	} else {
		FIELD_VALUES[fieldName] = val;
	}
}


function validateFields($parent) {


	const $fields = $parent
		.find('.field-container:not(.disabled)')
		.find('.input-field:required, .required-indicator + .input-field').not('.hidden').each(
		(_, el) => {
			const $el = $(el);
			const $hiddenParent = $el.closest('.field-container.collapse, .card.cloneable').not('.show');
			if (!$el.val() && $hiddenParent.length === 0) {
				$el.addClass('error');
			}
	});

	if ($fields.filter('.error').length) {
		// Search the parent(s) for any .collapse elements that aren't shown. 
		//	If one is found, show it
		$parent.each(function() {
			const $el = $(this);
			if ($el.hasClass('collapse') && !$el.hasClass('show')) {
				$el.siblings('.card-header')
					.find('.card-link')
					.click();
				return false;
			}
		});
		$fields.first().focus();
		return false;
	} else {
		return true;
	}

	/*	const $fieldContainers = $parent.find('.input-field:required, .required-indicator + .input-field').map(
		function() {
			const $el = $(this);
			if (!$el.val()) {
				$el.closest('.field-container').addClass('error');
			}
	})

	if ($fieldContainers.filter('.error').length) {
		$parent.focus();
		return false;
	} else {
		return true;
	}*/
}


function goToSection(movement=1) {
	
	/* 
	Skip to the section of the form.
	@param movement: number of sections to jump to (positive=right or negative=left)
	*/

	const $currentSection = $('.form-section').filter('.selected');
	const currentIndex = parseInt($currentSection.data('section-index'));
	const nextIndex = currentIndex + movement;
	const nextElementID = `#section-${nextIndex}`;
	const $nextSection = $(nextElementID);

	// Set style/selection on sections
	$currentSection.removeClass('selected');
	$nextSection.addClass('selected');

	$(`.indicator-dot:isSection(${currentIndex})`).removeClass('selected');
	$(`.indicator-dot:isSection(${nextIndex})`).addClass('selected');

	// If there's an accordion in the new section, find any shown cards and
	//	collapse them, then show them again after a delay
	const $shown = $nextSection.find('.card:not(.cloneable) .card-collapse.show')
		.filter('.show')
		.removeClass('show');
	if ($shown.length) {
		setTimeout(function() {
			$shown.siblings('.card-header')
				.find('.card-link')
				.click()
		}, 800);
	}

	
	// if user settings prefer no motion, go directly to the section. 
	//	Otherwise, scroll to it
	const preventMotion = window.matchMedia('(prefers-reduced-motion)').matches
	if (preventMotion) {
		window.location.hash = nextElementID;
		// Prevent jump link from appearing in URL (so user can't reload or 
		//	use back button to go directly to a section, presumably by accident)
		window.history.replaceState(null, document.title, document.URL.split('#')[0])
	} else {
		document.getElementById(nextElementID.replace('#', '')).scrollIntoView();
		//window.location.hash = nextElementID;
	}
	
	if ($nextSection.is('.submit-section')) {
		$('.required-indicator-explanation').addClass('hidden');
	} else {
		$('.required-indicator-explanation').removeClass('hidden');
	}

	return nextIndex;

}


function setPreviousNextButtonState(nextIndex) {
	/* 
	Toggle the .disabled class on the next or previous button 
	if the user is at the first or last section

	@param nextIndex [integer]: the section index that the user is moving to
	
	*/

	if (nextIndex === 0) {
		$('#previous-button').addClass('disabled');
	} else {
		$('#previous-button').removeClass('disabled');
	}
	if (nextIndex === $('.form-section:not(.title-section)').length - 1) {
		$('#next-button').addClass('disabled');
	} else {
		$('#next-button').removeClass('disabled');
	}
}


function onPreviousNextButtonClick(event, movement) {

	event.preventDefault();//prevent form from reloading
	const $button = $(event.target);
	if ($button.hasClass('disabled')) return;

	if ($button.attr('id') !== 'title-section-continue-button') {
		const allFieldsValid = $('.form-section.selected .validate-field-parent:not(.cloneable)')
			.map(function() {
				return validateFields($(this))
			}).get()
			.every((isValid) => isValid);
		if (!allFieldsValid) return;
	}

	const nextIndex = goToSection(movement);

	// The form navigation is initially hidden (other than the continue button) 
	//	so show it once that button is clicked and hide the 'continue' button
	if ($button.attr('id') === 'title-section-continue-button') {
		$('.form-footer .form-navigation').removeClass('hidden');
		$button.addClass('hidden');
	} else {
		// Enable/disable nav buttons
		setPreviousNextButtonState(nextIndex);
	}

}


function onIndicatorDotClick(event) {
	
	event.preventDefault();
	$dot = $(event.target);
	if ($dot.hasClass('selected')) return;

	// validate fields for the currently selected section
	/*const allFieldsValid = $('.form-section.selected .validate-field-parent')
		.map(function() {
			return validateFields($(this))
		}).get()
		.every((isValid) => isValid);
	if (!allFieldsValid) return;*/

	const currentIndex = parseInt($('.indicator-dot.selected').data('section-index'));
	const nextIndex = parseInt($dot.data('section-index'));

	goToSection(nextIndex - currentIndex);

	setPreviousNextButtonState(nextIndex);

}


function toggleDependentFields($select) {
	/*Helper function to recursively hide/show fields with data-dependent-target attribute*/

	const selectID = '#' + $select.attr('id');
	// Get all the elements with a data-dependent-target 
	const dependentElements = $(`
		.collapse.field-container .input-field, 
		.collapse.accordion, 
		.collapse.add-item-container .add-item-button
		`).filter((_, el) => {return $(el).data('dependent-target') === selectID});
	//const dependentIDs = $select.data('dependent-target');
	//var dependentValues = $select.data('dependent-value');
	dependentElements.each((_, el) => {
		const $thisField = $(el);
		var dependentValues = $thisField.data('dependent-value').toString();
		if (dependentValues) {
			var $thisContainer = $thisField.closest('.collapse.field-container, .collapse.accordion, .collapse.add-item-container');
			
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
	/*const $dependentFields = $($select.data('dependent-target'));
	if ($dependentFields.length) {
		$dependentFields.each((i, el) => {
			const $dependentField = $(el);
			const $dependentContainer = $dependentField.closest('.collapse.field-container');
			if (hide) {
				$dependentContainer.collapse('hide');
				$dependentField.addClass('hidden');
				toggleDependentField($dependentField, hide=true);
			} else if ($dependentField.hasClass('has-dependent-value')) {
				$dependentField.removeClass('hidden');
				$dependentContainer.collapse('show');
				toggleDependentField($dependentField, hide=false)
			}
		});
	}*/

}

function onSelectChange() {

	// Set style depending on whether the default option is selected
	const $select = $(this);

	if ($select.val() === '') {
		$select.addClass('default');

	} else {
		$select.removeClass('default error');
		// the user selected an actual option so remove the empty default option
		$select.find('option').each(function(){
			const $option = $(this);
			if ($option.val() == '') {
				$option.remove();
			}
		})
	}

	// If there are any dependent fields that should be shown/hidden, 
	//	toggle its visibility as necessary
	toggleDependentFields($select);
	/*const dependentIDs = $select.data('dependent-target');
	var dependentValues = $select.data('dependent-value');
	if (dependentIDs && dependentValues) {
		dependentIDs.split(',').map((s) => {return s.trim()}).forEach((id, i) => {
			const $dependentField = $(id);
			dependentValues = dependentValues.toString().split(',').map((s) => {return s.trim()});
			if (dependentValues.includes($select.val().toString())) {
				$dependentField.addClass('has-dependent-value')
				toggleDependentField($select, hide=false)
			} else {
				$dependentField.removeClass('has-dependent-value')
				toggleDependentField($select, hide=true)
			}
		});
	}*/

}


function addNewCard($accordion, cardIndex=null) {
	/* 
	Add a new card to the accordion. There needs to be a card with the class "cloneable", 
	which should be hidden and only used to add a new item
	*/

	
	// Validate existing person sub-forms

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
	const sectionIndex = $accordion.closest('.form-section')
		.data('section-index');
	if (!cardIndex) {
		var cardIndex = $accordion.find('.card').length - 1;// - 1 because cloneable is 0th
		while ($(`#card-${sectionIndex}-${cardIndex}`).length) {
			cardIndex++;
		}
	}
	//if (cardIndex < 0) cardIndex = 0;
	/*	const $lastCard = $accordion.find('.card:not(.cloneable):last-child');
	const cardIndex = $lastCard.length ? 
		parseInt($lastCard.attr('id').match(/\d+$/)) + 1 :
		0;
		*/
	const idSuffix = `${sectionIndex}-${cardIndex}`;

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
		.attr('for', `attachment-upload-${idSuffix}`);
	
	// Add to the accordion
	$newCard.appendTo($accordion).fadeIn();

	// Open the card after a brief delay
	//$newCard.find('.collapse:not(.show)').click();
	setTimeout(function(){
		$newCard.find('.collapse:not(.show)').siblings('.card-header').find('.card-link').click();
	}, 500);

	// If this a a card in the interactions section (5), remove options from the 
	//	reaction select because they get filled when the user selects a reaction_by
	/*if ($newCollapse.attr('id').startsWith('collapse-5')) {
		const $reactionSelect = $newCollapse.find('select.input-field').filter((_, el) => {return el.id.startsWith('input-reaction-5')})
		$reactionSelect.find('option:not([value=""])').remove();
		
	}*/

	return $newCard;
}


function onAddNewItemClick(event) {
	event.preventDefault();
	const $accordion = $('#' + $(event.target).data('target'));

	const itemName = $accordion.find('.delete-button').first().data('item-name');
	var isValid = true;
	$accordion.find('.card:not(.cloneable) .card-collapse').each(function() {
		isValid = validateFields($(this));
		if (!isValid) {

			showModal(`You have to finish filling details of all existing ${itemName ?  itemName : 'item'}s before you can add a new one.`, 'Incomplete item');
			return;
		}
	})

	if (isValid) addNewCard($accordion);
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


function onConfirmDeleteCardClick(cardID) {
	
	$('#' + cardID).fadeOut(500, function(){
		const $card = $(this);
		const cardIndex = cardID.match(/\d+$/)[0];
		const tableName = $card.closest('.accordion').data('table-name');
		const $siblings = $card.siblings('.card:not(.cloneable)');
		$card.remove();
		delete FIELD_VALUES[tableName][cardIndex];
		$siblings.each((_, el) => {onCardLabelFieldChange($(el).find('.card-label-field').first())});
	})
}


function onDeleteCardClick(event) {

	event.preventDefault();
	event.stopPropagation();

	var $button = $(event.target);
	if ($button.hasClass('fas')) 
		$button = $button.closest('.delete-button');//if the actual target clicked was the icon, bubble up to the button
	
	const itemName = $button.data('item-name');
	const $card = $button.closest('.card');
	const cardID = $card.attr('id');


	if ($card.siblings('.card').length === 1) {
		showModal(`This is the only ${itemName} listed thus far, and you must enter at least one.`, `Invalid operation`);
	} else {
		// If the user confirms the delete, fade it out after .5 sec then reset the remaining card labels
		const onConfirmClick = ``;
		const footerButtons = `
			<button class="generic-button modal-button secondary-button close-modal" data-dismiss="modal">No</button>
			<button class="generic-button modal-button danger-button close-modal" data-dismiss="modal" onclick="onConfirmDeleteCardClick('${cardID}')">Yes</button>
		`;
		showModal(`Are you sure you want to delete this ${itemName}?`, `Delete ${itemName}?`, 'confirm', footerButtons);
	}

}


function setCardLabel($card, names, defaultText, joinCharacter=' ') {

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


	const indexText = $cardLabel.data('index-label') ? //if true, add the index to the label
		`${$card.index()} - ` : '';//`${parseInt($card.attr('id').match(/\d+$/)) + 1} - ` : ''
	const joinedText = indexText + sortedComponents.join(joinCharacter);

	if (sortedComponents.length === names.length) {
		$cardLabel.fadeOut(250).fadeIn(250).delay(300).text(joinedText);
	} else if ($cardLabel.text() !== defaultText) {
		$cardLabel.fadeOut(250).fadeIn(250).delay(300).text(defaultText);
	}
}


function onCardLabelFieldChange($field) {

	const $card = $field.closest('.card');
	
	var names = $card.find('.card-label-field')
		.map(function() {
    		return $(this).attr('name');
		})
		.get(); // get returns the underlying array

	//const defaultText = $card.closest('.accordion').find('.card.cloneable.hidden .card-link-label').text();
	const defaultText = $card.find('.card-link-label').text();

	setCardLabel($card, names, defaultText);
}


function onInputFieldKeyUp(event) {
	$(event.target).removeClass('error');
}


function getCityAndState(countryCode, postalCode) {

	const deferred = $.ajax({
		url: `https://zip.getziptastic.com/v2/${countryCode}/${postalCode}`, //http://api.zippopotam.us
		cache: false,
		dataType: "json",
		type: "GET"
	})

	return deferred;
}


function onCountryPostalCodeChange(event) {

	event.preventDefault();

	const $el = $(event.target);
	const $cardBody = $el.closest('.card-body');
	const $country = $cardBody.find('select.input-field').filter((_, el) => {return $(el).attr('id').startsWith('input-country-0')});
	const $zipcode = $cardBody.find('input.input-field').filter((_, el) => {return $(el).attr('id').startsWith('input-zip_code-0')});
	const countryCode = $country.val();
	const postalCode = $zipcode.val();

	if (countryCode && postalCode) {
		getCityAndState(countryCode, postalCode)
			.then(function(jsonResponse) {
				if (jsonResponse.city && jsonResponse.state_short) {
					$city = $cardBody.find('input.input-field').filter((_, el) => {return $(el).attr('id').startsWith('input-city-0')});
					$state = $cardBody.find('select.input-field').filter((_, el) => {return $(el).attr('id').startsWith('input-state-0')});
					$city.val(jsonResponse.city);
					$state.val(jsonResponse.state_short).change();
				}
			});

	}
}


function onInitialActionChange() {
	/*
	Rather than using the dependent-target/value attributes, the interactions 
	accordion should only be shown when both inital action fields are filled
	*/
	var fieldsFull;
	$('#input-initial_human_action-5, #input-initial_bear_action-5').each((_, el) => {
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


function onCoordinateFormatChange(event) {
	/*
	Rather than using the dependent-target/value attributes, the previous 
	coordinate fields should be hidden immediately to avoid the brief but 
	disorienting moment when 2 sets of coordinate fields are visible
	*/

	const $select = $(event.target);
	// Hide all coordinate fields (which is really just the currently visible one)
	$('.coordinates-ddd, .coordinates-ddm, .coordinates-dms').each((_, el) => {
		$(el).closest('.collapse')
			.addClass('hidden')//add hidden class first
			.collapse('hide');
	})
		
	// Show the one that corresponds to the selected format
	$('.coordinates-' + $select.val())
		.closest('.collapse')
			.collapse('show');
}


function fillCoordinateFields(latDDD, lonDDD) {
	/*Convert coordinates from decimal degrees to degrees decimal 
	minutes and degrees minutes seconds and fill in the respective fields*/

	const $latDDDField = $('#input-lat_dec_deg-3').val(latDDD);
	const $lonDDDField = $('#input-lon_dec_deg-3').val(lonDDD);

	const minuteStep = $('#input-lat_dec_min-3').attr('step');
	const minuteRounder = Math.round(1 / (minuteStep ? minuteStep : 0.001));
	const latSign = latDDD / Math.abs(latDDD)
	const latDegrees = Math.floor(Math.abs(latDDD)) * latSign
	const latDecimalMinutes = Math.round((Math.abs(latDDD) - Math.abs(latDegrees)) * 60 * minuteRounder) / minuteRounder;
	const lonSign = lonDDD/Math.abs(lonDDD)
	const lonDegrees = Math.floor(Math.abs(lonDDD)) * lonSign;
	const lonDecimalMinutes = Math.round((Math.abs(lonDDD) - Math.abs(lonDegrees)) * 60 * minuteRounder) / minuteRounder;
	$('#input-lat_deg_ddm-3').val(latDegrees);
	$('#input-lat_dec_min-3').val(latDecimalMinutes);
	$('#input-lon_deg_ddm-3').val(lonDegrees);
	$('#input-lon_dec_min-3').val(lonDecimalMinutes);

	const secondStep = $('#input-lat_dec_sec-3').attr('step');
	const secondRounder = Math.round(1 / (secondStep ? secondStep : 0.1));
	const latMinutes = Math.floor(latDecimalMinutes);
	const latDecimalSeconds = Math.round((latDecimalMinutes - latMinutes) * 60 * secondRounder) / secondRounder;
	const lonMinutes = Math.floor(lonDecimalMinutes);
	const lonDecimalSeconds = Math.round((lonDecimalMinutes - lonMinutes) * 60 * secondRounder) / secondRounder;
	$('#input-lat_deg_dms-3').val(latDegrees);
	$('#input-lat_min_dms-3').val(latMinutes);
	$('#input-lat_dec_sec-3').val(latDecimalSeconds);
	$('#input-lon_deg_dms-3').val(lonDegrees);
	$('#input-lon_min_dms-3').val(lonMinutes);
	$('#input-lon_dec_sec-3').val(lonDecimalSeconds);

}


function markerIsOnMap() {
	/* 
	Helper function to check if the encounter Marker has 
	already been added to the encounter location map
	*/

	var isOnMap = false;
	ENCOUNTER_MAP.eachLayer((layer) => {
		if (layer === ENCOUNTER_MARKER) isOnMap = true;
	});

	return isOnMap;
}


function getRoundedDDD(lat, lon) {

	const step = $('#input-lat_dec_deg-3').attr('step');
	const rounder = Math.round(1 / (step ? step : 0.0001));
	const latDDD = Math.round(lat * rounder) / rounder;
	const lonDDD = Math.round(lon * rounder) / rounder;

	return [latDDD, lonDDD];
}


function placeEncounterMarker({lat=0, lng=0}={}) {
	/*
	Add or move the encounter Marker on the encounter location map. 
	Also update the coordinate fields accordingly. The only argument
	is an object with properties "lat" and "lng" to mirror the 
	Leaflet.event.latlng object.

	lat: latitude in decimal degrees
	lng: longitude in decimal degrees.
	*/

	ENCOUNTER_MARKER.setLatLng({lat: lat, lng: lng});//, options={draggable: true});
	
	if (!markerIsOnMap()) {
		ENCOUNTER_MARKER.addTo(ENCOUNTER_MAP);
		removeDraggableMarker();
	}

	// If the marker is outside the map bounds, zoom to it
	if (!ENCOUNTER_MAP.getBounds().contains(ENCOUNTER_MARKER.getLatLng())) {
		ENCOUNTER_MAP.setView(ENCOUNTER_MARKER.getLatLng(), ENCOUNTER_MAP.getZoom());
	}
	
	// Make sure the coords for fields are appropriately rounded
	var [latDDD, lonDDD] = getRoundedDDD(lat, lng);

	// Fill DMM and DMS fields
	fillCoordinateFields(latDDD, lonDDD);
}


function removeDraggableMarker() {
	/* helper function to remove the draggable marker and the label */

	$('#encounter-marker-img').remove();
	$('#encounter-marker-container').slideUp(500, (_, el) => {$(el).remove()});
}


function markerDroppedOnMap(event) {
	/*
	Place the marker when the user drops the draggable marker img on the map
	*/
	event.preventDefault()
	
	// Convert pixel coordinates of the drop event to lat/lon map coordinates.
	//	Adjust for the offset of where the user grabbed the marker. It should be
	//	the distance to the center-bottom of the marger img. The underlying Leaflet
	//	API uses either .pageX or .clientX so just reset both (see
	//	https://github.com/Leaflet/Leaflet/blob/e64743f741e6d13e36dea26f494d52e960a3274e/src/dom/DomEvent.js#L141
	//	for source code)
	var originalEvent = event.originalEvent;
	const $target = $(originalEvent.target);
	originalEvent.pageX -= originalEvent.offsetX - ($target.width() / 2);
	originalEvent.pageY -= originalEvent.offsetY - $target.height();
	originalEvent.clientX -= originalEvent.offsetX - ($target.width() / 2); 
	originalEvent.clientY -= originalEvent.offsetY - $target.height();
	const latlng = ENCOUNTER_MAP.mouseEventToLatLng(originalEvent);
	
	placeEncounterMarker(latlng);

	removeDraggableMarker();
}


function setCoordinatesFromMarker() {
	/*Use encounter Merker to reset coordinate fields*/

	const latlng = ENCOUNTER_MARKER.getLatLng();
	var [latDDD, lonDDD] = getRoundedDDD(latlng.lat, latlng.lng);
	fillCoordinateFields(latDDD, lonDDD);
}


function coordinatesToDDD(latDegrees=0, lonDegrees=0, latMinutes=0, lonMinutes=0, latSeconds=0, lonSeconds=0) {
	/*Convert coordinates to decimal degrees*/

	const latSign = latDegrees / Math.abs(latDegrees);
	var latDDD = parseInt(latDegrees) + (parseInt(latMinutes) / 60 * latSign) + (parseInt(latSeconds / 60 ** 2) * latSign);
	const lonSign = lonDegrees / Math.abs(lonDegrees);
	var lonDDD = parseInt(lonDegrees) + (parseInt(lonMinutes) / 60 * lonSign) + (parseInt(lonSeconds / 60 ** 2) * lonSign);

	return [latDDD, lonDDD];
}


function confirmMoveEncounterMarker(lat, lon) {
	/* 
	If the encounter Marker is already on the map, ask the user
	(with a modal dialog) if they want to move it to [lat, lon]. 
	Otherwise, just place it at [lat, lon].
	*/ 
	
	const onConfirmClick = `placeEncounterMarker({lat: ${lat}, lng: ${lon}})`;
	const footerButtons = `
		<button class="generic-button modal-button secondary-button close-modal" data-dismiss="modal" onclick="setCoordinatesFromMarker()">No</button>
		<button class="generic-button modal-button close-modal" data-dismiss="modal" onclick="${onConfirmClick}">Yes</button>
	`;
	const message = `You've already placed the encounter location marker on the map. Are you sure you want to move it to a new location? Click 'No' to revert your changes.`
	showModal(message, `Move the encounter location?`, 'confirm', footerButtons);
}


function onDDDFieldChange() {
	/*Event handler for when a decimal degree field is changed*/

	const latDDD = $('#input-lat_dec_deg-3').val();
	const lonDDD = $('#input-lon_dec_deg-3').val();

	if (latDDD && lonDDD) {
		if (markerIsOnMap()) { 
			confirmMoveEncounterMarker(latDDD, lonDDD);
		} else {
			placeEncounterMarker({lat: latDDD, lng: lonDDD})
		}
	}
}


function onDMMFieldChange() {
	/*Event handler for when a degree decimal minute field is changed*/

	const latDegrees = $('#input-lat_deg_ddm-3').val();
	const lonDegrees = $('#input-lon_deg_ddm-3').val();
	const latDecimalMinutes = $('#input-lat_dec_min-3').val();
	const lonDecimalMinutes = $('#input-lon_dec_min-3').val();

	if (latDegrees && lonDegrees && latDecimalMinutes && lonDecimalMinutes) {
		var [latDDD, lonDDD] = coordinatesToDDD(latDegrees, lonDegrees, latDecimalMinutes, lonDecimalMinutes);
		if (markerIsOnMap()) { 
			confirmMoveEncounterMarker(latDDD, lonDDD);
		} else {
			placeEncounterMarker({lat: latDDD, lng: lonDDD})
		}
	}

}


function onDMSFieldChange() {
	/*Event handler for when a degree decimal minute field is changed*/

	const latDegrees = $('#input-lat_deg_dms-3').val();
	const lonDegrees = $('#input-lon_deg_dms-3').val();
	const latMinutes = $('#input-lat_min_dms-3').val();
	const lonMinutes = $('#input-lon_min_dms-3').val();
	const latDecimalSeconds = $('#input-lat_dec_sec-3').val();
	const lonDecimalSeconds = $('#input-lon_dec_sec-3').val();

	if (latDegrees && latDecimalMinutes && lonDegrees && lonDecimalMinutes && latDecimalSeconds && lonDecimalSeconds) {
		var [latDDD, lonDDD] = coordinatesToDDD(latDegrees, lonDegrees, latMinutes, lonMinutes, latDecimalSeconds, lonDecimalSeconds);
		if (markerIsOnMap()) { 
			confirmMoveEncounterMarker(latDDD, lonDDD);
		} else {
			placeEncounterMarker({lat: latDDD, lng: lonDDD})
		}
	}

}


function onBearGroupTypeChange() {



}


function updateReactionsSelect($actionBySelect) {

	const actionBy = $actionBySelect.val();
	const cardIndex = $actionBySelect.attr('id').match(/\d+$/);
	const reactionSelectID = `input-reaction-5-${cardIndex}`;
	const $reactionSelect = $('#' + reactionSelectID).empty();


	const $label = $reactionSelect.siblings('.field-label');
	var labelText = '';
	switch (parseInt(actionBy)) {
		case 1://human
			labelText = 'What did you/another person do?';
			break;
		case 2://bear
			labelText = 'What did the bear do?';
			break;
		case 3://dog
			labelText = 'What did the dog do?';
			break;
		case 4: //stock animal
			labelText = 'What did the stock animal do?';
			break;
	}
	$label.text(labelText);
	$reactionSelect.attr('placeholder', labelText)
		.addClass('default')
		.append(`<option class="" value="">${labelText}</option>`);
	
	// Return the deferred object so other functions can be triggered 
	//	after the select is filled
	return fillSelectOptions(reactionSelectID, 
		`
		SELECT code AS value, name 
		FROM reaction_codes 
		WHERE 
			sort_order IS NOT NULL AND 
			action_by='${actionBy}' 
		ORDER BY sort_order`
	);
}


function updateAttachmentAcceptString(fileTypeSelectID) {
	
	const $fileTypeSelect = $('#' + fileTypeSelectID);
	const extensions = ACCEPTED_ATTACHMENT_EXT[$fileTypeSelect.val()];
	const suffix = $fileTypeSelect.attr('id').match(/\d+\-\d+$/);
	$(`#attachment-upload-${suffix}`).attr('accept', extensions);

	$fileTypeSelect.data('previous-value', $fileTypeSelect.val());
}


function onAttachmentTypeChange(event) {

	const $fileTypeSelect = $(event.target);
	const fileTypeSelectID = $fileTypeSelect.attr('id');
	const previousFileType = $fileTypeSelect.data('previous-value');//should be undefined if this is the first time this function has been called
	const $fileInput = $fileTypeSelect.closest('.card-body').find('.file-input-label ~ input[type=file]');
	const fileInputID = $fileInput.attr('id');

	// If the data-previous-value attribute has been set and , that means the user has already selected a file
	if (previousFileType && $fileInput.get(0).files[0]) {
		const onConfirmClick = `
			updateAttachmentAcceptString('${fileTypeSelectID}');
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
		updateAttachmentAcceptString($fileTypeSelect.attr('id'));
	}
}


function getVideoStill($thumbnail, fileReader, file) {
	var blob = new Blob([fileReader.result], {type: file.type});
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


function setAttachmentThumbnail(fileType, $thumbnail, fileReader, file) {

	switch (parseInt(fileType)) {
		case 1://img
			$thumbnail.attr('src', event.target.result);
			break;
		case 2://video
			getVideoStill($thumbnail, fileReader, file);
			break;
		case 3://audio
			$thumbnail.attr('src', 'imgs/audio_thumbnail.jpg');
			break;
		default:
			throw 'Could not understand fileType: ' + fileType;
	}
	$thumbnail.removeClass('hidden');
}


function readAttachment(sourceInput, $destinationImg, $progressBar) {
  	
  	const $barContainer = $progressBar.closest('.attachment-progress-bar-container');
  	const file = sourceInput.files[0];
	if (sourceInput.files && file) {
		var reader = new FileReader();
		const fileName = file.name;

		reader.onprogress = function(event) {
			// Show progress
			if (event.lengthComputable) {
				const progress = event.loaded / event.total;
				$progressBar.css('width', `${$barContainer.width() * progress}px`)
			}
		}

		reader.onerror = function(event) {
			// Hide preview and progress bar and notify the user
			$progressBar.closest('.collapse').hide();
			showModal(`The file '${fileName}' failed to upload correctly. Make sure your internet connection is consistent and try again.`, 'Upload failed');
		}

		reader.onload = function(event) {
			// Show the thumbnail and hide the progress bar
			const fileType = $barContainer.closest('.card').find('select').val();
			setAttachmentThumbnail(fileType, $destinationImg, reader, file);
			$barContainer.addClass('hidden');
			$destinationImg.closest('.card')
				.find('.card-link-label')
					.fadeOut(250)
					.fadeIn(250)
					.delay(300)
					.text(fileName);
			ATTACHMENT_FILES[sourceInput.id] = sourceInput.files;
			$progressBar.css('width', '0px');
		}

		if (file.type.match('image')) {
			reader.readAsDataURL(file); 
		} else {
			reader.readAsArrayBuffer(file);
		}
	}
}


function onAttachmentInputChange(event) {
	
	const el = event.target; 
	const $parent = $(el).closest('.field-container');

	// If the user cancels, it resets the input files attribute to null 
	//	which is dumb. Reset it to the previous file and exit
	if (el.files.length === 0) {
		el.files = ATTACHMENT_FILES[el.id];
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
	

	readAttachment(el, $thumbnail, $progressBar);
}


function showModalImg(src) {
	/*Configure a lightbox-style modal image preview*/

	const $img = $('#modal-img-preview').attr('src', src).removeClass('hidden');
	$img.siblings(':not(.modal-header-container)').addClass('hidden');
	const img = $img.get(0);
	const imgWidth = window.innerHeight * .8 * img.naturalWidth/img.naturalHeight;//img.height doesn't work because display height not set immediately
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


function onThumbnailClick(event) {

	const $thumbnail = $(event.target);
	const fileInput = $thumbnail.closest('.card').find('input[type=file]').get(0);
	if (fileInput.files.length) { // this should always be the case but better safe than sorry
		const file = fileInput.files[0];
		const fileType = $thumbnail.closest('.card')
			.find('select')
				.val();
		if (fileType == 1) {
			showModalImg($thumbnail.attr('src')); 
		} else if (fileType.toString().match('2|3')) {
			const url = URL.createObjectURL(file);
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
	recognition.continuous = true;
	recognition.interimResults = true;
	
	recognition.onresult = function(event) {
		if (typeof(event.results) == 'undefined') {
			recognition.stop();
			return;
		}

		var interimTranscript = '';
		var finalTranscript = $('#recorded-text-final').text() || '';
		results = event.results;
		for (var i = 0; i < results.length; i++) {
			if (event.results[i].isFinal) {
				finalTranscript += event.results[i][0].transcript;
			} else {
				interimTranscript += event.results[i][0].transcript;
			}
		}
		$('#recorded-text-final').text(finalTranscript);
		$('#recorded-text-interim').text(interimTranscript);
		$('#input-narrative-9').val(finalTranscript);
	}

	const $micButton = $('#record-narrative-button');
	const $micIcon = $micButton.children('i');
	const $recordingIndicator = $micButton.children('.record-on-indicator');
	recognition.onstart = function(event) {
		$micIcon.addClass('blink');
		$recordingIndicator.addClass('recording');
		console.log('audio started');
	}

	recognition.onerror = function(event) {
		if (event.error === 'not-allowed') {
			showModal('Speech recognition was not given permission to begin. Please adjust your browser settings.', 'Unable to record speech');
		} else if (event.error == 'audio-capture') {
			showModal('No microphone was found. Make sure that you have a microphone installed and that your browser settings allow access to it.', 'No microphone found');
		}else {
			$('#recording-status-message').text(`...${event.error.message}...`);
		}
	}

	recognition.onend = function(event) {
		$micIcon.removeClass('blink');
		$recordingIndicator.removeClass('recording');
		console.log('audio ended');
	}

	recognition.soundstart = function(event) {
		console.log('soundstart')
	}

	return recognition;
}


function onMicIconClick(event){
	//var recognition = initDictation();
	event.preventDefault();

	if (! recognition) {
		console.log("speech recognition API not available")
		return;
	}
	try {
		recognition.start()
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

function onSubmitButtonClick(event) {

	event.preventDefault();

	// Save attachments
	const $attachmentInputs = $('.card:not(.cloneable) .attachment-input');
	var deferreds = [];
	var uploadedFiles = [];
	var failedFiles = [];
	for (const fileInput of $attachmentInputs) {
		if (fileInput.files.length) {
			const fileName = fileInput.files[0].name;
			deferreds.push(saveAttachment(fileInput)
				.then(
					doneFilter=(resultString) => {
						console.log(resultString)
						if (resultString.trim().startsWith('ERROR')) {
							failedFiles.push(fileName);
						} else {
							uploadedFiles.push(fileName)
						}
					
					},
					failFilter=function(xhr, status, error) {
						console.log(`File upload for ${fileName} failed with status ${status} because ${error}`);
						failedFiles.push(fileName);
					}
				)
			);

		}
	}
	// When all of the uploads have finished (or failed), let the user know the result
	$.when(...deferreds).then(function() {
		if (failedFiles.length) {

			const message = `
				The following files failed to upload:<br>
					<ul>
						<li>${failedFiles.join('</li><li>')}</li>
					</ul>
			`;
			showModal(message, 'File uploads failed');
			return;
		} else {
			showModal('Upload successful for ' + uploadedFiles[0], 'Upload successful');
		}
	})

	//Insert data

	/*$('#section-10 .submition-confirmation-container')
		.removeClass('hidden')
		.siblings()
			.addClass('hidden');*/

}