
from datetime import datetime
import pandas as pd
import pyodbc
import re
import sqlalchemy as sqla
import sys
import warnings
import win32com.client

from ..resource import db_utils

pd.options.mode.chained_assignment = None # Turn off setting as copy warning
warnings.simplefilter(action='ignore', category=UserWarning)


# boolean fields without an explicit lookup table
BOOLEAN_FIELDS = [
    'BearSpraySuccessCode'
    'FirearmPossessionCode',
    'BearSprayPossessionCode',
    'FoodRewardCode'
    'ReceivedSafetyCode'
]

# Some lookup table relationships in the Access database are not defined so define them manually
UNDEFINED_RELATIONSHIPS = pd.DataFrame([
    {'lookup_table': 'refHumanPriorActivity', 'lookup_column': 'HumanPriorActivityCode', 'data_table': 'tblEncounter', 'data_column': 'HumanPriorActivityCode'}
])

COUNTRY_CODES_WITH_STATES = [40, 236] # CA and US

#assessment
DATA_ENTRY_STATUS_REPLACE = {
    10: 1,
    20: 2,
    30: 3,
    50: 4
}
HUMAN_INJURY_REPLACE = {
    10: 1,
    20: 2,
    30: 3,
    40: 4,
    50: 5,
    60: 6,
    10000: None,
    10001: None
}
PROBABLE_CAUSE_REPLACE = {
    10: 5,
    20: 2,
    40: 11,
    120: 6
}
RESPONSIBILITY_REPLACE = {
    0: 1,
    10: 2,
    20: 3,
    30: 4,
    40: 5,
    50: 6,
    999: -2
}

#bears
BEAR_AGE_REPLACE = {
    10: 1,
    20: 2,
    40: 3,
    50: 4
}
BEAR_COLOR_REPLACE = {
    10: 1,
    20: 2,
    30: 5,
    40: 3,
    60: 4
}
BEAR_INJURY_REPLACE = {
    0: 2,
    10: 3,
    20: 4,
    30: 5,
    40: 6,
    50: 7
}
BEAR_SPECIES_REPLACE = {
    10: 2,
    20: 1
}

# encounters
BEAR_COHORT_REPLACE = {
    10: 1,
    80: 5
}
DAYLIGHT_REPLACE = {
    10: 7,
    20: 8,
    30: 2,
    40: 3,
    50: 4,
    60: 5,
    70: 6,
    80: 1,
    9999: 9
}
DURATION_REPLACE = {
    0: 1,
    10: 2,
    20: 3,
    30: 4,
    40: 5,
    50: 6,
    60: 7,
    70: 8
}
FOOD_PRESENT_REPLACE = {
    0: 3
}
GENERAL_HUMAN_ACTIVITY_REPLACE = {
    30: 7,
    195: 8,
    200: 5,
    999: -2
}
INITITAL_HUMAN_ACTIVITY_REPLACE = {
    10: 5,
    24: 2,
    25: 2,
    30: 3,
    40: 4,
    50: 10,
    60: 7,
    70: 1,
    170: 8,
    200: 9,
    999: -2,
    10000: None,
    10001: None

}
INITITAL_BEAR_ACTIVITY_REPLACE = {
    10: 1,
    18: 2,
    30: 3,
    40: 6,
    49: 5,
    60: 13,
    70: 8,
    130: 12,
    140: 7,
    200: 9,
    180: 11
}
HUMAN_GROUP_TYPE_REPLACE = {
    5: 1,
    50: 3,
    60: 5,
    65: 5,
    70: 2,
    130: 4,
    999: -2
}
MAKING_NOISE_REPLACE = {
    10: 3,
    20: 4,
    30: 5,
    40: 6,
    42: 7,
    44: 8,
    50: 9,
    60: 10,
    70: 11,
    999: -2
}
OBSERVATION_TYPE_REPLACE = {
    10: 1,
    15: 2
}
SAFETY_INFO_SOURCE_REPLACE = {
    999: -2
}
STRUCTURE_INTERACTION_REPLACE = {
    0: None,
    10: 1,
    20: 2,
    30: 3,
    40: 4
}

#encounter locations
MAPPING_METHOD_REPLACE = {
    30: 1,
    10: 3,
    999: -2,
    20: 4,
    0: None
}
PEOPLE_PRESENT_REPLACE = {
    10011: None
}

DATUM_REPLACE = {
    20: 2
}
LOCATION_ACCURACY_REPLACE = {
    10: 1,
    20: 2,
    30: 3,
    40: 4,
    50: 5
}
PLACE_NAME_REPLACE = {
    'C-Camp': 18,
    'Concessionaire Housing': 20,
    'Eielson Visitor Center': 3,
    'Hotel Area Trails': 1,
    'Headquarters Area': 17,
    'Igloo Campground': 8,
    'Kantishna Dev Areas': 16,
    'McKinley Bar Trail': 23,
    'Morino Campground': 24,
    'Park Hotel': 25,
    'Park Road': 11,
    'Polychrome Rest Stop': 13,
    'Riley Creek Campground': 4,
    'Sanctuary Campground': 6,
    'Savage Campground': 5,
    'Savage River Area': 2,
    'Stony Hill Overlook': 15,
    'Teklanika Campground': 7,
    'Teklanika Rest Stop': 10,
    'Toklat Roadcamp': 19,
    'Visitor Center': 1,
    'Wonder Lake': 9,
    'Wonder Lake Campground': 9,
    'Wonder Lake Day Use': 9,
    'Other': 22
}

# people
COUNTRY_CODES_REPLACE = {
    'Australia': 14,
    'Canada': 40,
    'England': 235,
    'France': 76,
    'Germany': 83,
    'Israel': 109,
    'Japan': 112,
    'New Zealand': 159,
    'USA': 236,
    'US': 236
}
RESIDENCY_REPLACE = {
    10: 1,
    20: 2
}
SEX_REPLACE = {
    10: 2,
    20: 1
}

# The "ReactionBy" field is replaced by an "is_primary" field since the reaction_code already captures the animal
#   responsible for the reaction. The "ReactionBy" field really just records what type of animal and whether it's the
#   primary one or not
REACTION_BY_REPLACE = {
    10: True,
    20: False,
    30: True,
    40: False,
    50: True,
    999: False
}

