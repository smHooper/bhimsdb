
function customizeEntryForm() {

	// When bear species, color, or cohort gets filled, add appropriate number 
	//	of cards to the hidden accordion. Trigger change manually because in 
	//	case fields are filled from previous data, customizeEntryForm() is called 
	//	after fields are filled
	$('.dena-bear-field').change(entryForm.onDENABearFieldChange).change();

	
	// Make the reactions accordion match the DENA BHIMS form
	const $reactionsAccordion = $('#reactions-accordion');
	
	// Remove the .card-label-field from inputs to turn off the delegated event 
	//	handler for onCardLabelFieldChange()
	$reactionsAccordion.find('.card-label-field').removeClass('card-label-field');

	// Hide the reaction by fields
	$reactionsAccordion.find('.input-field[name="reaction_by"]')
		.parent()
			.addClass('hidden');

	// Hide the add reaction button
	$('.add-item-button[data-target="reactions-accordion"]').parent().addClass('hidden')

	const $reactionCards = $('#reactions-accordion .card:not(.cloneable)');
	const $personCard = $reactionCards.first();
	// If the reaction_code field isn't yet set, set the select options
	if ($personCard.find('.input-field[name="reaction_code"]').val() === '') {
		$personCard.find('.input-field[name="reaction_by"]').val(1).change();//set to person
	}
	$personCard.find('.card-link-label').text('What was your initial reaction when you first observed the bear?');

	var $bearCard = $reactionCards.eq(1);
	if (!$bearCard.length) {
		$bearCard = entryForm.addNewCard($reactionsAccordion);
	}
	if ($bearCard.find('.input-field[name="reaction_code"]').val() === '') {
		$bearCard.find('.input-field[name="reaction_by"]').val(2).change();//set to bear
	}
	$bearCard.find('.card-link-label').text(`What was the bear's PRIMARY reaction to your presence?`);

}

function customizeQuery() {

	/*
	Map query result back to DENA bear fields
	*/
	BHIMSQuery.prototype.setDENABearFields = function() {
		const selectedResult = bhimsQuery.queryResult[bhimsQuery.selectedID];
		if (selectedResult) {
			const bears = selectedResult.bears || [];
			if (bears.length) {
				const firstBear = bears[0];
				for (const el of $('.dena-bear-field')) {
					const fieldName = el.name;
					if (fieldName in firstBear) {
						const value = firstBear[fieldName];
						$(el).val(value)
							.toggleClass('default', value == null);
					}
				}
			}
		}

		// Hide the add-item button
		$('#bears-accordion').siblings('.add-item-container').addClass('hidden');
	}

	bhimsQuery.dataLoadedFunctions.push(bhimsQuery.setDENABearFields)
}

