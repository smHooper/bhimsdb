
function customizeConfiguration() {

	// When bear species, color, or cohort gets filled, add appropriate number 
	//	of cards to the hidden accordion
	$('.dena-bear-field').change(entryForm.onDENABearFieldChange);
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

