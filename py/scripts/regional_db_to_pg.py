import sys
import os
import re
import sqlalchemy
import pyodbc
import warnings
import pandas as pd
from datetime import datetime

import db_utils

pd.options.mode.chained_assignment = None # Turn off setting as copy warning


COLUMNS = pd.DataFrame([
    {'access_table': 'tblEncounters', 'access_column': 'IncidentID',                'pg_table': 'encounters', 'pg_column': 'incident_id'},
    {'access_table': 'tblEncounters', 'access_column': 'GeneralActivityCode',       'pg_table': 'encounters', 'pg_column': 'general_human_activity_code'},
    {'access_table': 'tblEncounters', 'access_column': 'HumanPriorActivityCode',    'pg_table': 'encounters', 'pg_column': 'initial_human_activity_code'},
    {'access_table': 'tblEncounters', 'access_column': 'BearPriorActivityCode',     'pg_table': 'encounters', 'pg_column': 'initial_bear_activity_code'},
    {'access_table': 'tblEncounters', 'access_column': 'InitialDistanceM',          'pg_table': 'encounters', 'pg_column': 'initial_distance_m'},
    {'access_table': 'tblEncounters', 'access_column': 'ClosestDistanceM',          'pg_table': 'encounters', 'pg_column': 'closest_distance_m'},
    {'access_table': 'tblEncounters', 'access_column': 'ChargeFromDistanceM',       'pg_table': 'encounters', 'pg_column': 'greatest_charge_distance_m'},
    {'access_table': 'tblEncounters', 'access_column': 'NoiseMakingCode',           'pg_table': 'encounters', 'pg_column': 'making_noise_code'},
    {'access_table': 'tblEncounters', 'access_column': 'ChargeCount',               'pg_table': 'encounters', 'pg_column': 'charge_count'},
    {'access_table': 'tblEncounters', 'access_column': 'Narrative',                 'pg_table': 'encounters', 'pg_column': 'narrative'},
    {'access_table': 'tblEncounters', 'access_column': 'FirearmPossessionCode',     'pg_table': 'encounters', 'pg_column': 'firearm_was_present'},
    {'access_table': 'tblEncounters', 'access_column': 'BearSprayPossessionCode',   'pg_table': 'encounters', 'pg_column': 'bear_spray_was_present'},
    {'access_table': 'tblAnalysis',   'access_column': 'AvoidanceNarrative', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'AvoidanceScore', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'Comments', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'DataQualityCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'DeterrenceScore', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'EntryStatusCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'HumanInjuryCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'OverallVisibility2Code', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'ProbableCauseCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblAnalysis',   'access_column': 'ProbableResponsibilityCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBear',       'access_column': 'BearAgeCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBear',       'access_column': 'BearColorCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBear',       'access_column': 'BearInjuryCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBear',       'access_column': 'BearNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBear',       'access_column': 'BearParkID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBear',       'access_column': 'BearSpeciesCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBear',       'access_column': 'Description', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBear',       'access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBear',       'access_column': 'IsBearSuspect', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBear',       'access_column': 'SexCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBearSpray',  'access_column': 'BearSprayDoseCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBearSpray',  'access_column': 'BearSprayManufacturer', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBearSpray',  'access_column': 'BearSprayNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBearSpray',  'access_column': 'BearSpraySuccessCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBearSpray',  'access_column': 'BearSprayUseCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblBearSpray',  'access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'BroadcastTime', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'CaseIncidentNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'ClearedDate', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'DepositionNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'HowReported', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'IncidentDate', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'IncidentDay', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'IncidentDesc', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'IncidentDetails', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'InvestigatedBy', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'InvestigatedDate', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'IsCIRApproved', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'LocationCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'LocationDesc', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'OffenseCode1', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'OffenseCode2', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'OffenseCode3', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'OrganizationCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'OrganizationName', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'PropertyCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'RangerNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'ReceivedBy', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'ReceivedDate', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'ReportedBy', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'ReportedByAddress1', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'ReportedByAddress2', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'ReportedByHomePhone', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'ReportedByWorkPhone', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'TotalPropertyValue', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIR',        'access_column': 'TotalRecoverValue', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'Address1', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'Address2', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'Age', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'BirthDate', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'City', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'Country', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'FirstName', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'IsPrimaryPerson', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'LastName', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'PersonNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'PhoneNumber', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'RaceCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'ResidencyCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'SexCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'State', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRPerson',  'access_column': 'ZipCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRProperty','access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRProperty','access_column': 'IsPropertyInControl', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRProperty','access_column': 'PropertyDesc', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRProperty','access_column': 'PropertyLoss', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRProperty','access_column': 'PropertyNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRProperty','access_column': 'PropertyQty', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRProperty','access_column': 'PropertyValue', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRProperty','access_column': 'RecoverDate', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblCIRProperty','access_column': 'RecoverValue', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'BearDeathCount', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'BearPriorActivityCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'BearSprayPossessionCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'ChargeCount', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'ChargeFromDistanceM', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'ClosestDistanceM', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'DogInteractionCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'EntryCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'FirearmPossessionCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'FoodPresentCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'FoodRewardCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'GeneralActivityCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'HumanPriorActivityCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'InitialDistanceM', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'Narrative', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'NoiseMakingCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblEncounter',  'access_column': 'PropertyDamageCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmCaliberCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmManufacturer', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmNonLethalCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmSuccessCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblFirearm',    'access_column': 'FirearmUseCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblFirearm',    'access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblFirearm',    'access_column': 'ShotsFiredCount', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'IncidentDate',              'pg_table': 'encounters', 'pg_column': 'start_date'},
    {'access_table': 'tblIncident',   'access_column': 'IncidentTime',              'pg_table': 'encounters', 'pg_column': 'start_time'},
    {'access_table': 'tblIncident',   'access_column': 'TimeCode',                  'pg_table': 'encounters', 'pg_column': 'daylight_code'},
    {'access_table': 'tblIncident',   'access_column': 'DurationCode',              'pg_table': 'encounters', 'pg_column': 'duration_code'},
    {'access_table': 'tblIncident',   'access_column': 'HumanInvolvementCode',      'pg_table': 'encounters', 'pg_column': 'people_present_code'},
    {'access_table': 'tblIncident',   'access_column': 'RecievedSafetyCode',        'pg_table': 'encounters', 'pg_column': 'received_safety_info'},
    {'access_table': 'tblIncident',   'access_column': 'GroupTypeCode',             'pg_table': 'encounters', 'pg_column': 'human_group_type_code'},
    {'access_table': 'tblIncident',   'access_column': 'TotalGroupSize',            'pg_table': 'encounters', 'pg_column': 'group_size_total'},
    {'access_table': 'tblIncident',   'access_column': 'EncounterGroupSize',        'pg_table': 'encounters', 'pg_column': 'group_size_encounter'},
    {'access_table': 'tblIncident',   'access_column': 'CohortCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'DurationMinutes', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'IncidentNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'IncidentRecordDate', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'IncidentRecorderName', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'InfoSourceCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'InsertBy', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'InsertDate', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'InteractGroupSize', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'IsCIRRequired', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'LastUpdateBy', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'LastUpdateDate', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'OriginalIncidentNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'OriginalSourceNotes', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'ParkCode',                  'pg_table': 'encounters', 'pg_column': 'park_unit_code'},
    {'access_table': 'tblIncident',   'access_column': 'ParkFormNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'ReceivedSafetyCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'RecordTypeCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblIncident',   'access_column': 'Time2Code', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'DatumCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'FreqUseSiteCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'HabitatDesc', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'HabitatVisibilityDesc', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'HasMapPoint', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'LatitudeDecDeg', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'LocationDescription', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'LocationQualityCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'LocationSourceCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'LongitudeDecDeg', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'OverallVisibilityCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'PlaceName', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'UTMEasting', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'UTMNorthing', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblLocation',   'access_column': 'UTMZone', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'Address1', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'Address2', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'Age', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'BirthDate', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'City', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'Country', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'FirstName', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'HumanAgeCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'IsPrimaryPerson', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'LastName', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'PersonNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'PhoneNumber', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'RaceCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'ResidencyCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'SexCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'State', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblPerson',     'access_column': 'ZipCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblProperty',   'access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblProperty',   'access_column': 'IsPropertyInControl', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblProperty',   'access_column': 'PropertyDesc', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblProperty',   'access_column': 'PropertyLoss', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblProperty',   'access_column': 'PropertyNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblProperty',   'access_column': 'PropertyQty', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblProperty',   'access_column': 'PropertyValue', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblProperty',   'access_column': 'RecoverDate', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblProperty',   'access_column': 'RecoverValue', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblReaction',   'access_column': 'IncidentID', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblReaction',   'access_column': 'ReactionByCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblReaction',   'access_column': 'ReactionCode', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblReaction',   'access_column': 'ReactionNum', 'pg_table': '', 'pg_column': ''},
    {'access_table': 'tblReaction',   'access_column': 'ReactionOrder', 'pg_table': '', 'pg_column': ''}
])

BOOLEAN_FIELDS = [
    'FirearmPossessionCode',
    'BearSprayPossessionCode',
    'ReceivedSafetyCode'
]


GENERAL_HUMAN_ACTIVITY_REPLACE = {
    30: 7,
    200: 5,
}

INITITAL_HUMAN_ACTIVITY_REPLACE = {
    10: 5,
    24: 2,
    30: 3,
    40: 4,
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
    70: 2,
    130: 3
}

def main(db_path):

    # import remaining park alpha codes
    return