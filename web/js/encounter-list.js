
var BHIMSEncounterList = (function(){
	
	/*
	Main constructor
	*/
	var _this;
	var Constructor = function($parent, $form) {

		this.$parent = $parent;
		this.$form = $form;
		this.encounters = {};
		this.selectedID = 0;
		_this = this;
	}

	Constructor.prototype.addEncounter = function(id, displayID, bearGroupType, {onClick=()=>{}, data={}}={}) {
		this.encounters[id] = {...data};

		return $(`
			<li id="encounter-list-item-${id}" class="encounter-list-item" data-encounter-id="${id}" title="Form number: ${displayID}, Bear group: ${bearGroupType}">
				<label>
					<strong>Form number:</strong> ${displayID}, <strong>Bear group:</strong> ${bearGroupType}
				</label>
				<div class="encounter-list-edit-button-container">
					<button id="delete-button-${id}" class="encounter-list-edit-button icon-button delete-encounter-button" type="button" aria-label="Delete selected encounter" title="Delete encounter">
						<i class="fas fa-trash fa-lg"></i>
					</button>
					<button id="edit-button-${id}" class="encounter-list-edit-button icon-button toggle-editing-button" type="button" aria-label="Edit selected encounter" title="Edit encounter">
						<i class="fas fa-edit fa-lg"></i>
					</button>
					<button id="save-button-${id}" class="encounter-list-edit-button icon-button save-edits-button hidden" type="button" aria-label="Save edits" title="Save edits">
						<i class="fas fa-save fa-lg"></i>
					</button>
					<button id="permalink-button-${id}" class="encounter-list-edit-button icon-button encounter-permalink-button" type="button" aria-label="Copy permalink" title="Copy permalink" data-encounter-id="${id}">
						<i class="fas fa-link fa-lg"></i>
					</button>
				</div>
			</li>
		`).appendTo(this.$parent)
			.click(onClick)//.click(this.onResultItemClick)
	}

	return Constructor;
})();