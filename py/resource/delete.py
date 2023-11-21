from tables import model_dict
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.engine.base import Engine
from sqlalchemy.orm import Session, joinedload
from urllib.parse import quote
import sys
import config
config.initialize('dev')
db_vars = config.read('database:bhims')
db_vars.update(password=quote(db_vars['password']))
db_uri = "postgresql://{username}:{password}@{host}:{port}/{name}".format(**db_vars)
engine = create_engine(db_uri)
session = Session(bind=engine)
db_models = model_dict()
query_stmt = str(session.query(db_models['assessment']).statement)
lookup_table_info = pd.read_sql('TABLE export_code_value_map_view', engine)
code_names = lookup_table_info.set_index('coded_value').readable_value
table = 'encounters'
joined_lookup_tables = lookup_table_info.loc[lookup_table_info.table_name == table]
#public.boolean_response_codes AS boolean_response_codes ON boolean_response_codes.code = public.assessment.did_react_properly
# print([
# 	f'public.{info.lookup_table} AS _{i} ON _{i}.code = public.{info.table_name}.{info.field_name}' 
# 	for i, info in joined_lookup_tables.iterrows()
# ])

query_stmt = str(session.query(db_models[table]).statement)
join_stmts = query_stmt.split('FROM')[-1].split('LEFT OUTER JOIN')[1:]
print([join.strip().replace('_1', '') for join in join_stmts])