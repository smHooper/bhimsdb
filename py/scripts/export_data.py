"""Query BHIMS data for export.

This script is intended to be used in conjunction with the BHIMS web application to downloaded data queried by users.
If a user would like export their query results, the web application will make a call to this script.

Example Input:
    {
        "include_codes": true,
        "fields": {
            "encounter_locations": ["latitude", "longitude", "backcountry_unit_code", "habitat_type_code"],
            "encounters": ["id", "duration_minutes", "group_size_encounter", "bear_charged"]
        },
        "criteria": {
            "encounter_locations":{
                "backcountry_unit_code": {"value":"(31, 74)","operator":"IN"}
            },
            "encounters": {
                "group_size_encounter": {"value":"2","operator":">"},
                "bear_charged": {"value": "1", "operator": "="}
            }
        }
    }

@Author: Adina Zucker
@Date: 2022-05-07
"""

import json
from argparse import ArgumentParser
from urllib.parse import quote
from typing import Dict, List, Optional, Tuple

import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

import py.resource.config as config
from py.resource.tables import model_dict


BHIMS_CODE_NAMES = {
    'assessment.management_action_code': 'management_action_codes.name as management_action',
    'assessment.management_classification_code': 'management_classification_codes.name as management_classification',
    'assessment.probable_cause_code': 'probable_cause_codes.name as probable_cause',
    'attachments.file_type_code': 'file_type_codes.name as file_type',
    'bears.bear_species_code': 'bear_species_codes.name as bear_species',
    'bears.bear_sex_code': 'sex_codes.name as bear_sex',
    'bears.bear_color_code': 'bear_color_codes.name as bear_color',
    'bears.bear_injury_code': 'bear_injury_codes.name as bear_injury',
    'bears.previously_encountered': 'boolean_response_codes.name as previously_encountered_boolean',
    'deterrents_used.deterrent_type_code': 'deterrent_type_codes.name as deterrent_type',
    'encounter_locations.backcountry_unit_code': 'backcountry_unit_codes.name as backcountry_unit',
    'encounter_locations.datum_code': 'datum_codes.name as datum',
    'encounter_locations.habitat_type_code': 'habitat_type_codes.name as habitat_type',
    'encounter_locations.location_accuracy_code': 'location_accuracy_codes as location_accuracy',
    'encounter_locations.place_name_code': 'place_name_codes.name as place_name',
    'encounter_locations.road_name_code': 'road_name_codes.name as road_name',
    'encounter_locations.visibility_code': 'visibility_codes.name as visibility',
    'encounters.bear_charged': 'boolean_response_codes.name as bear_charged_boolean',
    'encounters.bear_cohort_code': 'bear_cohort_codes.name as bear_cohort',
    'encounters.bear_obtained_food': 'boolean_response_codes.name as bear_obtained_food_boolean',
    'encounters.bear_spray_was_effective': 'boolean_response_codes.name as bear_spray_was_effective_boolean',
    'encounters.bear_spray_used': 'boolean_response_codes.name as bear_spray_used_boolean',
    'encounters.food_present_code': 'food_present_codes.name as food_present',
    'encounters.general_human_activity_code': 'general_human_activity_codes.name as general_human_activity',
    'encounters.human_group_type_code': 'human_group_type_codes.name as human_group_type',
    'encounters.initial_bear_action_code': 'initial_bear_action_codes.name as initial_bear_action',
    'encounters.initial_human_action_code': 'initial_human_action_codes.name as initial_human_action',
    'encounters.reported_probable_cause_code': 'reported_probable_cause_codes.name as reported_probable_cause',
    'encounters.was_making_noise': 'boolean_response_codes.name as was_making_noise_boolean',
    'people.country_code': 'country_codes.name as country',
    'reactions.reaction_code': 'reaction_codes.name as reaction',
    'structure_interactions.structure_interaction_code': 'structure_interaction_codes.name as structure_interaction',
    'structure_interactions.structure_type_code': 'structure_type_codes.name as structure_type'
}


def build_query_string(table: str, selects: List, joins: Optional[List] = None, wheres: Optional[List] = None) -> str:
    """Given all sql query components, build a raw sql query string.
    NOTE: All joins are left joins and all where clauses will be ANDed together.

    Args:
        table: The name of the table to query.
        selects: A list of fields to select from the table. Format: table1.field
        joins: A list of join clauses. Example: ['join table2 on table1.id = table2.encounter_id']
        wheres: A list of where clauses. Example: ['table1.num_people > 2', 'table1.bears = 1']

    Returns:
        query_string: The raw query string built from the individual query components.
    """
    query_string = f"SELECT {', '.join(selects)} from {table}"
    if joins:
        query_string = f"{query_string} LEFT JOIN {' LEFT JOIN '.join(joins)}"
    if wheres:
        query_string = f"{query_string} WHERE {' AND '.join(wheres)}"

    return query_string


