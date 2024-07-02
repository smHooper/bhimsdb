-- Create lookup tables
CREATE TABLE backcountry_unit_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, latitude NUMERIC(10, 7), longitude NUMERIC(10, 7));
CREATE TABLE bear_age_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE bear_cohort_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE bear_color_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE bear_injury_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE bear_initial_activity_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE bear_species_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE boolean_response_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(10) UNIQUE);
CREATE TABLE country_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(2) UNIQUE);
CREATE TABLE data_entry_status_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE data_quality_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE datum_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE daylight_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE, is_light BOOLEAN);
CREATE TABLE deterrent_type_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE development_type_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE duration_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE entry_status_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE file_type_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE, accepted_file_ext VARCHAR(255));
CREATE TABLE firearm_caliber_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE firearm_type_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE firearm_success_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE firearm_use_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE food_present_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE general_human_activity_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE habitat_type_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE hazing_action_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE human_group_type_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE human_injury_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE human_food_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE initial_bear_action_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE initial_human_activity_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE improper_reaction_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE location_accuracy_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE location_source_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE making_noise_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE management_classification_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE management_action_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE mapping_method_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE natural_food_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE nonlethal_round_type_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE observation_type_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE park_unit_codes (id SERIAL PRIMARY KEY, alpha_code CHAR(4) UNIQUE, name VARCHAR(50) UNIQUE);
CREATE TABLE people_present_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE place_name_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE, latitude NUMERIC(10, 7), longitude NUMERIC(10, 7));
CREATE TABLE preparedness_classification_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE probable_cause_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE reaction_by_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE reaction_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, action_by varchar(10) REFERENCES reaction_by_codes(code) ON DELETE CASCADE ON UPDATE CASCADE, name VARCHAR(50), unique(name, action_by));
CREATE TABLE relative_location_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE report_source_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE reported_probable_cause_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE residency_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE responsibility_classification_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE road_name_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE safety_info_source_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE sex_codes (id SERIAL PRIMARY KEY, code CHAR(1) UNIQUE, name VARCHAR(50) UNIQUE);
CREATE TABLE state_codes (id SERIAL PRIMARY KEY, code CHAR(2) UNIQUE, name VARCHAR(50) UNIQUE);
CREATE TABLE structure_interaction_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE structure_type_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);
CREATE TABLE visibility_codes (id SERIAL PRIMARY KEY, code INTEGER UNIQUE, name VARCHAR(50) UNIQUE, short_name CHAR(3) UNIQUE);

