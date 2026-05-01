
import datetime
import json
import os
from sqlalchemy import (
	asc, 
	create_engine, 
	desc
)
from sqlalchemy.engine import Engine, URL
from sqlalchemy.engine.row import Row as sqla_Row
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql.elements import BinaryExpression

from typing import Any, Mapping
import os
import sys

sys.path.append(
	os.path.join(os.path.abspath(
		os.path.dirname(__file__)), 
		'../../py/resource'
	)
)
from tables import model_dict


CONFIG_FILE = '//inpdenaterm01/bhims/config/bhims_config.json'

with open(CONFIG_FILE) as f:
	config = json.load(f)

tables = model_dict()

def get_unique_id() -> str:
	"""equivalent to php uniqid()"""
	return hex(int(datetime.now().timestamp() * 10000000))[2:]


def get_content_dir(dirname='attachments'):
	"""helper function to get the path to a subdirectory of root"""
	return os.path.join(os.path.dirname(__file__), '..', dirname)


def get_engine(access='read', schema='public'):
	url = URL.create('postgresql', **config[f'DB_{access.upper()}_PARAMS'])
	return create_engine(url).execution_options(schema_translate_map={'public': schema, None: schema})


def get_environment() -> str:
	""" return a string indicating whether this is the production or development env."""
	return 'prod' if '\\prod\\' in os.path.abspath(__file__) else 'dev'


def get_schema() -> str:
	""" return the database schema based on the current environment"""
	return 'public' if get_environment() == 'prod' else 'dev'

schema = get_schema()
ReadSession = sessionmaker(get_engine(access='read', schema=schema))
WriteSession = sessionmaker(get_engine(access='write', schema=schema))

def get_where_clause(
		table_dict: Mapping, 
		table_name: str, 
		column_name: str, 
		operator: str='', 
		comparand: str | list | None=None
	) -> BinaryExpression:
	"""
	Return a sqlalchemy.sql.elements.BinaryExpression instance constructed from the

	:parameters:
	----------------
	table_dict: dict
		dictionary of table_name: sqlalachemy.orm.automap class as returned by get_tables()
	table_name: str
		name of the table for this clause
	column_name: str
		name of the column for this clause
	operator: str, optional
		SQL operator. This must be one of the keys in the SQLA_OPERATORS dict or an empty string. If it's empty, column_name must refer to a boolean field.
	comparand: str or list, optional
		The value to compare the column's values to. If the operator is 'IN' or 'BETWEEN', comparand needs to be a list (for BETWEEN, the list needs to be of length 2)

	:return: sqlalchemy.sql.elements.BinaryExpression
	"""

	SQLA_OPERATORS = {
		'=':  '__eq__',
		'<>': '__ne__',
		'>':  '__gt__',
		'<':  '__lt__',
		'>=': '__ge__',
		'<=': '__le__',
		'in': 		'in_',
		'not in':   'not_in',
		'is': 		'is_',
		'is not': 	'is_not', 
		'like': 	'like',
		'not like': 'not_like',
		'between': 	'between'
	}

	if not table_name in table_dict:
		raise ValueError(f'There is no table with name "{table_name}" in the database')
	else:
		table = table_dict[table_name]

	if not hasattr(table, column_name):
		raise ValueError(f'The table "{table_name}" does not have the column "{column_name}"')
	else:
		column = getattr(table, column_name)

	if operator:
		operator = operator.lower()
		if not operator in SQLA_OPERATORS:
			raise ValueError(f'SQL operator not recognized: "{operator}"')
		
		sqla_operator_name = SQLA_OPERATORS[operator]
		if not hasattr(column, sqla_operator_name):
			raise ValueError(f'There is no matching operator "{operator}" for column "{column_name}"')

		if str(comparand).lower() == 'null':
			comparand = None

		sqla_operator = getattr(column, sqla_operator_name)
		
		# If the operator is BETWEEN, then
		expression = (
			sqla_operator(*comparand)
			if sqla_operator_name == 'between'
			else sqla_operator(comparand)
		)
	else:
		expression = column

	return expression


def sanitize_query_value(value: Any) -> Any:
	"""
	Python datetime.date* types are converted to strings in the JSON response 
	with a GMT timezone. When converting to a Javascript Date, this pushes the 
	local time back 8/9 hours (depending on Daylight Savings). To prevent this,
	just convert all datetime.date* types to string. Then when the Javascript
	Date() constructor is called, it assumes local time and converts 
	appropriately
	
	:parameters:
	------------
	value: Any
		The value returned for a single column in a SQLAlchemy Query result

	:return: value of any type (except datetime/date)
	"""
	if isinstance(value, (datetime.date, datetime.datetime)):
		value = value.strftime('%Y-%m-%d %H:%M')
	elif isinstance(value, datetime.time):
		value = value.strftime('%H:%M')

	return value


