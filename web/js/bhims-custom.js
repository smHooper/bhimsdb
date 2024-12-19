
function customizeEntryForm() {

	// When bear species, color, or cohort gets filled, add appropriate number 
	//	of cards to the hidden accordion. Trigger change manually because in 
	//	case fields are filled from previous data, customizeEntryForm() is called 
	//	after fields are filled
	$('.dena-bear-field').change(entryForm.onDENABearFieldChange).change();

	
	// Make the reactions accordion match the DENA BHIMS form
	const $reactionsAccordion = $('#reactions-accordion');

	// Hide the add reaction button
	$('.add-item-button[data-target="reactions-accordion"]').parent().addClass('hidden')

	let $reactionCards = $reactionsAccordion.find('.card:not(.cloneable)');
	// I can't figure out why there are sometimes fewer reaction cards and other times not,
	// 	so just make sure there are exactly 2
	if ($reactionCards.length !== 2) {
		// const message = 'Oops! The BHIMS form did not load properly. Click <strong>OK</strong> to reload the page, which should resolve the problem.';
		// const footerButton = `<a class="generic-button" href=${window.location.href}>OK</a>`;
		// showModal(message, 'Form Loading Error', 'alert', footerButton, {dismissable: false});
		$reactionCards.remove(); // remvoe from DOM
		$reactionCards = $(); // remove reference
		while ($reactionCards.length < 2)  {
			$reactionCards = $reactionCards.add(entryForm.addNewCard($reactionsAccordion));
		}
	}

	// Remove the .card-label-field from inputs to turn off the delegated event 
	//	handler for onCardLabelFieldChange()
	$reactionsAccordion.find('.card-label-field').removeClass('card-label-field');

	// Hide the reaction by fields
	$reactionsAccordion.find('.input-field[name="reaction_by"]')
		.parent()
			.addClass('hidden');

	const $personCard = $reactionCards.first();
	// If the reaction_code field isn't yet set, set the select options
	if (!$personCard.find('.input-field[name="reaction_code"]').val()) {
		$personCard.find('.input-field[name="reaction_by"]').val(1).change();//set to person
	}
	$personCard.find('.card-link-label').text('What was your initial reaction when you first observed the bear?');

	var $bearCard = $reactionCards.eq(1);
	if (!$bearCard.length) {
		$bearCard = entryForm.addNewCard($reactionsAccordion);
	}
	if (!$bearCard.find('.input-field[name="reaction_code"]').val()) {
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

	BHIMSQuery.prototype.beforeSaveCustomAction = function(sqlStatements, sqlParameters) {
		const tablesToBeUpdated = $('.input-field.dirty').map((_, el) => $(el).data('table-name')).get();
		

		const encounterID = this.selectedID;
		// Add DELETE SQL statement to clear the table before insert. We want to add
		//	the SQL to the sqlStatements so the DELETE and INSERTs all happen in the
		//	same transaction in case one produces an error
		if (tablesToBeUpdated.includes('bears')) {
			return [ 
				[`DELETE FROM bears WHERE encounter_id=$1`].concat(sqlStatements),
				[[encounterID]].concat(sqlParameters)
			]
		} else {
			return [sqlStatements, sqlParameters]
		}

	}


	bhimsQuery.dataLoadedFunctions.push(bhimsQuery.setDENABearFields)
}