def select_encounters(criteria_dict: Dict) -> Tuple:
    """Determine which encounter ids to filter all tables on.

    Example: If the user asked for encounters with female bears, we need to get the ids of all encounters had a female
    bear (not exclusively) and then filter all other tables by those encounter ids.

    Args:
        criteria_dict: the filtering criteria portion of parameters json passed from the php front-end.

        {
            "encounter_locations":{
                "backcountry_unit_code": {"value":"(31, 74)","operator":"IN"}
            },
            "encounters": {
                "group_size_encounter": {"value":"2","operator":">"},
                "bear_charged": {"value": "1", "operator": "="}
            } ...
        }

    Returns:
        encounter_ids: A list of encounter ids to filter each table query by.
    """
    wheres = []
    joins = []

    for table, criteria in criteria_dict.items():

        if table != 'encounters':
            joins.append(f"{table} on {table}.encounter_id = encounters.id")

        for field, field_filter in criteria.items():
            wheres.append(f"{table}.{field} {field_filter['operator']} {field_filter['value']}")

    query = build_query_string(table='encounters',
                               selects=['distinct(encounters.id)'],
                               wheres=wheres,
                               joins=joins)
    encounter_ids = tuple(r[0] for r in engine.execute(query))

    return encounter_ids


def generate_query_parameters(query_json: Dict) -> Dict:
    """From the php query parameters json, build the proper sql query parameters.

    Args:
        query_json: The parameters json passed from the php front-end.

    Returns:
        A dictionary of select, join, and where clauses per table.

        {
            'bears': {
                'selects': []
                'wheres': []
                'joins': []
            } ...
        }
    """
    query_components = {}
    print(query_json)
    
    include_codes = query_json['include_codes']
    fields_dict = query_json['fields']
    criteria_dict = query_json['criteria']
    db_models = model_dict()

    # Determine encounter_ids to filter by if there are filtering criteria.
    encounter_ids = select_encounters(criteria_dict) if criteria_dict else None

    # Parse out and generate the selection fields and where clauses required for every table query from the query json.
    #
    # NOTE: Every table that needs to be queried will have a json in the fields attribute. If there are no filters for
    #  a table, no where clauses will appear in the json criteria attribute.
    for table, fields in fields_dict.items():

        # ---- SELECTS ---- #

        # Specify the table name in front of each field to be as explicit as possible as some tables will be joined.
        selects = [f"{table}.id", f"{table}.encounter_id"] if table != 'encounters' else [f"{table}.id"]
        selects.extend([f"{table}.{field}" for field in fields])

        if include_codes:
            code_name_selects = [f"{BHIMS_CODE_NAMES[select]}" for select in selects if BHIMS_CODE_NAMES.get(select)]
            selects.extend(code_name_selects)

        # ---- WHERES ---- #

        wheres = []
        if table == 'encounters' and encounter_ids:
            wheres = [f"encounters.id in {encounter_ids}"]
        elif table != 'encounters' and encounter_ids:
            wheres = [f"{table}.encounter_id in {encounter_ids}"]

        # ---- JOINS ---- #

        joins = []
        if include_codes:
            query_stmt = str(session.query(db_models[table]).statement)
            join_stmts = query_stmt.split('FROM')[-1].split('LEFT OUTER JOIN')[1:]
            joins.extend([join.strip().replace('_1', '') for join in join_stmts])

        query_components[table] = {'selects': selects, 'wheres': wheres, 'joins':  joins}

    return query_components


if __name__ == "__main__":

    parser = ArgumentParser()
    parser.add_argument('-e', '--environment', required=True,
                        help='The environment in which to run the script.')
    parser.add_argument('-r', '--request_id', required=True,
                        help='Unique ID value for the data export request.')
    parser.add_argument('-i', '--input', required=True, type=json.loads,
                        help='Input SQL json.')
    parser.add_argument('-v', '--verbose', action='store_true',
                        help='Output query details.')
    args = parser.parse_args()

    # Read config file and initialize database connection.
    config.initialize(args.environment)
    db_vars = config.read('database:bhims')
    db_vars.update(password=quote(db_vars['password']))  # Required step should password contain an @ symbol.
    db_uri = "postgresql://{username}:{password}@{host}:{port}/{name}".format(**db_vars)

    engine = create_engine(db_uri, echo=args.verbose)
    session = Session(bind=engine)

    query_params = generate_query_parameters(args.input)

    # Remove any tables requested for a specific environment.
    table_exclusions = config.read('script', 'table_exclusions').split(',')
    for exclusion in table_exclusions:
        query_params.pop(exclusion, None)

    with pd.ExcelWriter(f"{config.read('script', 'export_cache')}/bhims_export_{args.request_id}.xlsx", engine='xlsxwriter') as writer:
        for table, params in query_params.items():
            query = build_query_string(table=table,
                                       selects=params['selects'],
                                       joins=params['joins'],
                                       wheres=params['wheres'])
            df = pd.read_sql(query, engine)
            df.to_excel(writer, sheet_name=table, index=False)