def orm_to_dict(
		orm_class_instance: Any, 
		selected_columns:list[str]=[], 
		prohibited_columns: dict={}
	) -> dict:
	"""
	Helper function to process an ORM class instance into a dictionary
	"""	
	prohibited_columns = (
		prohibited_columns or 
		config.get('PHOHIBITED_QUERY_COLUMNS') or 
		{}
	)
	exclude_columns = prohibited_columns.get(orm_class_instance.__table__.name) or []
	
	# If specific columns weren't specified, return all
	columns = (
		selected_columns or 
		[column.name for column in orm_class_instance.__table__.columns]
	)

	return {
		column_name: sanitize_query_value(getattr(orm_class_instance, column_name))
		for column_name in columns
		if column_name not in exclude_columns
	}



def select_result_to_dict(cursor) -> list:
	"""
	Helper function to process results from SQLAlchemy result cursor resulting 
	from a .execute() call
	"""
	return ([ 
		{
			column_name: sanitize_query_value(value)
			for column_name, value in row._asdict().items()
		} 
		for row in cursor.all()
	])


# Define in global scope so it can be imported and used in this module


def query_db(query_params:dict):

	sql = query_params.get('sql')
	where_clauses = query_params.get('where') or {}
	selects = query_params.get('select') or {}
	table_names = (
		query_params.get('tables') or 
		set([*where_clauses.keys(), *selects.keys()])
	)

	prohibited_columns = config.get('PHOHIBITED_QUERY_COLUMNS') or {}
	
	# If raw SQL was passed, execute it
	with ReadSession() as session:
		if sql:
			# List parameters have to be tuples
			params = {
				name: tuple(param) if isinstance(param, list) 
				else param 
				for name, param in (query_params.get('params') or {}).items()
			}
			result = session.execute(sql.replace('{schema}', schema), params)
			
			response_data = select_result_to_dict(result)

		# Otherwise, use the SQLAlchemy ORM
		elif len(table_names):
			
			result = (session
				.query(*[tables[table_name_] for table_name_ in table_names])
				.where(*[
					get_where_clause(
						tables,
						table_name,
						where.get('column_name'), 
						where.get('operator') or '', 
						where.get('comparand')
					)
					for table_name, table_wheres in where_clauses.items() 
					for where in table_wheres
					if where.get('column_name')
				])
			)

			joins = query_params.get('joins')
			if joins:
				for join_ in joins: 
					left_table = tables[join_.get('left_table')]
					right_table = tables[join_.get('right_table')]
					left_table_column = getattr(
						left_table, 
						join_.get('left_table_column')
					)
					right_table_column = getattr(
						right_table, 
						join_.get('right_table_column')
					)
					result = result.join(
						right_table, 
						left_table_column == right_table_column, 
						isouter=join_.get('is_left'),
						full=join_.get('is_full')
					)

			order_by_clauses = query_params.get('order_by')
			if order_by_clauses:
				# If there are multiple ORDER BY columns, successive calls to 
				#	.order_by will modify the result accordingly
				for order_by in order_by_clauses:
					table = tables[order_by['table_name']]
					order = asc # function from sqla
					if 'order' in order_by:
						order = (
							asc if order_by['order']
								.lower().startswith('asc') 
							else desc
						)
					result = result.order_by(
						order(
							getattr(table, order_by['column_name'])
						)
					)


			response_data = []
			if result.count():
				for row in result:
					row_data = {}
					# If there was more than one table passed to query(), the 
					#	result will be a sqla.engine.row.Row, with separate 
					#	class instances for each table. In that case, iterate
					#	through each of them and combine
					if isinstance(row, sqla_Row): 
						for orm_instance in row:
							selected_columns = selects.get(
									orm_instance.__table__.name
								) or []
							row_data = {
								**row_data, 
								**orm_to_dict(
									orm_instance, 
									selected_columns=selected_columns
								)
							}
					else:
						row_data = orm_to_dict(row)
					# Add to the list of dicts, which will 
					response_data.append(row_data)
		else:
			raise RuntimeError(
				'Either "sql", "tables", or "where" given in reequest data. Request data:\n' + 
				json.dumps(query_params, indent=4)
			)
		
		return response_data
	

__all__ = [
	'CONFIG_FILE',
	'get_engine',
	'get_environment',
	'get_schema',
	'get_where_clause',
	'sanitize_query_value',
	'orm_to_dict',
	'select_result_to_dict',
	'query_db',
]