STRUCTURE_TYPE_REPLACE = {
    0: None,
    10: 1,
    20: 2,
    30: 3,
    40: 4,
    50: 3,
    60: 6,
    70: 5,
    999: -2
}

DOG_REACTION_REPLACE = {
    -1: -200,
    0: None,
    5: 200,
    10: 210,
    15: 215,
    20: -200,
    30: 201,
    40: 202,
    50: 203,
    55: 255,
    60: 260
}

# xref tables
DEVELOPMENT_REPLACE = {
    10: 1,
    20: 2,
    30: 3,
    40: 4,
    50: 5,
    60: 6,
    70: 7,
    80: 8,
    85: 9,
    90: 10,
    100: 11,
    110: 12,
    120: 13,
    130: 14,
    140: 15,
    999: -2
}
HAZING_REPLACE = {
    0: 1,
    5: 2,
    10: 3,
    20: 4,
    25: 5,
    30: 6,
    40: 7,
    45: 8,
    50: 9,
    60: 10,
    70: 11,
    80: 12,
    90: 13,
    100: 14,
    999: -2
}
HUMAN_FOOD_REPLACE =  {
    0: 1,
    10: 2,
    20: 3,
    30: 4,
    40: 5,
    50: 6,
    51: 7,
    52: 8,
    53: 9,
    55: 10,
    60: 11,
    70: 12,
    80: 13,
    999: -2
}
NATURAL_FOOD_REPLACE =  {
    0: 1,
    10: 2,
    20: 3,
    30: 4,
    40: 5,
    50: 6,
    999: -2
}

HABITAT_TYPE_REPLACE = {999: -2}