-- Create data tables
CREATE TABLE encounters (
    id SERIAL PRIMARY KEY, 
    start_date DATE,
    start_time TIME, 
    daylight_code INTEGER, 
    duration_minutes INTEGER, 
    duration_code INTEGER, 
    observation_type_code INTEGER, 
    people_present_code INTEGER, 
    bear_was_seen INTEGER REFERENCES boolean_response_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE, 
    received_safety_info INTEGER, 
    safety_info_source_code INTEGER, 
    group_type_code INTEGER, 
    group_size_encounter INTEGER, 
    group_size_total INTEGER, 
    general_activity_code INTEGER, 
    human_prior_activity_code INTEGER, 
    making_noise_code INTEGER, 
    bear_prior_activity INTEGER, 
    bear_cohort_code INTEGER, 
    initial_distance_m INTEGER, 
    closest_distance_m INTEGER, 
    bear_did_charge INTEGER  REFERENCES boolean_response_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE, 
    greatest_charge_disance_m INTEGER, 
    charge_count INTEGER, 
    firearm_was_present INTEGER REFERENCES boolean_response_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE, 
    bear_spray_was_present INTEGER  REFERENCES boolean_response_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE, 
    bear_spray_was_used INTEGER  REFERENCES boolean_response_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    bear_spray_was_effective INTEGER  REFERENCES boolean_response_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    bear_spray_distance_m INTEGER,
    reported_probable_cause_code INTEGER,
    food_present_code INTEGER,
    bear_obtained_food INTEGER REFERENCES boolean_response_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE, 
    consumed_food_description VARCHAR(255), 
    narrative TEXT, 
    bear_death_count INTEGER, 
    park_unit_code CHAR(4) DEFAULT 'DENA', 
    park_form_id VARCHAR(50), 
    report_source_code INTEGER, 
    received_by VARCHAR(50), 
    received_date DATE,
    received_time TIME, 
    record_type INTEGER, 
    entered_by VARCHAR(50), 
    datetime_entered TIMESTAMP, 
    last_edited_by VARCHAR(50), 
    datetime_last_edited TIMESTAMP, 
    incident_id VARCHAR(50)
);
CREATE TABLE structure_interactions (
    id SERIAL PRIMARY KEY, 
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE, 
    structure_type_code INTEGER, 
    structure_interaction_code INTEGER, 
    structure_description VARCHAR(255)
);
CREATE TABLE deterrents_used (
    id SERIAL PRIMARY KEY, 
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE, 
    deterrent_type_code INTEGER REFERENCES deterrent_type_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    times_deployed INTEGER, 
    altered_bear_behavior BOOLEAN
);  
CREATE TABLE property_damage (
    id SERIAL PRIMARY KEY, 
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE,
    quantity INTEGER, 
    property_description varchar(255), 
    property_value NUMERIC(11, 2), 
    damage_cost NUMERIC (11, 2), 
    was_in_persons_control INTEGER REFERENCES boolean_response_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE, 
    recovery_date DATE, recovered_value NUMERIC(11, 2),
    is_from_cir BOOLEAN
);
CREATE TABLE assessment (
    id SERIAL PRIMARY KEY, 
    entounter_id INTEGER REFERENCES encounters ON DELETE CASCADE, 
    probable_cause_code INTEGER,
    human_injury_code INTEGER,
    visibility_code INTEGER,
    management_classification_code INTEGER,
    responsibility_classification_code INTEGER,
    preparedness_classification_code INTEGER,
    reacted_improperly INTEGER REFERENCES boolean_response_codes (code) ON DELETE RESTRICT ON UPDATE CASCADE, 
    data_quality_code INTEGER, 
    entry_status_code INTEGER, 
    assessed_by VARCHAR(50), 
    comments TEXT
);
CREATE TABLE bears (
    id SERIAL,
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE, 
    bear_number INTEGER, 
    bear_species_code INTEGER, 
    bear_sex_code INTEGER, 
    bear_color_code INTEGER, 
    bear_age_code INTEGER, 
    bear_injury_code INTEGER, 
    bear_park_id VARCHAR(50), 
    bear_description varchar(255), 
    was_previously_encountered INTEGER REFERENCES boolean_response_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE, 
    PRIMARY KEY (encounter_id, bear_number)
);
CREATE TABLE reactions (
    id SERIAL,
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE, 
    reaction_order INTEGER, reaction_by_code INTEGER, 
    reaction_code INTEGER, 
    is_primary BOOLEAN,
    reaction_description VARCHAR(255),
    other_reaction VARCHAR(255),
    PRIMARY KEY (encounter_id, reaction_order)
);
CREATE TABLE encounter_locations (
    id SERIAL PRIMARY KEY, 
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE, 
    location_source_code INTEGER, 
    latitude NUMERIC(10, 7), 
    longitude NUMERIC(10, 7), 
    datum_code INTEGER, 
    place_name_code INTEGER, 
    backcountry_unit_code INTEGER, 
    road_name_code INTEGER,
    road_mile NUMERIC(4, 1), 
    location_description TEXT, 
    location_accuracy_code INTEGER, 
    mapping_method_code INTEGER,
    habitat_type_code INTEGER, 
    relative_location_code INTEGER, 
    habitat_description VARCHAR(255), 
    visibility_code INTEGER, 
    visibility_distance_m INTEGER, 
    visibility_description VARCHAR(255)
);
CREATE TABLE attachments (
    id SERIAL PRIMARY KEY, 
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE, 
    file_type_code INTEGER REFERENCES file_type_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE, 
    mime_type varchar(50),
    file_path VARCHAR(255), 
    client_filename VARCHAR(255),
    file_size_kb INTEGER,  
    file_description TEXT, 
    datetime_attached TIMESTAMP, 
    attached_by VARCHAR(50), 
    datetime_last_changed TIMESTAMP, 
    last_changed_by VARCHAR(50)
);
CREATE TABLE people (
    id SERIAL PRIMARY KEY, 
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE, 
    is_primary_person INTEGER REFERENCES boolean_response_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    first_name VARCHAR(50), 
    last_name VARCHAR(50), 
    address_1 VARCHAR(255), 
    address_2 VARCHAR(255), 
    city VARCHAR(255), 
    state_code INTEGER,
    country_code INTEGER,
    zip_code VARCHAR(25), 
    phone_number VARCHAR(25), 
    email_address VARCHAR(50), 
    residency_code INTEGER, 
    sex_code INTEGER REFERENCES sex_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    is_from_cir BOOLEAN --akro DB has tblCIRPerson and tblPerson, not sure if it matters to keep track of where the data came from
);
CREATE TABLE firearms (
    id SERIAL PRIMARY KEY,
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE,
    firearm_caliber_code INTEGER REFERENCES firearm_caliber_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    firearm_type_code INTEGER REFERENCES firearm_type_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    firearm_manufacturer VARCHAR(50),
    nonlethal_round_type_code INTEGER REFERENCES nonlethal_round_type_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    firearm_success_code INTEGER REFERENCES firearm_success_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    firearm_use_code INTEGER REFERENCES firearm_use_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    shots_fired_count INTEGER,
    display_order INTEGER,
    UNIQUE(encounter_id, display_order)
);
CREATE TABLE improper_reactions (
    id SERIAL PRIMARY KEY,
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE,
    improper_reaction_code INTEGER REFERENCES improper_reaction_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    other_improper_reaction_description VARCHAR(255),
    display_order INTEGER,
    UNIQUE(encounter_id, display_order)
);
-- AKRO DB 'xref' tables
CREATE TABLE habitat_types (
    id SERIAL PRIMARY KEY,
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE,
    habitat_type_code INTEGER REFERENCES habitat_type_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    other_habitat_type_descriotion VARCHAR(255),
    display_order INTEGER,
    UNIQUE(encounter_id, display_order)
);
CREATE TABLE human_foods_present (
    id SERIAL PRIMARY KEY,
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE,
    human_food_code INTEGER REFERENCES human_food_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    other_human_food_descriotion VARCHAR(255),
    display_order INTEGER,
    UNIQUE(encounter_id, display_order)
);
CREATE TABLE natural_foods_present (
    id SERIAL PRIMARY KEY,
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE,
    natural_food_code INTEGER REFERENCES natural_food_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    other_natural_food_descriotion VARCHAR(255),
    display_order INTEGER,
    UNIQUE(encounter_id, display_order)
);
CREATE TABLE hazing_actions (
    id SERIAL PRIMARY KEY,
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE,
    hazing_action_code INTEGER REFERENCES hazing_action_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    other_hazing_action_descriotion VARCHAR(255),
    display_order INTEGER,
    UNIQUE(encounter_id, display_order)
);
CREATE TABLE development_types (
    id SERIAL PRIMARY KEY,
    encounter_id INTEGER REFERENCES encounters ON DELETE CASCADE,
    development_type_code INTEGER REFERENCES development_type_codes(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    other_development_type_descriotion VARCHAR(255),
    display_order INTEGER,
    UNIQUE(encounter_id, display_order)
);

--UI meta tables
CREATE TABLE data_entry_pages (
    id SERIAL PRIMARY KEY,
    page_name VARCHAR(50) UNIQUE,
    page_index INTEGER,
    css_class VARCHAR(50) DEFAULT 'form-page'
);
CREATE TABLE data_entry_sections (
    id SERIAL PRIMARY KEY,
    section_title VARCHAR(50) UNIQUE,
    title_css_class VARCHAR(100),
    title_html_tag VARCHAR(25),
    page_id INTEGER REFERENCES data_entry_pages(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    display_order INTEGER,
    css_class VARCHAR(50) DEFAULT 'form-section',
    is_enabled BOOLEAN
);
CREATE TABLE data_entry_accordions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50),
    display_name VARCHAR(50),
    display_order INTEGER,
    html_id VARCHAR(50),
    css_class VARCHAR(50) DEFAULT 'accordion form-item-list',
    section_id INTEGER REFERENCES data_entry_sections(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    table_name VARCHAR(50),
    card_link_label_text VARCHAR(50),
    card_link_label_css_class VARCHAR(100) DEFAULT 'card-link-label',
    card_link_label_order_column VARCHAR(50),
    card_link_label_separator VARCHAR(25),
    item_name VARCHAR(50),
    dependent_target VARCHAR(50),
    dependent_value VARCHAR(50),
    add_button_label VARCHAR(50),
    is_enabled BOOLEAN
);
CREATE TABLE data_entry_field_containers (
    id SERIAL PRIMARY KEY,
    display_order INTEGER,
    css_class VARCHAR(50),
    section_id INTEGER REFERENCES data_entry_sections(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    accordion_id INTEGER REFERENCES data_entry_accordions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    is_enabled BOOLEAN,
    description VARCHAR(255)
);
CREATE DOMAIN html_input_type AS VARCHAR(25) CHECK (
    VALUE IN (
        'select', 
        'textarea',
        'text', 
        'checkbox', 
        'tel', 
        'email', 
        'number', 
        'date', 
        'time', 
        'datetime-local',
        'file'
    )
);
CREATE TABLE data_entry_fields (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50),
    field_name VARCHAR(50),
    html_input_type html_input_type,
    css_class VARCHAR(100),
    display_name VARCHAR(50),
    display_order INTEGER,
    html_id VARCHAR(50) UNIQUE,
    placeholder VARCHAR(100),
    label_text VARCHAR(100),
    required BOOLEAN DEFAULT true,
    dependent_target VARCHAR(50),
    dependent_value VARCHAR(50),
    default_value VARCHAR(50),
    lookup_table VARCHAR(50),
    parent_css_class VARCHAR(50) DEFAULT 'field-container',
    field_container_id INTEGER REFERENCES data_entry_field_containers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    on_change VARCHAR(100),
    card_label_index INTEGER,
    calculation_target VARCHAR(50),
    html_min INTEGER,
    html_max INTEGER,
    html_step REAL,
    max_length INTEGER,
    is_enabled BOOLEAN,
    description VARCHAR(255),
    UNIQUE(field_name, table_name)
);

CREATE TABLE config (
    id SERIAL PRIMARY KEY, 
    value TEXT, 
    property VARCHAR(255), 
    data_type VARCHAR(50), 
    display_name VARCHAR(255), 
    sort_order INTEGER, 
    is_editable BOOL
);

CREATE TABLE user_role_codes (
    id SERIAL PRIMARY KEY,
    code INTEGER UNIQUE,
    name VARCHAR(50) UNIQUE
);
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    ad_username varchar(50),
    role INTEGER REFERENCES user_role_codes(code) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- create a view to get meta table information 
--  for creating exports from the query page
--  of the web app
CREATE VIEW export_code_value_map_view AS 
    SELECT 
        table_name,
        field_name, 
        lookup_table,
        table_name || '.' || field_name AS coded_value, 
        replace(field_name, '_code', '') AS readable_value 
    FROM data_entry_fields 
    WHERE 
        lookup_table IS NOT NULL AND 
        coalesce(table_name, '') <> '' AND 
        is_enabled;

-- Only necessary because value columns were initially varchar(3)
-- DO $$
-- DECLARE
--     tables CURSOR FOR
--         SELECT DISTINCT table_name
--         FROM information_schema.columns
--         WHERE table_schema='public' AND table_name LIKE '%_codes' AND column_name='value'
--         ORDER BY table_name;
--     nbRow int;
-- BEGIN
--     FOR table_record IN tables LOOP
--         EXECUTE 'ALTER TABLE ' || table_record.table_name || ' ALTER COLUMN value SET DATA TYPE varchar(50)';
--     END LOOP;
-- END$$;


-- Fill lookup tables
INSERT INTO backcountry_unit_codes (short_name, name) VALUES (1, '1-Triple Lakes'), (2, '2-Riley Creek'), (3, '3-Jenny Creek'), (4, '4-Upper Savage'), (5, '5-Upper Sanctuary'), (6, '6-Upper Teklanika'), (7, '7-Upper East Fork'), (8, '8-Polychrome Glaciers'), (9, '9-East Branch Upper Toklat'), (10, '10-West Branch Upper Toklat'), (11, '11-Stony Dome'), (12, '12-Sunset/Sunrise Glaciers'), (13, '13-Mount Eielson'), (14, '14-McKinley Bar East'), (15, '15-McKinley Bar West'), (16, '16-Windy Creek'), (17, '17-Foggy And Easy Pass'), (18, '18-Upper Glacier Creek'), (19, '19-Pirate Creek'), (20, '20-McGonagall Pass'), (21, '21-Muddy River'), (22, '22-Upper Foraker'), (23, '23-West Fork Glacier'), (24, '24-Mount Healy'), (25, '25-Healy Ridge'), (26, '26-Primrose Ridge'), (27, '27-Mount Wright'), (28, '28-Sushana River'), (29, '29-Igloo Mountain'), (30, '30-Tributary Creek'), (31, '31-Polychrome Mountain'), (32, '32-Middle Toklat'), (33, '33-Stony Hill'), (34, '34-Mount Galen'), (35, '35-Moose Creek'), (36, '36-Jumbo Creek'), (37, '37-Lower East Fork'), (38, '38-Lower Toklat'), (39, '39-Stony Creek'), (40, '40-Clearwater Fork'), (41, '41-Spruce Peak'), (42, '42-Eureka Creek'), (43, '43-Eldorado Creek'), (44, '44-Peters Glacier'), (45, '45-Mount McKinley'), (46, '46-Upper Kahiltna'), (47, '47-Mount Foraker'), (48, '48-Herron Glacier'), (61, '61-Stampede'), (62, '62-Southeast Stampede'), (63, '63-Southwest Stampede'), (64, '64-Kantishna Hills'), (65, '65-Moose-McKinley'), (66, '66-McKinley-Birch'), (67, '67-Birch-Foraker Preserve'), (68, '68-Herron-Highpower Preserve'), (69, '69-Swift Fork'), (70, '70-Bull River'), (71, '71-Ohio Creek'), (72, '72-Eldridge Glacier'), (73, '73-Buckskin Glacier'), (74, '74-Upper Ruth'), (75, '75-Lower Ruth'), (76, '76-Mount Hunter'), (77, '77-Tokositna Glacier'), (78, '78-Middle Kahiltna'), (79, '79-Little Switzerland'), (80, '80-Upper Yentna-Lacuna'), (81, '81-Lower Kahiltna'), (82, '82-Dall-Yentna Preserve'), (83, '83-Yentna River Preserve'), (84, '84-Mount Dall Preserve'), (85, '85-Kitchatna Preserve'), (86, '86-Mount Mather'), (87, '87-Mount Brooks');
INSERT INTO bear_color_codes (short_name, name) VALUES ('BLD', 'Blonde'), ('LBR', 'Light brown'), ('DBR', 'Dark brown'), ('BLK', 'Black');
INSERT INTO bear_injury_codes (short_name, name) VALUES ('UNK', 'Unknown'), ('NON', 'No injury reported'), ('MLD', 'Mildly wounded'), ('SVR', 'Severely wounded, likely to die from injuries'), ('DEC', 'Died as a result of encounter'), ('DMG', 'Died due to management action against bear'), ('DPL', 'Subsequent management plan to destroy bear');
INSERT INTO bear_age_codes (short_name, name) VALUES ('SPR', 'Spring cub'), ('YRL', 'Yearling'), ('SUB', 'Sub-adult'), ('ADU', 'Adult'), ('UNK', 'Unknown');
INSERT INTO bear_species_codes (short_name, name) VALUES ('GRZ', 'Grizzly'), ('BLK', 'Black'), ('UNK', 'Unknown');
INSERT INTO bear_cohort_codes (short_name, name) VALUES ('SGL', 'Single bear'), ('1CB', 'Bear with 1 cub'), ('2CB', 'Bear with 2 cubs'), ('3CB', 'Bear with 3 cubs'), ('2AD', 'Pair of adult bears'), ('OTH', 'Other'), ('UNK', 'Unknown');
INSERT INTO behavior_classification_codes (short_name, name) VALUES ('INT', 'Intolerant'), ('CUR', 'Curious'), ('MIS', 'Mistaken prey'), ('DOM', 'Dominance'), ('SUR', 'Surprise'), ('PRV', 'Provoked'), ('TOL', 'Tolerant'), ('CON', 'Conditioned'), ('RWD', 'Rewarded'), ('THR', 'Threat'), ('PRD', 'Predation'), ('IND', 'Indeterminate');
INSERT INTO boolean_response_codes (short_name, name) VALUES (0, 'No'), (1, 'Yes'), (-1, 'Unknown');
INSERT INTO country_codes (short_name, name) VALUES ('AF', 'Afghanistan'), ('AX', 'Aland Islands'), ('AL', 'Albania'), ('DZ', 'Algeria'), ('AS', 'American Samoa'), ('AD', 'Andorra'), ('AO', 'Angola'), ('AI', 'Anguilla'), ('AQ', 'Antarctica'), ('AG', 'Antigua and Barbuda'), ('AR', 'Argentina'), ('AM', 'Armenia'), ('AW', 'Aruba'), ('AU', 'Australia'), ('AT', 'Austria'), ('AZ', 'Azerbaijan'), ('BS', 'Bahamas'), ('BH', 'Bahrain'), ('BD', 'Bangladesh'), ('BB', 'Barbados'), ('BY', 'Belarus'), ('BE', 'Belgium'), ('BZ', 'Belize'), ('BJ', 'Benin'), ('BM', 'Bermuda'), ('BT', 'Bhutan'), ('BO', 'Bolivia, Plurinational State of'), ('BQ', 'Bonaire, Sint Eustatius and Saba'), ('BA', 'Bosnia and Herzegovina'), ('BW', 'Botswana'), ('BV', 'Bouvet Island'), ('BR', 'Brazil'), ('IO', 'British Indian Ocean Territory'), ('BN', 'Brunei Darussalam'), ('BG', 'Bulgaria'), ('BF', 'Burkina Faso'), ('BI', 'Burundi'), ('KH', 'Cambodia'), ('CM', 'Cameroon'), ('CA', 'Canada'), ('CV', 'Cape Verde'), ('KY', 'Cayman Islands'), ('CF', 'Central African Republic'), ('TD', 'Chad'), ('CL', 'Chile'), ('CN', 'China'), ('CX', 'Christmas Island'), ('CC', 'Cocos (Keeling) Islands'), ('CO', 'Colombia'), ('KM', 'Comoros'), ('CG', 'Congo'), ('CD', 'Congo, the Democratic Republic of the'), ('CK', 'Cook Islands'), ('CR', 'Costa Rica'), ('CI', 'Cote d''Ivoire'), ('HR', 'Croatia'), ('CU', 'Cuba'), ('CW', 'Curacao'), ('CY', 'Cyprus'), ('CZ', 'Czech Republic'), ('DK', 'Denmark'), ('DJ', 'Djibouti'), ('DM', 'Dominica'), ('DO', 'Dominican Republic'), ('EC', 'Ecuador'), ('EG', 'Egypt'), ('SV', 'El Salvador'), ('GQ', 'Equatorial Guinea'), ('ER', 'Eritrea'), ('EE', 'Estonia'), ('ET', 'Ethiopia'), ('FK', 'Falkland Islands (Malvinas)'), ('FO', 'Faroe Islands'), ('FJ', 'Fiji'), ('FI', 'Finland'), ('FR', 'France'), ('GF', 'French Guiana'), ('PF', 'French Polynesia'), ('TF', 'French Southern Territories'), ('GA', 'Gabon'), ('GM', 'Gambia'), ('GE', 'Georgia'), ('DE', 'Germany'), ('GH', 'Ghana'), ('GI', 'Gibraltar'), ('GR', 'Greece'), ('GL', 'Greenland'), ('GD', 'Grenada'), ('GP', 'Guadeloupe'), ('GU', 'Guam'), ('GT', 'Guatemala'), ('GG', 'Guernsey'), ('GN', 'Guinea'), ('GW', 'Guinea-Bissau'), ('GY', 'Guyana'), ('HT', 'Haiti'), ('HM', 'Heard Island and McDonald Islands'), ('VA', 'Holy See (Vatican City State)'), ('HN', 'Honduras'), ('HK', 'Hong Kong'), ('HU', 'Hungary'), ('IS', 'Iceland'), ('IN', 'India'), ('ID', 'Indonesia'), ('IR', 'Iran, Islamic Republic of'), ('IQ', 'Iraq'), ('IE', 'Ireland'), ('IM', 'Isle of Man'), ('IL', 'Israel'), ('IT', 'Italy'), ('JM', 'Jamaica'), ('JP', 'Japan'), ('JE', 'Jersey'), ('JO', 'Jordan'), ('KZ', 'Kazakhstan'), ('KE', 'Kenya'), ('KI', 'Kiribati'), ('KP', 'Korea, Democratic People''s Republic of'), ('KR', 'Korea, Republic of'), ('KW', 'Kuwait'), ('KG', 'Kyrgyzstan'), ('LA', 'Lao People''s Democratic Republic'), ('LV', 'Latvia'), ('LB', 'Lebanon'), ('LS', 'Lesotho'), ('LR', 'Liberia'), ('LY', 'Libya'), ('LI', 'Liechtenstein'), ('LT', 'Lithuania'), ('LU', 'Luxembourg'), ('MO', 'Macao'), ('MK', 'Macedonia, the former Yugoslav Republic of'), ('MG', 'Madagascar'), ('MW', 'Malawi'), ('MY', 'Malaysia'), ('MV', 'Maldives'), ('ML', 'Mali'), ('MT', 'Malta'), ('MH', 'Marshall Islands'), ('MQ', 'Martinique'), ('MR', 'Mauritania'), ('MU', 'Mauritius'), ('YT', 'Mayotte'), ('MX', 'Mexico'), ('FM', 'Micronesia, Federated States of'), ('MD', 'Moldova, Republic of'), ('MC', 'Monaco'), ('MN', 'Mongolia'), ('ME', 'Montenegro'), ('MS', 'Montserrat'), ('MA', 'Morocco'), ('MZ', 'Mozambique'), ('MM', 'Myanmar'), ('NA', 'Namibia'), ('NR', 'Nauru'), ('NP', 'Nepal'), ('NL', 'Netherlands'), 
('NC', 'New Caledonia'), ('NZ', 'New Zealand'), ('NI', 'Nicaragua'), ('NE', 'Niger'), ('NG', 'Nigeria'), ('NU', 'Niue'), ('NF', 'Norfolk Island'), ('MP', 'Northern Mariana Islands'), ('NO', 'Norway'), ('OM', 'Oman'), ('PK', 'Pakistan'), ('PW', 'Palau'), ('PS', 'Palestinian Territory, Occupied'), ('PA', 'Panama'), ('PG', 'Papua New Guinea'), ('PY', 'Paraguay'), ('PE', 'Peru'), ('PH', 'Philippines'), ('PN', 'Pitcairn'), ('PL', 'Poland'), ('PT', 'Portugal'), ('PR', 'Puerto Rico'), ('QA', 'Qatar'), ('RE', 'Reunion'), ('RO', 'Romania'), ('RU', 'Russian Federation'), ('RW', 'Rwanda'), ('BL', 'Saint Barthelemy'), ('SH', 'Saint Helena, Ascension and Tristan da Cunha'), ('KN', 'Saint Kitts and Nevis'), ('LC', 'Saint Lucia'), ('MF', 'Saint Martin (French part)'), ('PM', 'Saint Pierre and Miquelon'), ('VC', 'Saint Vincent and the Grenadines'), ('WS', 'Samoa'), ('SM', 'San Marino'), ('ST', 'Sao Tome and Principe'), ('SA', 'Saudi Arabia'), ('SN', 'Senegal'), ('RS', 'Serbia'), ('SC', 'Seychelles'), ('SL', 'Sierra Leone'), ('SG', 'Singapore'), ('SX', 'Sint Maarten (Dutch part)'), ('SK', 'Slovakia'), ('SI', 'Slovenia'), ('SB', 'Solomon Islands'), ('SO', 'Somalia'), ('ZA', 'South Africa'), ('GS', 'South Georgia and the South Sandwich Islands'), ('SS', 'South Sudan'), ('ES', 'Spain'), ('LK', 'Sri Lanka'), ('SD', 'Sudan'), ('SR', 'Suriname'), ('SJ', 'Svalbard and Jan Mayen'), ('SZ', 'Swaziland'), ('SE', 'Sweden'), ('CH', 'Switzerland'), ('SY', 'Syrian Arab Republic'), ('TW', 'Taiwan, Province of China'), ('TJ', 'Tajikistan'), ('TZ', 'Tanzania, United Republic of'), ('TH', 'Thailand'), ('TL', 'Timor-Leste'), ('TG', 'Togo'), ('TK', 'Tokelau'), ('TO', 'Tonga'), ('TT', 'Trinidad and Tobago'), ('TN', 'Tunisia'), ('TR', 'Turkey'), ('TM', 'Turkmenistan'), ('TC', 'Turks and Caicos Islands'), ('TV', 'Tuvalu'), ('UG', 'Uganda'), ('UA', 'Ukraine'), ('AE', 'United Arab Emirates'), ('GB', 'United Kingdom'), ('US', 'United States'), ('UM', 'United States Minor Outlying Islands'), ('UY', 'Uruguay'), ('UZ', 'Uzbekistan'), ('VU', 'Vanuatu'), ('VE', 'Venezuela, Bolivarian Republic of'), ('VN', 'Viet Nam'), ('VG', 'Virgin Islands, British'), ('VI', 'Virgin Islands, U.S.'), ('WF', 'Wallis and Futuna'), ('EH', 'Western Sahara'), ('YE', 'Yemen'), ('ZM', 'Zambia'), ('ZW', 'Zimbabwe');
INSERT INTO data_quality_codes (short_name, name) VALUES ('LOW', 'Low'), ('MED', 'Medium'), ('HIH', 'High');
INSERT INTO data_entry_status_codes (short_name, name) VALUES ('INC', 'Incomplete'), ('NOA', 'Complete entry, no analysis'), ('PAR', 'Partial analysis'), ('COM', 'Complete analysis');
INSERT INTO datum_codes (short_name, name) VALUES ('WGS', 'WGS84'), ('N83', 'NAD83');
INSERT INTO daylight_codes (code, name, is_light) VALUES ('MND', 'Morning (dark)', false), ('MNL', 'Morning (light)', true), ('AFT', 'Afternoon', true), ('EVL', 'Evening, light', true), ('EVD', 'Evening, dark', false), ('NIT', 'Night', false), ('LIT', 'During daylight, no specific time', true), ('DRK', 'During night, no specific time', false), ('VAR', 'Various times', null), ('UNK', 'Unknown', null);
INSERT INTO deterrent_type_codes (short_name, name) VALUES ('SPR', 'Pepper spray'), ('AIR', 'Airhorn'), ('OTH', 'Other');
INSERT INTO duration_codes (short_name, name) VALUES ('1MN', 'Less than 1 minute'), ('3MN', '1-3 minutes'), ('10M', '3-10 minutes'), ('30M', '10-30 minutes'), ('60M', '30-60 minutes'), ('HRS', 'More than 1 hour'), ('NUM', 'Numerous related incidents'), ('MUL', 'Multiple unrelated incidents');
INSERT INTO file_type_codes (code, name, accepted_file_ext) VALUES 
    ('IMG', 'Image', '.bmp, .gif, .jpg, .jpeg, .jfif, .pjpeg, .pjp, .png, .tif, .tiff'), 
    ('VID', 'Video', '.3g2, .3gp, .amv, .asf, .avi, .flv, .gif, .m4v, .mkv, .mov, .qt, .mp4, .m4p, .mpg, .mp2, .mpeg, .mpe, .mpv, .m2v, .mts, .m2ts, .ts, .ogg, .ogv, .svi, .webm, .wmv'), 
    ('AUD', 'Audio', '.3gp, .act, .aiff, .alac, .amr, .ape, .au, .awb, .dct, .dvf, .flac, .gsm, .m4a, .mp3, .mpc, .msv, .ogg, .oga, .mogg, .opus, .ra, .rm, .rf46, .tta, .voc, .vox, .wav, .wma, .wv, .webm');

INSERT INTO food_present_codes (short_name, name) VALUES ('INS', 'Food inside BRFC'), ('OUT', 'Food outside BRFC'), ('NON', 'No food present'), ('ODR', 'Food odor only'), ('HNG', 'Food hung in tree'), ('UNK', 'Unknown');
INSERT INTO general_human_activity_codes (short_name, name) VALUES ('BCC', 'Backcountry camping (overnight)'), ('DAY', 'Day-hiking in backcountry'), ('WLK', 'Walking on road'), ('TRL', 'Hiking on maintained trail'), ('DRV', 'Driving on road'), ('CMP', 'Camping in developed campground'), ('BIK', 'Biking'), ('OTH', 'Other'), ('UNK', 'Unknown');
INSERT INTO human_group_type_codes (short_name, name) VALUES ('VIS', 'Park visitor'), ('CON', 'Concession employee'), ('NPS', 'NPS employee'), ('PHO', 'Professional photographer'), ('OUT', 'Outside researcher/contractor'), ('KAN', 'Kantishna resident/employee'), ('OTH', 'Other'), ('UNK', 'Unknown');
INSERT INTO habitat_type_codes (short_name, name) VALUES ('TUN', 'Open tundra'), ('FOR', 'Forest'), ('GVL', 'Gravel river bar'), ('HBR', 'High brush (taller than 3 ft or 1 m)'), ('LBR', 'Low brush (shorter than 3 ft or 1 m)'), ('ROA', 'Road'), ('OTH', 'Other'), ('UNK', 'Unknown');
INSERT INTO initial_human_activity_codes (short_name, name) VALUES ('SLP', 'Sleeping'), ('EAT', 'Eating/cooking'), ('HIK', 'Hiking'), ('RUN', 'Running'), ('SIT', 'Sitting'), ('TVL', 'Traveling on the Park Road'), ('CMP', 'Setting up/breaking camp'), ('OTH', 'Other'), ('UNK', 'Unknown');
INSERT INTO initial_bear_action_codes (short_name, name) VALUES ('VEG', 'Feeding on vegetation'), ('CRC', 'Feeding on carcass'), ('HUN', 'Hunting'), ('DIG', 'Digging'), ('STD', 'Standing'), ('RST', 'Resting'), ('BRD', 'Breeding'), ('WLK', 'Walking toward people'), ('RTW', 'Running toward people'), ('RAW', 'Running away from people'), ('TRV', 'Traveling'), ('PLA', 'Playing'), ('INV', 'Investigating'), ('OTH', 'Other'), ('UNK', 'Unknown');
INSERT INTO location_source_codes (short_name, name) VALUES ('MAP', 'Selected point from a paper map'), ('WEB', 'Selected point on web map'), ('KNW', 'Known location'), ('GPS', 'GPS point'), ('NON', 'No location given'), ('UNK', 'Unknown');
INSERT INTO management_classification_codes (short_name, name) VALUES ('OBS', 'Observation'), ('ENC', 'Encounter'), ('GEN', 'Incident; general'), ('FOO', 'Incident; gets food'), ('PRP', 'Incident; property damange'), ('INJ', 'Incident; injury');
INSERT INTO management_action_codes (short_name, name) VALUES ('NON', 'None'), ('HAZ', 'Hazing'), ('AVR', 'Aversive conditioning'), ('REL', 'Relocation'), ('REM', 'Removal'), ('DES', 'Destruction');
INSERT INTO mapping_method_codes (code, name, short_name) VALUES (1, 'GPS', 'GPS'), (2, 'Marked on digital map', 'DIG'), (3, 'Marked on paper map', 'PAP'), (4, 'From selected location', 'LOC'), (-1, 'Unknown', 'UNK'), (-2, 'Other', 'OTH');
INSERT INTO observation_type_codes (short_name, name) VALUES ('OBS', 'Observation/Sighting'), ('ENC', 'Encounter'), ('TRK', 'Track'), ('DEN', 'Den site'), ('OTH', 'Other');
INSERT INTO reaction_by_codes (short_name, name) VALUES ('BER', 'Bear'), ('HUM', 'Person'), ('DOG', 'Dog'), ('STK', 'Stock animal'), ('OTH', 'Other');
INSERT INTO reaction_codes (name, action_by) VALUES 
    ('Walked/backed away', 'HUM'), ('Ran away', 'HUM'), ('Remained still/silent', 'HUM'), ('Continued hiking in same direction', 'HUM'), ('Used bear spray', 'HUM'), ('Stood ground and made noise', 'HUM'), ('Threw something at bear', 'HUM'), ('Photographed bear', 'HUM'), ('Abandonded property', 'HUM'), ('Other', 'HUM'), ('Unknown', 'HUM'),
    ('Not aware of people', 'BER'), ('Stood on hind legs', 'BER'), ('Growled/woofed/made noise', 'BER'), ('Walked away', 'BER'), ('Ran away', 'BER'), ('Walked toward people', 'BER'), ('Ran toward people', 'BER'), ('Remained in area, ignoring people', 'BER'), ('Watched people', 'BER'), ('Circled people', 'BER'), ('Bluff charged', 'BER'), ('Made contact with person', 'BER'), ('Investigated equipment/property', 'BER'), ('Other', 'BER'), ('Unknown', 'BER'),
    ('Not aware of bear', 'DOG'), ('Barked at bear', 'DOG'), ('Chased bear', 'DOG'), ('Bit bear', 'DOG'), ('Other', 'DOG'), ('Unknown', 'DOG');
UPDATE reaction_codes SET code=id WHERE action_by='HUM';
UPDATE reaction_codes SET code=id + 88 WHERE action_by='BER';
UPDATE reaction_codes SET code=id + 173 WHERE action_by='DOG';
UPDATE reaction_codes SET code=-1 WHERE name='Unknown' AND action_by='HUM';
UPDATE reaction_codes SET code=-100 WHERE name='Unknown' AND action_by='BER';
UPDATE reaction_codes SET code=-200 WHERE name='Unknown' AND action_by='DOG';

INSERT INTO relative_location_codes (short_name, name) VALUES ('300', 'Off trail (300 feet or more)'), ('BCT', 'On or near backcountry trail'), ('FCT', 'On or near heavy use trail'), ('ICM', 'In illegal backcountry camp'), ('BCL', 'In lake backcountry campsite'), ('BCC', 'In creek backcountry campsite'), ('BCO', 'In other backcountry campsite'), ('CHA', 'Near Chalet or Cabin'), ('ROA', 'On or along road'), ('LOT', 'On or near parking lot'), ('FCC', 'In frontcountry campground or picnic'), ('BUS', 'Near business'), ('RES', 'In residential area'), ('OUT', 'Outside of Park boundary'), ('OTH', 'Other'), ('UNK', 'Unknown');
INSERT INTO reported_probable_cause_codes (short_name, name) VALUES ('SUR', 'Surprised bear'), ('CUR', 'Curious bear'), ('TOL', 'Bear tolerant of people'), ('TVL', 'In bear''s path of travel'), ('OTH', 'Other'), ('UNK', 'Unknown');
INSERT INTO residency_codes (short_name, name) VALUES ('LCL', 'Local'), ('VIS', 'Visitor'), ('UNK', 'Unknown');
INSERT INTO road_name_codes (short_name, name) VALUES ('PRK', 'Park Road'), ('HWY', 'Parks Highway');
INSERT INTO safety_info_source_codes (short_name, name) VALUES ('INT', 'Inteprative program'), ('BAC', 'Backcountry orientation'), ('RNG', 'Park ranger'), ('PUB', 'Park publication'), ('SGN', 'Warning sign'), ('PRE', 'Previous knowledge'), ('OTH', 'Other'), ('UNK', 'Unknown');
INSERT INTO sex_codes (short_name, name) VALUES ('F', 'Female'), ('M', 'Male'), ('U', 'Unknown');
INSERT INTO state_codes (short_name, name) VALUES ('DC','District of Columbia'), ('AL','Alabama'), ('AB', 'Alberta'), ('AK','Alaska'), ('AZ','Arizona'), ('AR','Arkansas'), ('BC', 'British Columbia'), ('CA','California'), ('CO','Colorado'), ('CT','Connecticut'), ('DE','Delaware'), ('FL','Florida'), ('GA','Georgia'), ('HI','Hawaii'), ('ID','Idaho'), ('IL','Illinois'), ('IN','Indiana'), ('IA','Iowa'), ('KS','Kansas'), ('KY','Kentucky'), ('LA','Louisiana'), ('ME','Maine'), ('MB', 'Manitoba'), ('MD','Maryland'), ('MA','Massachusetts'), ('MI','Michigan'), ('MN','Minnesota'), ('MS','Mississippi'), ('MO','Missouri'), ('MT','Montana'), ('NE','Nebraska'), ('NV','Nevada'), ('NB', 'New Brunswick'), ('NL', 'Newfoundland and Labrador'), ('NH','New Hampshire'), ('NJ','New Jersey'), ('NM','New Mexico'), ('NY','New York'), ('NC','North Carolina'), ('ND','North Dakota'), ('NT', 'Northwest Territories'), ('NS', 'Nova Scotia'), ('NU', 'Nunavut'), ('OH','Ohio'), ('ON', 'Ontario'), ('OK','Oklahoma'), ('OR','Oregon'), ('PA','Pennsylvania'), ('PE', 'Prince Edward Island'), ('QC', 'Québec'), ('RI','Rhode Island'), ('SK', 'Saskatchewan'), ('SC','South Carolina'), ('SD','South Dakota'), ('TN','Tennessee'), ('TX','Texas'), ('UT','Utah'), ('VT','Vermont'), ('VA','Virginia'), ('WA','Washington'), ('WV','West Virginia'), ('WI','Wisconsin'), ('WY','Wyoming'), ('YT', 'Yukon Territory');
--INSERT INTO state_codes (code,name) VALUES ('DC','District of Columbia'), ('AL','Alabama'), ('AK','Alaska'), ('AZ','Arizona'), ('AR','Arkansas'), ('CA','California'), ('CO','Colorado'), ('CT','Connecticut'), ('DE','Delaware'), ('FL','Florida'), ('GA','Georgia'), ('HI','Hawaii'), ('ID','Idaho'), ('IL','Illinois'), ('IN','Indiana'), ('IA','Iowa'), ('KS','Kansas'), ('KY','Kentucky'), ('LA','Louisiana'), ('ME','Maine'), ('MD','Maryland'), ('MA','Massachusetts'), ('MI','Michigan'), ('MN','Minnesota'), ('MS','Mississippi'), ('MO','Missouri'), ('MT','Montana'), ('NE','Nebraska'), ('NV','Nevada'), ('NH','New Hampshire'), ('NJ','New Jersey'), ('NM','New Mexico'), ('NY','New York'), ('NC','North Carolina'), ('ND','North Dakota'), ('OH','Ohio'), ('OK','Oklahoma'), ('OR','Oregon'), ('PA','Pennsylvania'), ('RI','Rhode Island'), ('SC','South Carolina'), ('SD','South Dakota'), ('TN','Tennessee'), ('TX','Texas'), ('UT','Utah'), ('VT','Vermont'), ('VA','Virginia'), ('WA','Washington'), ('WV','West Virginia'), ('WI','Wisconsin'), ('WY','Wyoming'), 
--('AB', 'Alberta'), ('BC', 'British Columbia'), ('MB', 'Manitoba'), ('NB', 'New Brunswick'), ('NL', 'Newfoundland and Labrador'), ('NT', 'Northwest Territories'), ('NS', 'Nova Scotia'), ('NU', 'Nunavut'), ('ON', 'Ontario'), ('PE', 'Prince Edward Island'), ('QC', 'Québec'), ('SK', 'Saskatchewan'), ('YT', 'Yukon Territory');
INSERT INTO structure_interaction_codes (short_name, name) VALUES ('OUT', 'Did not touch structure but was outside it'), ('TCH', 'Touched structure only'), ('ATT', 'Attempted entry'), ('ENT', 'Entered structure'), ('UNK', 'Unknown'); 
INSERT INTO structure_type_codes (short_name, name) VALUES ('TNT', 'Tent'), ('BLD', 'Cabin or other building'), ('CAR', 'Automobile, RV, or camper'), ('RFT', 'Raft, kayak, or boat'), ('AIR', 'Airplane'), ('FOO', 'Food cache'), ('OTH', 'Other'), ('UNK', 'Unknown');
--INSERT INTO field_meta (table_name, field_name, display_name) SELECT table_name, column_name AS field_name, column_name AS display_name FROM information_schema.columns WHERE table_schema='public' AND table_name NOT LIKE '%_codes' AND table_name <> 'field_meta' ORDER BY table_name, column_name;
INSERT INTO user_role_codes (name) VALUES ('entry', 'rating', 'admin');

-- Add sort order column to all lookup tables
DO $$
DECLARE
    tables CURSOR FOR
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema='public' AND table_name LIKE '%_codes'
        ORDER BY table_name;
    nbRow int;
BEGIN
    FOR table_record IN tables LOOP
        EXECUTE 'ALTER TABLE ' || table_record.table_name || ' ADD COLUMN sort_order INTEGER; UPDATE ' || table_record.table_name || ' SET sort_order=id';
    END LOOP;
END$$;

-- Finds all lookup tables that have an "other" field
DO $$
DECLARE
    tables CURSOR FOR
        SELECT DISTINCT table_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name LIKE '%_codes' AND column_name='name'
        ORDER BY table_name;
    sql_str text := '';
BEGIN
    FOR table_record IN tables LOOP
        if (char_length(sql_str) = 0) Then
            sql_str := 'SELECT ''' || table_record.table_name || ''' AS table_name FROM ' || table_record.table_name || ' WHERE name=''Other''';
        else
            sql_str := sql_str || ' UNION ALL SELECT ''' || table_record.table_name || ''' AS table_name FROM ' || table_record.table_name || ' WHERE name=''Other''';
        end if;
    END LOOP;

    raise notice '%', sql_str;
    
END$$;

-- Set up constraints for lookups
SELECT FORMAT('ALTER TABLE %1$s ADD CONSTRAINT %1$s_%2$s_fkey FOREIGN KEY (%2$s) REFERENCES %2$ss(code) ON DELETE RESTRICT ON UPDATE CASCADE;', table_name, column_name) AS sql_stmt
FROM information_schema.columns 
WHERE 
    column_name LIKE '%_code' AND 
    column_name NOT IN ('zip_code', 'park_unit_code') AND
    table_schema='public' AND 
    column_name NOT IN (
        SELECT kcu.column_name FROM information_schema.table_constraints AS tc JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name WHERE constraint_type = 'FOREIGN KEY'
    ) 
ORDER BY 1;

select DISTINCT
    pg_describe_object(classid, objid, objsubid), 
    pg_get_constraintdef(objid)
from pg_depend 
where deptype = 'n' AND pg_get_constraintdef(objid) LIKE 'FOREIGN KEY %' AND pg_get_constraintdef(objid) NOT LIKE '% ON UPDATE CASCADE %' ORDER BY 1;


SELECT * FROM
    (
        SELECT 
            kcu.column_name AS col_name,
            kcu.table_name AS table_name,
            tc.constraint_name AS constraint_name
        FROM 
            information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name 
                JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name 
        WHERE constraint_type = 'FOREIGN KEY'
    ) AS c_cols
    INNER JOIN
    (
        SELECT DISTINCT 
            split_part(pg_describe_object(classid, objid, objsubid), ' ', 2) AS constraint_name, 
            pg_get_constraintdef(objid) AS constraint_def
        FROM pg_depend
        WHERE 
            deptype = 'n'  
    ) AS c_info
    ON c_cols.constraint_name = c_info.constraint_name
    WHERE 
        c_info.constraint_def LIKE 'FOREIGN KEY %'
    ORDER BY c_cols.constraint_name;


--change codes to integers
SELECT FORMAT('ALTER TABLE %1$s RENAME COLUMN code TO short_name;', table_name, column_name) AS sql_stmt
FROM information_schema.columns
WHERE
    column_name LIKE '%_code' AND
    column_name NOT IN ('zip_code', 'park_unit_code') AND
    table_schema='public' AND
    column_name NOT IN (
        SELECT kcu.column_name FROM information_schema.table_constraints AS tc JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name WHERE constraint_type = 'FOREIGN KEY'
    )
ORDER BY 1;

SELECT FORMAT('ALTER TABLE %1$s DROP CONSTRAINT %3$s; ALTER TABLE %1$s ALTER COLUMN %2$s SET DATA TYPE INTEGER USING %2$s::INTEGER; ALTER TABLE %1$s ADD CONSTRAINT %3$s FOREIGN KEY (%2$s) REFERENCES %2$ss(code) ON UPDATE CASCADE ON DELETE RESTRICT;', table_name, col_name, c_cols.constraint_name) AS stmt
FROM
    (
         SELECT
             kcu.column_name AS col_name,
             kcu.table_name AS table_name,
             tc.constraint_name AS constraint_name
         FROM
             information_schema.table_constraints AS tc
                 JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
                 JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
         WHERE constraint_type = 'FOREIGN KEY'
    ) AS c_cols
    INNER JOIN
    (
         SELECT DISTINCT
             split_part(pg_describe_object(classid, objid, objsubid), ' ', 2) AS constraint_name,
             pg_get_constraintdef(objid) AS constraint_def
         FROM pg_depend
         WHERE
             deptype = 'n'
     ) AS c_info
     ON c_cols.constraint_name = c_info.constraint_name
     WHERE
         c_info.constraint_def LIKE 'FOREIGN KEY %(code)%'
     ORDER BY c_cols.constraint_name;


-- set unkown and other to -1 and -2, respectively
SELECT 
    DISTINCT FORMAT(
        'UPDATE %1$s SET code=CASE WHEN lower(name)=''other'' THEN -2 WHEN lower(name)=''unknown'' THEN -1 ELSE id END;', 
    table_name) AS expr
FROM information_schema.columns 
WHERE 
    table_name LIKE '_%codes' AND 
    column_name='code'
ORDER BY 1;

UPDATE visibility_codes SET code=CASE WHEN lower(name)='other' THEN -2 WHEN lower(name)='unknown' THEN -1 ELSE id END;


-- copy schema to dev
  -- Function: clone_schema(text, text)

  -- DROP FUNCTION clone_schema(text, text);

CREATE OR REPLACE FUNCTION clone_schema(
    source_schema text,
    dest_schema text,
    include_records boolean)
  RETURNS void AS
$BODY$

--  This function will clone all sequences, tables, data, views & functions from any existing schema to a new one
-- SAMPLE CALL:
-- SELECT clone_schema('public', 'new_schema', TRUE);

DECLARE
  src_oid          oid;
  tbl_oid          oid;
  func_oid         oid;
  object           text;
  buffer           text;
  srctbl           text;
  default_         text;
  column_          text;
  record_          record;
  qry              text;
  dest_qry         text;
  v_def            text;
  seqval           bigint;
  sq_last_value    bigint;
  sq_maximum_value     bigint;
  sq_start_value   bigint;
  sq_increment_by  bigint;
  sq_min_value     bigint;
  sq_cache_value   bigint;
  sq_log_cnt       bigint;
  sq_is_called     boolean;
  sq_is_cycled     boolean;
  sq_cycled        char(10);

BEGIN

-- Check that source_schema exists
  SELECT oid INTO src_oid
    FROM pg_namespace
   WHERE nspname = quote_ident(source_schema);
  IF NOT FOUND
    THEN 
    RAISE NOTICE 'source schema % does not exist!', source_schema;
    RETURN ;
  END IF;

  -- Check that dest_schema does not yet exist
  PERFORM nspname 
    FROM pg_namespace
   WHERE nspname = quote_ident(dest_schema);
  IF FOUND
    THEN 
    RAISE NOTICE 'dest schema % already exists!', dest_schema;
    RETURN ;
  END IF;

  EXECUTE 'CREATE SCHEMA ' || quote_ident(dest_schema) ;

  -- Create sequences
  -- TODO: Find a way to make this sequence's owner is the correct table.
  FOR object IN
    SELECT sequence_name::text 
      FROM information_schema.sequences
     WHERE sequence_schema = quote_ident(source_schema)
  LOOP
    RAISE NOTICE 'SEQUENCE: %', quote_ident(dest_schema) || '.' || quote_ident(object);
    
    EXECUTE 'CREATE SEQUENCE ' || quote_ident(dest_schema) || '.' || quote_ident(object);
    srctbl := quote_ident(source_schema) || '.' || quote_ident(object);

    EXECUTE 'SELECT last_value, maximum_value, start_value, increment, minimum_value, cache_value, log_cnt, is_cycled, is_called 
              FROM ' || --' || quote_ident(source_schema) || '.' || quote_ident(object) || ';' 
              '(SELECT *, ''a'' AS join_field FROM information_schema.sequences WHERE sequence_schema = ''' || quote_ident(source_schema) || ''' AND sequence_name = ''' || quote_ident(object) || ''') _ NATURAL JOIN (SELECT ''a'' AS join_field, * FROM ' || quote_ident(source_schema) || '.' || quote_ident(object) || ') __ NATURAL JOIN (SELECT ''a'' AS join_field, seqcache AS cache_value, seqcycle AS is_cycled FROM pg_sequence where seqrelid = ''' || quote_ident(object) || '''::regclass) ___ ;'
              INTO sq_last_value, sq_maximum_value, sq_start_value, sq_increment_by, sq_min_value, sq_cache_value, sq_log_cnt, sq_is_cycled, sq_is_called ; 

    IF sq_is_cycled 
      THEN 
        sq_cycled := 'CYCLE';
    ELSE
        sq_cycled := 'NO CYCLE';
    END IF;

    EXECUTE 'ALTER SEQUENCE '   || quote_ident(dest_schema) || '.' || quote_ident(object) 
            || ' INCREMENT BY ' || sq_increment_by
            || ' MINVALUE '     || sq_min_value 
            || ' MAXVALUE '     || sq_maximum_value
            || ' START WITH '   || sq_start_value
            || ' RESTART '      || sq_min_value 
            || ' CACHE '        || sq_cache_value 
            || sq_cycled || ' ;' ;

    buffer := quote_ident(dest_schema) || '.' || quote_ident(object);
    IF include_records 
        THEN
            EXECUTE 'SELECT setval( ''' || buffer || ''', ' || sq_last_value || ', ' || sq_is_called || ');' ; 
    ELSE
            EXECUTE 'SELECT setval( ''' || buffer || ''', ' || sq_start_value || ', ' || sq_is_called || ');' ;
    END IF;

  END LOOP;

-- Create tables 
  FOR object IN
    SELECT table_name::text 
      FROM information_schema.tables 
     WHERE 
        table_schema = quote_ident(source_schema) AND
        table_type = 'BASE TABLE' AND 
        to_regclass(table_name) IS NOT NULL
  LOOP
    buffer := dest_schema || '.' || quote_ident(object);
    EXECUTE 'CREATE TABLE ' || buffer || ' (LIKE ' || quote_ident(source_schema) || '.' || quote_ident(object) 
        || ' INCLUDING ALL)';

    -- Make sure destination schema tables point to destination lookup tables
    -- FOR record_ IN
    --     SELECT oid, conname
    --         FROM pg_constraint
    --     WHERE 
    --         contype = 'f' AND 
    --         conrelid = (dest_schema || '.' || object)::regclass::oid
    -- LOOP
    --     RAISE NOTICE 'update constraint statements: %', format(
    --         'ALTER TABLE %1$s DROP CONSTRAINT %2$s; ALTER TABLE %1$s ADD CONSTRAINT %2$s %3$s',
    --         buffer, 
    --         record_.conname,
    --         replace(pg_get_constraintdef(record_.oid), record_.confrelid::regclass::text, buffer)
    --     );
    --     EXECUTE format(
    --         'ALTER TABLE %1$s DROP CONSTRAINT %2$s; ALTER TABLE %1$s ADD CONSTRAINT %2$s %3$s',
    --         buffer, 
    --         record_.conname,
    --         replace(pg_get_constraintdef(record_.oid), record_.confrelid::regclass::text, buffer)
    --     );
    -- END LOOP;

    IF include_records 
      THEN 
      -- Insert records from source table
      EXECUTE 'INSERT INTO ' || buffer || ' SELECT * FROM ' || quote_ident(source_schema) || '.' || quote_ident(object) || ';';
    END IF;
 
    FOR column_, default_ IN
      SELECT column_name::text, 
             REPLACE(column_default::text, source_schema, dest_schema) 
        FROM information_schema.COLUMNS 
       WHERE table_schema = dest_schema 
         AND TABLE_NAME = object 
         AND column_default LIKE 'nextval(%' || quote_ident(source_schema) || '%::regclass)'
    LOOP
      EXECUTE 'ALTER TABLE ' || buffer || ' ALTER COLUMN ' || column_ || ' SET DEFAULT ' || default_;
    END LOOP;

  END LOOP;

--  add FK constraint
  FOR qry IN
    SELECT 'ALTER TABLE ' || quote_ident(dest_schema) || '.' || quote_ident(rn.relname) 
                          || ' ADD CONSTRAINT ' || quote_ident(ct.conname) || ' ' || pg_get_constraintdef(ct.oid) || ';'
      FROM pg_constraint ct
      JOIN pg_class rn ON rn.oid = ct.conrelid
     WHERE connamespace = src_oid
       AND rn.relkind = 'r'
       AND ct.contype = 'f'
         
    LOOP
      EXECUTE qry;

    END LOOP;

  -- Make sure destination schema tables point to destination lookup tables
  FOR qry IN
    SELECT 
        format(
            'ALTER TABLE %1$s DROP CONSTRAINT %2$s; ALTER TABLE %1$s ADD CONSTRAINT %2$s %3$s;', 
            pgc.conrelid::regclass::text, 
            constraint_name,  
            replace(pg_get_constraintdef(pgc.oid), pgc.confrelid::regclass::text, dest_schema || '.' || pgc.confrelid::regclass::text)
        ) 
    FROM 
        pg_constraint pgc 
    JOIN information_schema.constraint_column_usage ccu ON conname=constraint_name 
    WHERE 
        constraint_schema <> table_schema AND 
        constraint_schema=dest_schema AND 
        conrelid::regclass::text LIKE dest_schema || '.%'
    
    LOOP
        EXECUTE qry;
    END LOOP;

-- Create views 
  FOR object IN
    SELECT table_name::text,
           view_definition 
      FROM information_schema.views
     WHERE table_schema = quote_ident(source_schema)

  LOOP
    buffer := dest_schema || '.' || quote_ident(object);
    SELECT view_definition INTO v_def
      FROM information_schema.views
     WHERE table_schema = quote_ident(source_schema)
       AND table_name = quote_ident(object);
     
    EXECUTE 'CREATE OR REPLACE VIEW ' || buffer || ' AS ' || v_def || ';' ;

  END LOOP;

-- Create functions 
  FOR func_oid IN
    SELECT oid
      FROM pg_proc 
     WHERE pronamespace = src_oid

  LOOP      
    SELECT pg_get_functiondef(func_oid) INTO qry;
    SELECT replace(qry, source_schema, dest_schema) INTO dest_qry;
    EXECUTE dest_qry;

  END LOOP;
  
  RETURN; 
 
END;
 
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;

ALTER FUNCTION clone_schema(text, text, boolean)
  OWNER TO postgres;


select clone_schema('public', 'dev', true);