
var BHIMSEncounterList = (function(){
	
	/*
	Main constructor
	*/
	var _this;
	var Constructor = function($ul, $form) {

		this.$ul = $ul;
		this.$form = $form;
		this.data = {};
		this.selectedID = 0;
		_this = this;
	}

	Constructor.prototype.addEncounter = function(id, displayID, bearGroupType, {onClick=()=>{}, data={}}={}) {
		this.data[id] = {...data};

		return $(`
			<li id="encounter-list-item-${id}" class="encounter-list-item" data-encounter-id="${id}" title="Form number: ${displayID}, Bear group: ${bearGroupType}">
				<label>
					<strong>Form number:</strong> ${displayID}, <strong>Bear group:</strong> ${bearGroupType}
				</label>
				<div class="offline-encounter-list-button-container">
					<i class="fas fa-check fa-2x processing-icon processing-icon-succeeded"></i>
					<i class="fas fa-spinner fa-2x processing-icon processing-icon-processing spin"></i>
					<i class="fas fa-times fa-2x processing-icon processing-icon-failed"></i>
				</div>
				<div class="encounter-list-edit-button-container hidden">
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
		`).appendTo(this.$ul)
			.click(onClick)//.click(this.onResultItemClick)
	}

	return Constructor;
})();