COLUMNS = pd.DataFrame([
    {'access_table': 'tblAnalysis',   'access_column': 'AvoidanceNarrative',        'pg_table': 'assessment', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'AvoidanceScore',            'pg_table': 'assessment', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'Comments',                  'pg_table': 'assessment', 'pg_column': 'assessment_comments'},
    {'access_table': 'tblAnalysis',   'access_column': 'DataQualityCode',           'pg_table': 'assessment', 'pg_column': 'data_quality_code'},
    {'access_table': 'tblAnalysis',   'access_column': 'DeterrenceScore',           'pg_table': 'assessment', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'EntryStatusCode',           'pg_table': 'assessment', 'pg_column': 'data_entry_status_code', 'replace_dict': DATA_ENTRY_STATUS_REPLACE},
    {'access_table': 'tblAnalysis',   'access_column': 'HumanInjuryCode',           'pg_table': 'assessment', 'pg_column': 'human_injury_code', 'replace_dict': HUMAN_INJURY_REPLACE},
    {'access_table': 'tblAnalysis',   'access_column': 'IncidentID',                'pg_table': 'assessment', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'OverallVisibility2Code',    'pg_table': 'assessment', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'ProbableCauseCode',         'pg_table': 'assessment', 'pg_column': 'probable_cause_code', 'replace_dict': PROBABLE_CAUSE_REPLACE},
    {'access_table': 'tblAnalysis',   'access_column': 'ProbableResponsibilityCode','pg_table': 'assessment', 'pg_column': 'responsibility_classification_code', 'replace_dict': RESPONSIBILITY_REPLACE},

    {'access_table': 'tblBear',       'access_column': 'BearAgeCode',               'pg_table': 'bears', 'pg_column': 'bear_age_code', 'replace_dict': BEAR_AGE_REPLACE},
    {'access_table': 'tblBear',       'access_column': 'BearColorCode',             'pg_table': 'bears', 'pg_column': 'bear_color_code', 'replace_dict': BEAR_COLOR_REPLACE},
    {'access_table': 'tblBear',       'access_column': 'BearInjuryCode',            'pg_table': 'bears', 'pg_column': 'bear_injury_code', 'replace_dict': BEAR_INJURY_REPLACE},
    {'access_table': 'tblBear',       'access_column': 'BearNum',                   'pg_table': 'bears', 'pg_column': 'bear_number'},
    {'access_table': 'tblBear',       'access_column': 'BearParkID',                'pg_table': 'bears', 'pg_column': 'bear_park_id'},
    {'access_table': 'tblBear',       'access_column': 'BearSpeciesCode',           'pg_table': 'bears', 'pg_column': 'bear_species_code', 'replace_dict': BEAR_SPECIES_REPLACE},
    {'access_table': 'tblBear',       'access_column': 'Description',               'pg_table': 'bears', 'pg_column': 'bear_description'},
    {'access_table': 'tblBear',       'access_column': 'IncidentID',                'pg_table': 'bears', 'pg_column': ''},
    {'access_table': 'tblBear',       'access_column': 'IsBearSuspect',             'pg_table': 'bears', 'pg_column': 'was_previously_encountered'},
    {'access_table': 'tblBear',       'access_column': 'SexCode',                   'pg_table': 'bears', 'pg_column': 'bear_sex_code', 'replace_dict': SEX_REPLACE, 'pg_lookup_table': 'sex_codes'},
    {'access_table': 'tblBearSpray',  'access_column': 'BearSprayDoseCode',         'pg_table': 'bear_spray_uses', 'pg_column': 'bear_spray_dose_code'},
    {'access_table': 'tblBearSpray',  'access_column': 'BearSprayManufacturer',     'pg_table': 'bear_spray_uses', 'pg_column': 'bear_spray_manufacturer'},
    {'access_table': 'tblBearSpray',  'access_column': 'BearSprayNum',              'pg_table': 'bear_spray_uses', 'pg_column': 'display_order'},
    {'access_table': 'tblBearSpray',  'access_column': 'BearSpraySuccessCode',      'pg_table': 'bear_spray_uses', 'pg_column': 'bear_spray_success_code'},
    {'access_table': 'tblBearSpray',  'access_column': 'BearSprayUseCode',          'pg_table': 'bear_spray_uses', 'pg_column': 'bear_spray_use_code'},
    {'access_table': 'tblBearSpray',  'access_column': 'IncidentID',                'pg_table': 'bear_spray_uses', 'pg_column': ''},

    # {'access_table': 'tblCIR',        'access_column': 'BroadcastTime',             'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'CaseIncidentNum',           'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'ClearedDate',               'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'DepositionNum',             'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'HowReported',               'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'IncidentDate',              'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'IncidentDay',               'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'IncidentDesc',              'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'IncidentDetails',           'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'IncidentID',                'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'InvestigatedBy',            'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'InvestigatedDate',          'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'IsCIRApproved',             'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'LocationCode',              'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'LocationDesc',              'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'OffenseCode1',              'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'OffenseCode2',              'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'OffenseCode3',              'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'OrganizationCode',          'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'OrganizationName',          'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'PropertyCode',              'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'RangerNum',                 'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'ReceivedBy',                'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'ReceivedDate',              'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'ReportedBy',                'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'ReportedByAddress1',        'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'ReportedByAddress2',        'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'ReportedByHomePhone',       'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'ReportedByWorkPhone',       'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'TotalPropertyValue',        'pg_table': 'case_incident_reports', 'pg_column': ''},
    # {'access_table': 'tblCIR',        'access_column': 'TotalRecoverValue',         'pg_table': 'case_incident_reports', 'pg_column': ''},

    {'access_table': 'tblCIRPerson',  'access_column': 'Address1',                  'pg_table': 'people', 'pg_column': 'address_1'},
    {'access_table': 'tblCIRPerson',  'access_column': 'Address2',                  'pg_table': 'people', 'pg_column': 'address_2'},
    {'access_table': 'tblCIRPerson',  'access_column': 'Age',                       'pg_table': 'people', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'BirthDate',                 'pg_table': 'people', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'City',                      'pg_table': 'people', 'pg_column': 'city'},
    {'access_table': 'tblCIRPerson',  'access_column': 'Country',                   'pg_table': 'people', 'pg_column': 'country_code'},
    {'access_table': 'tblCIRPerson',  'access_column': 'FirstName',                 'pg_table': 'people', 'pg_column': 'first_name'},
    {'access_table': 'tblCIRPerson',  'access_column': 'IncidentID',                'pg_table': 'people', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'IsPrimaryPerson',           'pg_table': 'people', 'pg_column': 'is_primary_person'},
    {'access_table': 'tblCIRPerson',  'access_column': 'LastName',                  'pg_table': 'people', 'pg_column': 'last_name'},
    {'access_table': 'tblCIRPerson',  'access_column': 'PersonNum',                 'pg_table': 'people', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'PhoneNumber',               'pg_table': 'people', 'pg_column': 'phone_number'},
    {'access_table': 'tblCIRPerson',  'access_column': 'RaceCode',                  'pg_table': 'people', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'ResidencyCode',             'pg_table': 'people', 'pg_column': 'residency_code', 'replace_dict': RESIDENCY_REPLACE},
    {'access_table': 'tblCIRPerson',  'access_column': 'SexCode',                   'pg_table': 'people', 'pg_column': 'sex_code', 'replace_dict': SEX_REPLACE},
    {'access_table': 'tblCIRPerson',  'access_column': 'State',                     'pg_table': 'people', 'pg_column': 'state_code'},
    {'access_table': 'tblCIRPerson',  'access_column': 'ZipCode',                   'pg_table': 'people', 'pg_column': 'zip_code'},

    {'access_table': 'tblCIRProperty','access_column': 'IncidentID',                'pg_table': 'property_damage', 'pg_column': ''},
    {'access_table': 'tblCIRProperty','access_column': 'IsPropertyInControl',       'pg_table': 'property_damage', 'pg_column': 'was_in_persons_control'},
    {'access_table': 'tblCIRProperty','access_column': 'PropertyDesc',              'pg_table': 'property_damage', 'pg_column': 'property_description'},
    {'access_table': 'tblCIRProperty','access_column': 'PropertyLoss',              'pg_table': 'property_damage', 'pg_column': ''},
    {'access_table': 'tblCIRProperty','access_column': 'PropertyNum',               'pg_table': 'property_damage', 'pg_column': ''},
    {'access_table': 'tblCIRProperty','access_column': 'PropertyQty',               'pg_table': 'property_damage', 'pg_column': 'quantity'},
    {'access_table': 'tblCIRProperty','access_column': 'PropertyValue',             'pg_table': 'property_damage', 'pg_column': 'property_value'},
    {'access_table': 'tblCIRProperty','access_column': 'RecoverDate',               'pg_table': 'property_damage', 'pg_column': 'recovery_date'},
    {'access_table': 'tblCIRProperty','access_column': 'RecoverValue',              'pg_table': 'property_damage', 'pg_column': ''},

    {'access_table': 'tblEncounter',  'access_column': 'IncidentID',                'pg_table': 'encounters', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'GeneralActivityCode',       'pg_table': 'encounters', 'pg_column': 'general_human_activity_code', 'replace_dict': GENERAL_HUMAN_ACTIVITY_REPLACE},
    {'access_table': 'tblEncounter',  'access_column': 'HumanPriorActivityCode',    'pg_table': 'encounters', 'pg_column': 'initial_human_action_code', 'replace_dict': INITITAL_HUMAN_ACTIVITY_REPLACE},
    {'access_table': 'tblEncounter',  'access_column': 'BearPriorActivityCode',     'pg_table': 'encounters', 'pg_column': 'initial_bear_action_code', 'replace_dict': INITITAL_BEAR_ACTIVITY_REPLACE},
    {'access_table': 'tblEncounter',  'access_column': 'InitialDistanceM',          'pg_table': 'encounters', 'pg_column': 'initial_distance_m'},
    {'access_table': 'tblEncounter',  'access_column': 'ClosestDistanceM',          'pg_table': 'encounters', 'pg_column': 'closest_distance_m'},
    {'access_table': 'tblEncounter',  'access_column': 'ChargeFromDistanceM',       'pg_table': 'encounters', 'pg_column': 'greatest_charge_distance_m'},
    {'access_table': 'tblEncounter',  'access_column': 'NoiseMakingCode',           'pg_table': 'encounters', 'pg_column': 'making_noise_code', 'replace_dict': MAKING_NOISE_REPLACE},
    {'access_table': 'tblEncounter',  'access_column': 'ChargeCount',               'pg_table': 'encounters', 'pg_column': 'charge_count'},
    {'access_table': 'tblEncounter',  'access_column': 'Narrative',                 'pg_table': 'encounters', 'pg_column': 'narrative'},
    {'access_table': 'tblEncounter',  'access_column': 'FirearmPossessionCode',     'pg_table': 'encounters', 'pg_column': 'firearm_was_present'},
    {'access_table': 'tblEncounter',  'access_column': 'BearSprayPossessionCode',   'pg_table': 'encounters', 'pg_column': 'bear_spray_was_present'},
    {'access_table': 'tblEncounter',  'access_column': 'BearDeathCount',            'pg_table': 'encounters', 'pg_column': 'bear_death_count'},
    {'access_table': 'tblEncounter',  'access_column': 'DogInteractionCode',        'pg_table': 'encounters', 'pg_column': '', 'replace_dict': DOG_REACTION_REPLACE},
    {'access_table': 'tblEncounter',  'access_column': 'EntryCode',                 'pg_table': 'encounters', 'pg_column': 'structure_interaction_code', 'replace_dict': STRUCTURE_INTERACTION_REPLACE},
    {'access_table': 'tblEncounter',  'access_column': 'FoodPresentCode',           'pg_table': 'encounters', 'pg_column': 'food_present_code', 'replace_dict': FOOD_PRESENT_REPLACE},
    {'access_table': 'tblEncounter',  'access_column': 'FoodRewardCode',            'pg_table': 'encounters', 'pg_column': 'bear_obtained_food'},
    {'access_table': 'tblEncounter',  'access_column': 'PropertyDamageCode',        'pg_table': 'encounters', 'pg_column': ''},

    {'access_table': 'tblFirearm',    'access_column': 'FirearmCaliberCode',        'pg_table': 'firearms', 'pg_column': 'firearm_caliber_code'},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmCode',               'pg_table': 'firearms', 'pg_column': 'firearm_type_code'},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmManufacturer',       'pg_table': 'firearms', 'pg_column': 'firearm_manufacturer'},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmNonLethalCode',      'pg_table': 'firearms', 'pg_column': 'nonlethal_round_type_code'},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmNum',                'pg_table': 'firearms', 'pg_column': 'display_order'},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmSuccessCode',        'pg_table': 'firearms', 'pg_column': 'firearm_success_code'},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmUseCode',            'pg_table': 'firearms', 'pg_column': 'firearm_use_code'},
    {'access_table': 'tblFirearm',    'access_column': 'IncidentID',                'pg_table': 'firearms', 'pg_column': ''},
    {'access_table': 'tblFirearm',    'access_column': 'ShotsFiredCount',           'pg_table': 'firearms', 'pg_column': 'shots_fired_count'},

    {'access_table': 'tblIncident',   'access_column': 'IncidentID',                'pg_table': 'encounters', 'pg_column': 'incident_id'},
    {'access_table': 'tblIncident',   'access_column': 'IncidentDate',              'pg_table': 'encounters', 'pg_column': 'start_date'},
    {'access_table': 'tblIncident',   'access_column': 'IncidentTime',              'pg_table': 'encounters', 'pg_column': 'start_time'},
    {'access_table': 'tblIncident',   'access_column': 'TimeCode',                  'pg_table': 'encounters', 'pg_column': 'daylight_code', 'replace_dict': DAYLIGHT_REPLACE},
    {'access_table': 'tblIncident',   'access_column': 'DurationCode',              'pg_table': 'encounters', 'pg_column': 'duration_code', 'replace_dict': DURATION_REPLACE},
    {'access_table': 'tblIncident',   'access_column': 'HumanInvolvementCode',      'pg_table': 'encounters', 'pg_column': 'people_present_code', 'replace_dict': PEOPLE_PRESENT_REPLACE},
    {'access_table': 'tblIncident',   'access_column': 'GroupTypeCode',             'pg_table': 'encounters', 'pg_column': 'human_group_type_code', 'replace_dict': HUMAN_GROUP_TYPE_REPLACE},
    {'access_table': 'tblIncident',   'access_column': 'TotalGroupSize',            'pg_table': 'encounters', 'pg_column': 'group_size_total'},
    {'access_table': 'tblIncident',   'access_column': 'EncounterGroupSize',        'pg_table': 'encounters', 'pg_column': 'group_size_encounter'},
    {'access_table': 'tblIncident',   'access_column': 'CohortCode',                'pg_table': 'encounters', 'pg_column': 'bear_cohort_code', 'replace_dict': BEAR_COHORT_REPLACE},
    {'access_table': 'tblIncident',   'access_column': 'DurationMinutes',           'pg_table': 'encounters', 'pg_column': 'duration_minutes'},
    {'access_table': 'tblIncident',   'access_column': 'IncidentNum',               'pg_table': 'encounters', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'IncidentRecordDate',        'pg_table': 'encounters', 'pg_column': 'received_date'},
    {'access_table': 'tblIncident',   'access_column': 'IncidentRecorderName',      'pg_table': 'encounters', 'pg_column': 'received_by'},
    {'access_table': 'tblIncident',   'access_column': 'InfoSourceCode',            'pg_table': 'encounters', 'pg_column': 'safety_info_source_code', 'replace_dict': SAFETY_INFO_SOURCE_REPLACE},
    {'access_table': 'tblIncident',   'access_column': 'InsertBy',                  'pg_table': 'encounters', 'pg_column': 'entered_by'},
    {'access_table': 'tblIncident',   'access_column': 'InsertDate',                'pg_table': 'encounters', 'pg_column': 'entry_time'},
    {'access_table': 'tblIncident',   'access_column': 'InteractGroupSize',         'pg_table': 'encounters', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'IsCIRRequired',             'pg_table': 'encounters', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'LastUpdateBy',              'pg_table': 'encounters', 'pg_column': 'last_edited_by'},
    {'access_table': 'tblIncident',   'access_column': 'LastUpdateDate',            'pg_table': 'encounters', 'pg_column': 'datetime_last_edited'},
    {'access_table': 'tblIncident',   'access_column': 'OriginalIncidentNum',       'pg_table': 'encounters', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'OriginalSourceNotes',       'pg_table': 'encounters', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'ParkCode',                  'pg_table': 'encounters', 'pg_column': 'park_unit_code'},
    {'access_table': 'tblIncident',   'access_column': 'ParkFormNum',               'pg_table': 'encounters', 'pg_column': 'park_form_id'},
    {'access_table': 'tblIncident',   'access_column': 'ReceivedSafetyCode',        'pg_table': 'encounters', 'pg_column': 'did_receive_safety_info'},
    {'access_table': 'tblIncident',   'access_column': 'RecordTypeCode',            'pg_table': 'encounters', 'pg_column': 'observation_type_code', 'replace_dict': OBSERVATION_TYPE_REPLACE},
    {'access_table': 'tblIncident',   'access_column': 'Time2Code',                 'pg_table': 'encounters', 'pg_column': ''},

    {'access_table': 'tblLocation',   'access_column': 'DatumCode',                 'pg_table': 'encounter_locations', 'pg_column': 'datum_code', 'replace_dict': DATUM_REPLACE},
    {'access_table': 'tblLocation',   'access_column': 'FreqUseSiteCode',           'pg_table': 'encounter_locations', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'HabitatDesc',               'pg_table': 'encounter_locations', 'pg_column': 'habitat_description'},
    {'access_table': 'tblLocation',   'access_column': 'HabitatVisibilityDesc',     'pg_table': 'encounter_locations', 'pg_column': 'visibility_description'},
    {'access_table': 'tblLocation',   'access_column': 'HasMapPoint',               'pg_table': 'encounter_locations', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'IncidentID',                'pg_table': 'encounter_locations', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'LatitudeDecDeg',            'pg_table': 'encounter_locations', 'pg_column': 'latitude'},
    {'access_table': 'tblLocation',   'access_column': 'LocationDescription',       'pg_table': 'encounter_locations', 'pg_column': 'location_description'},
    {'access_table': 'tblLocation',   'access_column': 'LocationQualityCode',       'pg_table': 'encounter_locations', 'pg_column': 'location_accuracy_code', 'replace_dict': LOCATION_ACCURACY_REPLACE},
    {'access_table': 'tblLocation',   'access_column': 'LocationSourceCode',        'pg_table': 'encounter_locations', 'pg_column': 'mapping_method_code', 'replace_dict': MAPPING_METHOD_REPLACE},
    {'access_table': 'tblLocation',   'access_column': 'LongitudeDecDeg',           'pg_table': 'encounter_locations', 'pg_column': 'longitude'},
    {'access_table': 'tblLocation',   'access_column': 'OverallVisibilityCode',     'pg_table': 'encounter_locations', 'pg_column': 'visibility_code', 'replace_dict': {}}, #blank dict will add any missing codes to the PG lookup table
    {'access_table': 'tblLocation',   'access_column': 'PlaceName',                 'pg_table': 'encounter_locations', 'pg_column': 'place_name_code', 'replace_dict': PLACE_NAME_REPLACE},
    {'access_table': 'tblLocation',   'access_column': 'UTMEasting',                'pg_table': 'encounter_locations', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'UTMNorthing',               'pg_table': 'encounter_locations', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'UTMZone',                   'pg_table': 'encounter_locations', 'pg_column': ''},

    {'access_table': 'tblPerson',     'access_column': 'Address1',                  'pg_table': 'people', 'pg_column': 'address_1'},
    {'access_table': 'tblPerson',     'access_column': 'Address2',                  'pg_table': 'people', 'pg_column': 'address_2'},
    {'access_table': 'tblPerson',     'access_column': 'Age',                       'pg_table': 'people', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'BirthDate',                 'pg_table': 'people', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'City',                      'pg_table': 'people', 'pg_column': 'city'},
    {'access_table': 'tblPerson',     'access_column': 'Country',                   'pg_table': 'people', 'pg_column': 'country_code', 'replace_dict': COUNTRY_CODES_REPLACE},
    {'access_table': 'tblPerson',     'access_column': 'FirstName',                 'pg_table': 'people', 'pg_column': 'first_name'},
    {'access_table': 'tblPerson',     'access_column': 'IncidentID',                'pg_table': 'people', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'IsPrimaryPerson',           'pg_table': 'people', 'pg_column': 'is_primary_person'},
    {'access_table': 'tblPerson',     'access_column': 'HumanAgeCode',              'pg_table': 'people', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'LastName',                  'pg_table': 'people', 'pg_column': 'last_name'},
    {'access_table': 'tblPerson',     'access_column': 'PersonNum',                 'pg_table': 'people', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'PhoneNumber',               'pg_table': 'people', 'pg_column': 'phone_number'},
    {'access_table': 'tblPerson',     'access_column': 'RaceCode',                  'pg_table': 'people', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'ResidencyCode',             'pg_table': 'people', 'pg_column': 'residency_code', 'replace_dict': RESIDENCY_REPLACE},
    {'access_table': 'tblPerson',     'access_column': 'SexCode',                   'pg_table': 'people', 'pg_column': 'sex_code', 'replace_dict': SEX_REPLACE},
    {'access_table': 'tblPerson',     'access_column': 'State',                     'pg_table': 'people', 'pg_column': 'state_code'},
    {'access_table': 'tblPerson',     'access_column': 'ZipCode',                   'pg_table': 'people', 'pg_column': 'zip_code'},

    {'access_table': 'tblProperty',   'access_column': 'IncidentID',                'pg_table': 'property_damage', 'pg_column': ''},
    {'access_table': 'tblProperty',   'access_column': 'IsPropertyInControl',       'pg_table': 'property_damage', 'pg_column': 'was_in_persons_control'},
    {'access_table': 'tblProperty',   'access_column': 'PropertyDesc',              'pg_table': 'property_damage', 'pg_column': 'property_description'},
    {'access_table': 'tblProperty',   'access_column': 'PropertyLoss',              'pg_table': 'property_damage', 'pg_column': ''},
    {'access_table': 'tblProperty',   'access_column': 'PropertyNum',               'pg_table': 'property_damage', 'pg_column': ''},
    {'access_table': 'tblProperty',   'access_column': 'PropertyQty',               'pg_table': 'property_damage', 'pg_column': 'quantity'},
    {'access_table': 'tblProperty',   'access_column': 'PropertyValue',             'pg_table': 'property_damage', 'pg_column': 'property_value'},
    {'access_table': 'tblProperty',   'access_column': 'RecoverDate',               'pg_table': 'property_damage', 'pg_column': 'recovery_date'},
    {'access_table': 'tblProperty',   'access_column': 'RecoverValue',              'pg_table': 'property_damage', 'pg_column': ''},

    {'access_table': 'tblReaction',   'access_column': 'IncidentID',                'pg_table': 'reactions', 'pg_column': ''},
    {'access_table': 'tblReaction',   'access_column': 'ReactionCode',              'pg_table': 'reactions', 'pg_column': 'reaction_code', 'replace_dict': {}}, #blank dict will add any missing codes to the PG lookup table
    {'access_table': 'tblReaction',   'access_column': 'ReactionByCode',            'pg_table': 'reactions', 'pg_column': 'is_primary', 'replace_dict': REACTION_BY_REPLACE},
    {'access_table': 'tblReaction',   'access_column': 'ReactionOrder',             'pg_table': 'reactions', 'pg_column': 'reaction_order'},
    {'access_table': 'tblReaction',   'access_column': 'ReactionNum',               'pg_table': 'reactions', 'pg_column': ''},

    {'access_table': 'xrefDevelopment','access_column': 'IncidentID',               'pg_table': 'development_types', 'pg_column': ''},
    {'access_table': 'xrefDevelopment','access_column': 'DevelopmentCode',          'pg_table': 'development_types', 'pg_column': 'development_type_code'},

    {'access_table': 'xrefHabitatCover','access_column': 'IncidentID',              'pg_table': 'habitat_types',     'pg_column': ''},
    {'access_table': 'xrefHabitatCover','access_column': 'HabitatCoverCode',        'pg_table': 'habitat_types',     'pg_column': 'habitat_type_code', 'replace_dict': HABITAT_TYPE_REPLACE},

    {'access_table': 'xrefHazing',    'access_column': 'IncidentID',                'pg_table': 'hazing_actions',    'pg_column': ''},
    {'access_table': 'xrefHazing',    'access_column': 'HazingCode',                'pg_table': 'hazing_actions',    'pg_column': 'hazing_action_code'},

    {'access_table': 'xrefHumanFood', 'access_column': 'IncidentID',                'pg_table': 'human_foods_present','pg_column': ''},
    {'access_table': 'xrefHumanFood', 'access_column': 'HumanFoodCode',             'pg_table': 'human_foods_present','pg_column': 'human_food_code'},

    {'access_table': 'xrefNaturalFood','access_column': 'IncidentID',               'pg_table': 'natural_foods_present','pg_column': ''},
    {'access_table': 'xrefNaturalFood','access_column': 'NaturalFoodCode',          'pg_table': 'natural_foods_present','pg_column': 'natural_food_code'},

    {'access_table': 'xrefStructure','access_column': 'IncidentID',                 'pg_table': 'structure_interactions','pg_column': ''},
    {'access_table': 'xrefStructure','access_column': 'StructureCode',              'pg_table': 'structure_interactions','pg_column': 'structure_type_code', 'replace_dict': STRUCTURE_TYPE_REPLACE},
])


