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
from argparse import ArgumentParser, Namespace
from urllib.parse import quote
from typing import Dict, List, Optional, Tuple, Union, Any

import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.engine.base import Engine
from sqlalchemy.orm import Session, joinedload

try:
    import py.resource.config as config
    from py.resource.tables import model_dict
except:
    import sys, os
    sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../resource'))
    import config
    from tables import model_dict


class DotDict(dict):
    """
    dot.notation access to dictionary attributes
    from https://stackoverflow.com/a/23689767
    """
    __getattr__ = dict.get
    __setattr__ = dict.__setitem__
    __delattr__ = dict.__delitem__


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


def select_encounters(criteria_dict: Dict, engine: Engine) -> Tuple:
    """Determine which encounter ids to filter all tables on.

    Example: If the user asked for encounters with female bears, we need to get the ids of all encounters had a female
    bear (not exclusively) and then filter all other tables by those encounter ids.

    Args:
        criteria_dict: the filtering criteria portion of parameters json passed from the frontend.

        {   
            case_sensitive: False,
            where: {
                "encounter_locations":{
                    "backcountry_unit_code": {"value":"(31, 74)","operator":"IN"}
                },
                "encounters": {
                    "group_size_encounter": {"value":"2","operator":">"},
                    "bear_charged": {"value": "1", "operator": "="}
                } ...
            }
        }

    Returns:
        encounter_ids: A list of encounter ids to filter each table query by.
    """
    wheres = []
    joins = []

    for table, criteria in criteria_dict['where'].items():

        if table != 'encounters':
            joins.append(f"{table} on {table}.encounter_id = encounters.id")

        for field, field_filter in criteria.items():
            # If the query should be case-insensitive and this field is a text field, make the comparison 
            #   all lowercase
            where_clause = (
                f"lower({table}.{field}) {field_filter['operator']} lower({field_filter['value']})"
                if field_filter.get('type', '') == 'text' and criteria_dict.get('case_sensitive', False) else
                f"{table}.{field} {field_filter['operator']} {field_filter['value']}"
            )
            wheres.append(where_clause)

    query = build_query_string(table='encounters',
                               selects=['distinct(encounters.id)'],
                               wheres=wheres,
                               joins=joins)
    encounter_ids = tuple(r[0] for r in engine.execute(query))

    return encounter_ids


def generate_query_parameters(query_json: Dict, engine: Engine, session: Session) -> Dict:
    """From the frontend query parameters json, build the proper sql query parameters.

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
    encounter_ids = select_encounters(criteria_dict, engine) if criteria_dict else None

    if include_codes:
        lookup_table_info = pd.read_sql('TABLE export_code_value_map_view', engine)
        lookup_table_info['join_alias'] = '_' + lookup_table_info.index.astype(str)
        code_names = {info.coded_value: f'_{i}.name AS {info.readable_value}' for i, info in lookup_table_info.iterrows()}

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
            code_name_selects = [f"{code_names[select]}" for select in selects if code_names.get(select)]
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
            joined_lookup_tables = lookup_table_info.loc[lookup_table_info.table_name == table]
            joins.extend([
                f'public.{info.lookup_table} AS _{i} ON _{i}.code = public.{info.table_name}.{info.field_name}' 
                for i, info in joined_lookup_tables.iterrows()
            ])

        query_components[table] = {'selects': selects, 'wheres': wheres, 'joins':  joins}

    return query_components


def export_data(args: Namespace) -> None:

    # Read config file and initialize database connection.
    config.initialize(args.environment)
    db_vars = config.read('database:bhims')
    db_vars.update(password=quote(db_vars['password']))  # Required step should password contain an @ symbol.
    db_uri = "postgresql://{username}:{password}@{host}:{port}/{name}".format(**db_vars)

    engine = create_engine(db_uri, echo=args.verbose)
    session = Session(bind=engine)

    query_params = generate_query_parameters(args.input, engine, session)

    # Remove any tables requested for a specific environment.
    table_exclusions = config.read('script', 'table_exclusions').split(',')
    for exclusion in table_exclusions:
        query_params.pop(exclusion, None)

    output_path = f"{config.read('script', 'export_cache')}/bhims_export_{args.request_id}.xlsx"
    with pd.ExcelWriter(output_path, engine='xlsxwriter') as writer:
        for table, params in query_params.items():
            query = build_query_string(table=table,
                                       selects=params['selects'],
                                       joins=params['joins'],
                                       wheres=params['wheres'])
            df = pd.read_sql(query, engine)
            df.to_excel(writer, sheet_name=table, index=False)

    return output_path


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

    export_data(args)