BEAR_SPRAY_USED_CODES = [25, 30, 40]
BEAR_SPRAY_SUCCESS_CODES = [7, 8, 15, 20, 45, 50, 60]
BEAR_SPRAY_FAILURE_CODES = [35, 40, 45]

def get_foreign_keys(db_path:str) -> pd.DataFrame:
    """
    Get lookup table information from an Access database
    :param db_path: path to the Access DB
    :return: dataframe of lookup table info
    """
    db_engine = win32com.client.Dispatch("DAO.DBEngine.120")
    db = db_engine.OpenDatabase(db_path)
    fk_list = []
    for rel in db.Relations:
        if rel.ForeignTable.startswith('tbl') or rel.ForeignTable.startswith('xref'):
            field = rel.Fields[0]
            fk_dict = {
                'lookup_column': field.Name,
                'lookup_table': rel.Table,
                'data_column': field.ForeignName,
                'data_table': rel.ForeignTable
            }
            fk_list.append(fk_dict)
    return pd.DataFrame(fk_list)


def main(db_path:str, pg_connection_txt:str, schema_name: str='public', force_schema:bool=False) -> None:
    pg_engine = db_utils.connect_pg_db(pg_connection_txt)
    access_conn = pyodbc.connect(r'DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=' + db_path)

    boolean_responses = pd.read_sql(f'SELECT code, name FROM {schema_name}.boolean_response_codes', pg_engine)\
        .set_index('code')\
        .squeeze(axis=1)

    access_lookup_columns = pd.concat([get_foreign_keys(db_path), UNDEFINED_RELATIONSHIPS])

    data = {}
    remaining_codes = {}
    COLUMNS['column_index'] = COLUMNS.index
    print('Reading Access data...')
    for table_name, info in COLUMNS.groupby('access_table'):
        # Set index so that extracting any series will have the Access columns as keys
        info = info.set_index('access_column')
        replacements = info.dropna(subset=['replace_dict']).replace_dict

        # read data from Access then
        #   replace code values
        #   drop any columns that aren't listed above
        table_data = pd.read_sql('SELECT * FROM ' + table_name, access_conn)\
            .replace(replacements) \
            .loc[:, info.index]

        # Skip any unused table
        if len(table_data) == 0:
            COLUMNS.drop(index=info.column_index, inplace=True)

        # find replacement code values that don't exist in the Postgres DB
        for access_column, replace_dict in replacements.items():
            pg_column = info.loc[access_column].pg_column
            # Skip this column if there's no named Postgres correlate
            if not pg_column:
                continue

            # If all values are accounted for in the replacement dictionary, just continue to avoid querying the
            #   Postgres DB
            remaining = table_data.loc[~table_data[access_column].isin(replace_dict.values()), access_column]
            if len(remaining) == 0:
                continue
            # if not, check that they're in the Postrgres lookup table
            if pg_column not in BOOLEAN_FIELDS:
                pg_lookup_table_name = info.loc[access_column].pg_lookup_table
                lookup_table_name = pg_lookup_table_name if pd.notna(pg_lookup_table_name) else pg_column + 's'
                lookup_table = pd.read_sql(f'SELECT code, name FROM {schema_name}.{lookup_table_name}', pg_engine)\
                    .set_index('code')\
                    .squeeze(axis=1)
            else:
                lookup_table = boolean_responses
            remaining = remaining.loc[~remaining.isin(lookup_table.index)].dropna()

            if len(remaining):
                # First check if any of the remaining values already exist in the Postgres DB, just with a different
                #   "name" value
                access_foreign_key_info = access_lookup_columns.loc[access_lookup_columns.data_column == access_column]\
                    .squeeze()
                access_name_column = re.sub('Code$', '', access_column)
                access_lookup = pd.read_sql(f'SELECT {access_name_column}, {access_column} FROM {access_foreign_key_info.lookup_table}', access_conn)
                # These would-be duplicated names are those where the name already exists in the DB but the code value
                #   doesn't exist in the PG lookup table (i.e., is in the `remaining` Series
                duplicated_access_names = access_lookup.loc[
                    access_lookup[access_name_column].isin(lookup_table) &
                    access_lookup[access_column].isin(remaining)
                ]
                # If there are any of these would-be duplicates, replace the Access value with the PG value
                if len(duplicated_access_names):
                    duplicated_pg_codes = lookup_table.loc[lookup_table.isin(duplicated_access_names[access_name_column])]
                    remaining_replace_dict = duplicated_access_names.merge(
                            duplicated_pg_codes.to_frame().reset_index(),
                            left_on=access_name_column, right_on='name'
                        ).loc[:, [access_column, 'code']]\
                        .set_index(access_column)
                    replaced_remaining = remaining.loc[remaining.isin(remaining_replace_dict.index)]
                    # replace
                    table_data.replace({access_column: remaining_replace_dict.code}, inplace=True)
                    # drop those records from the `remaining` Series
                    remaining.drop(replaced_remaining.index, inplace=True)

                # Check if there are still remaining code values
                if len(remaining):
                    column_index = info.loc[access_column, 'column_index']
                    remaining_codes[column_index] = remaining.unique()

        # rename columns to Postgres DB field names
        data[table_name] = table_data.rename(columns=info.loc[info.pg_column != '', 'pg_column'])

    if 'xrefStructure' in data:
        print('Cleaning structures and reactions tables...')
        # structure interactions need to be pulled out from tblEncounter.EntryCode and xrefStructure
        encounters = data['tblEncounter']
        structure_xref = data['xrefStructure']
        data['xrefStructure'] = encounters.loc[~encounters.structure_interaction_code.isna(), ['IncidentID', 'structure_interaction_code']]\
            .merge(structure_xref, on='IncidentID', how='left')

    if 'tblReaction' in data:
        # dog reactions need to be pulled out from tblEncounter.DogInteractionCode
        dog_reactions = encounters.loc[~encounters.DogInteractionCode.isna(), ['DogInteractionCode', 'IncidentID']] \
            .rename(columns={'DogInteractionCode': 'reaction_code'}) \
            .set_index('IncidentID')
        dog_reactions['is_primary'] = True
        # dog_reactions['reaction_order'] = 1

        reactions = data['tblReaction']
        reactions.loc[reactions.reaction_order.isnull(), 'reaction_order'] = reactions['ReactionNum']
        # Since we don't know the reaction order of dog reactions, add it to the end
        dog_reactions['reaction_order'] = reactions.groupby('IncidentID').reaction_order.max() + 1
        dog_reactions.fillna(1, inplace=True)
        data['tblReaction'] = pd.concat([reactions, dog_reactions.reset_index()])

    # Check to see if there are any code values left from the Access database that haven't been converted to a
    #   Postgres DB code
    lookup_additions = {table_name: pd.DataFrame(columns=['code', 'name']) for table_name in remaining_codes.keys()}
    if len(remaining_codes.keys()):
        # When calling the script, a user can either raise an error if code values haven't been converted or add them
        #   to the Postgres database
        if force_schema:
            print('Getting code values and names to add to Postgres lookup tables...')
            for index, missing_values in remaining_codes.items():
                # Get the Access "name" (i.e., description of the code value) column along with the code value
                column_info = COLUMNS.loc[index]
                access_column = column_info.access_column
                access_lookup_info = access_lookup_columns.loc[
                    (access_lookup_columns.data_column == access_column) &
                    (access_lookup_columns.data_table == column_info.access_table)
                ].squeeze(axis=0)
                access_name_column = re.sub('Code$', '', access_column)
                access_code_column = access_lookup_info.lookup_column
                lookup_sql = (f'''SELECT {access_code_column} AS code, {access_name_column} AS name FROM ''' +
                              access_lookup_info.lookup_table +
                              f''' WHERE {access_code_column} IN ({', '.join(pd.Series(missing_values).astype(str))})'''
                )

                table_additions = pd.read_sql(lookup_sql, access_conn)
                lookup_additions[index] = pd.concat([
                    lookup_additions[index],
                    table_additions
                ])
        else:
            raise RuntimeError(
                "The following fields have values that don't exist in the associated Postgres lookup table:\n" +
                '\n'.join(
                    ['\tAccess table: {access_table}, Access field: {access_column}, '.format(**COLUMNS.loc[index]) +
                     ', '.join(pd.Series(values).astype(str))
                        for index, values in remaining_codes.items()
                    ]
                )
            )

    print('Replacing incident IDs with encounter_ids...')
    incidents = data['tblIncident']
    incident_ids = incidents.incident_id
    for table_name, table_data in data.items():
        if 'IncidentID' in table_data.columns:
            missing_ids = '\t\t\n'.join(table_data.loc[~table_data.IncidentID.isin(incident_ids), 'IncidentID'])
            if len(missing_ids):
                raise RuntimeError(f'''Incident IDs found in {table_name} but not in tblIncident:\n{missing_ids}''')

    # Combine tblIncident and tblEncounter
    encounters = incidents.merge(data['tblEncounter'], left_on='incident_id', right_on='IncidentID', how='left')

    # Convert state abbreviation to numeric code
    states_replace = pd.read_sql(f'SELECT short_name, code FROM {schema_name}.state_codes', pg_engine)\
        .set_index('short_name')\
        .squeeze(axis=1)
    if 'tblPerson' in data:
        person_table = data['tblPerson']
        person_table.state_code = person_table.state_code.replace(states_replace)
        # Makes sure only US and CA state codes are recorded because those are the only ones in the DB
        person_table.loc[~person_table.country_code.isin(COUNTRY_CODES_WITH_STATES), 'state_code'] = None

    if 'tblCIRPerson' in data and len(data['tblCIRPerson']):
        person_table = data['tblCIRPerson']
        person_table.state_code = person_table.state_code.replace(states_replace)
        # Mark CIR records from a "CIR" table
        person_table.loc[:, 'is_from_cir'] = True
        # Makes sure only US and CA state codes are recorded because those are the only ones in the DB
        person_table.loc[~person_table.country_code.isin(COUNTRY_CODES_WITH_STATES), 'state_code'] = None

    if 'tblCIRProperty' in data and len(data['tblCIRProperty']):
        data['tblCIRProperty'].loc[:, 'is_from_cir'] = True

    # Record bear spray data in encounters table
    if 'tblBearSpray' in data:
        # set defaults
        encounters['bear_spray_was_present'] = 0
        encounters['bear_spray_was_used'] = 0
        bear_spray_data = data['tblBearSpray']
        bear_spray_indicent_ids = bear_spray_data.IncidentID
        # Mark encounters where bear spray was present
        bear_spray_encounters = encounters.loc[encounters.incident_id.isin(bear_spray_indicent_ids)]
        encounters.loc[encounters.incident_id.isin(bear_spray_indicent_ids), 'bear_spray_was_present'] = 1
        # Mark encounters where bear spray was used
        bear_spray_used_ids = bear_spray_data.loc[bear_spray_data.bear_spray_use_code.isin(BEAR_SPRAY_USED_CODES), 'IncidentID']
        encounters.loc[encounters.incident_id.isin(bear_spray_used_ids), 'bear_spray_was_used'] = 1
        # Mark encounters where bear spray was/was not successful
        # default to unknown
        encounters.loc[encounters.incident_id.isin(bear_spray_encounters.incident_id), 'bear_spray_was_effective'] = -1
        bear_spray_success_ids = bear_spray_data.loc[bear_spray_data.bear_spray_success_code.isin(BEAR_SPRAY_SUCCESS_CODES), 'IncidentID']
        encounters.loc[encounters.incident_id.isin(bear_spray_success_ids), 'bear_spray_was_effective'] = 1
        bear_spray_failure_ids = bear_spray_data.loc[bear_spray_data.bear_spray_success_code.isin(BEAR_SPRAY_FAILURE_CODES), 'IncidentID']
        encounters.loc[encounters.incident_id.isin(bear_spray_failure_ids), 'bear_spray_was_effective'] = 0

        # For now, don't import the bear spray table
        del data['tblBearSpray']
        COLUMNS.drop(COLUMNS.index[COLUMNS.access_table == 'tblBearSpray'], inplace=True)

    # Get the next encounter ID. Do this outside of the with...as conn block because getting a cursor seems to prevent
    #   any further inserts
    with pg_engine.connect() as conn:
        cursor = conn.execute(sqla.text(f'SELECT max(id) AS max_id FROM {schema_name}.encounters'))
        first_encounter_id = cursor.first().max_id + 1

    # INSERT data
    with pg_engine.connect() as conn:
        if force_schema:
            # Add the missing lookup values
            print('Adding missing lookup values...')
            for column_info_index, lookup_table in lookup_additions.items():
                pg_column_name = COLUMNS.loc[column_info_index, 'pg_column']
                table_name = pg_column_name + 's'
                lookup_table.drop_duplicates(subset=['code']).to_sql(table_name, conn, schema=schema_name, if_exists='append', index=False)

        # Drop extraneous encounters columns
        pg_inspector = sqla.inspect(pg_engine)
        pg_columns = [c['name'] for c in pg_inspector.get_columns('encounters')]
        extra_columns = encounters.columns[~encounters.columns.isin(pg_columns)]
        encounters.drop(columns=extra_columns, inplace=True)

        # insert encounters with the encounter ID already populated so that we know the ID values for related tables
        print('Inserting encounters...')
        encounters['id'] = range(first_encounter_id, first_encounter_id + len(encounters))
        encounters.set_index('id', inplace=True)
        encounters.to_sql('encounters', conn, schema=schema_name, if_exists='append')

        # Replace IncidentID with encounter_id
        incident_id_lookup = pd.Series(encounters.index, index=encounters.incident_id)
        # Drop tblEncounter and tblIncident since they were just INSERTed with encounters
        related_data_columns = COLUMNS.loc[~COLUMNS.access_table.isin(['tblIncident', 'tblEncounter'])]
        incident_id_tables = related_data_columns.loc[related_data_columns.access_column == 'IncidentID', 'access_table'].unique()
        for access_table in incident_id_tables:
            # skip tblBearSpray because I'm not supporting it for now
            if access_table == 'tblBearSpray':
                continue
            table_data = data[access_table]
            table_data.loc[:, 'encounter_id'] = table_data.loc[:, 'IncidentID'].replace(incident_id_lookup)

        # Import all other tables
        pg_table_dict = related_data_columns.loc[:, ['access_table', 'pg_table']].drop_duplicates().set_index('access_table').squeeze(axis=1)
        print('Inserting other data...')
        for access_table, pg_table in pg_table_dict.items():
            print('...' + pg_table)
            table_data = data[access_table]
            pg_columns = [c['name'] for c in pg_inspector.get_columns(pg_table)]
            extra_columns = table_data.columns[~table_data.columns.isin(pg_columns)]
            if len(extra_columns):
                # If the user wants to force the insert, drop the extra columns
                if force_schema:
                    table_data.drop(columns=extra_columns, inplace=True)
                # Otherwise, raise
                else:
                    raise RuntimeError(f'The following columns exist in the Access table "{access_table}" but do not' +
                                       f' exist in the Postgres table "{pg_table}":\n\t-' +
                                        '\n\t-'.join(extra_columns) +
                                       '\nTo automatically remove these columns before inserting data, run this' +
                                       ' script with force_schema=True'
                        )
            try:
                table_data.to_sql(pg_table, conn, schema=schema_name, if_exists='append', index=False)
            except Exception as e:
                print(e)
                import pdb; pdb.set_trace()

if __name__ == '__main__':
    main(*sys.argv[1:])