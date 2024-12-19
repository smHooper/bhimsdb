import os, sys
import traceback
import re

from sqlalchemy import create_engine, select, update, text as sqlatext
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool
import bcrypt
#import pandas as pd
import smtplib
import base64
from uuid import uuid4

from datetime import datetime
from argparse import Namespace

from flask import Flask, render_template, request, json, url_for
from flask_mail import Mail, Message

sys.path.append(os.path.join(os.path.abspath(os.path.dirname(__file__)), '../../py/scripts'))
from export_data import export_data
from tables import *


CONFIG_FILE = '//inpdenaterm01/bhims/config/bhims_config.json'

app = Flask(__name__)

# Error handling
@app.errorhandler(500)
def internal_server_error(error):
	return 'ERROR: Internal Server Error.\n' + traceback.format_exc()


# Load config
if not os.path.isfile(CONFIG_FILE):
	raise IOError(f'CONFIG_FILE does not exists: {CONFIG_FILE}')
if not app.config.from_file(CONFIG_FILE, load=json.load):
	raise IOError(f'Could not read CONFIG_FILE: {CONFIG_FILE}')


@app.route('/flask/environment', methods=['GET'])
def get_environment() -> str:
	""" return a string indicating whether this is the production or development env."""
	return 'prod' if '\\prod\\' in os.path.abspath(__file__) else 'dev'


def get_schema() -> str:
	"""
	Return the appropriate database schema based on this file's path (i.e., the environment)
	"""
	return 'public' if get_environment() == 'prod' else 'dev'


def get_engine(access='read'):
	url = URL.create('postgresql', **app.config[f'DB_{access.upper()}_PARAMS'])
	schema = get_schema()
	
	# Use NullPool to prevent connection pooling. Since IIS spins up a 
	#	new instance for every request (or maybe just every request 
	#	with a different URL), each app instance creates its own connection. 
	#	With SQLAlchemy connection pooling, connections stay open and the 
	#	postgres simultaneous connection limit can easily be exceeded
	return create_engine(url, poolclass=NullPool)\
		.execution_options(schema_translate_map={'public': schema, None: schema})


def get_config_from_db(schema='public'):
	engine = get_engine()
	db_config = {}		
	with engine.connect() as conn:
		cursor = conn.execute(f'TABLE {schema}.config')
		for row in cursor:
			value = (
				float(row['value']) if row['data_type'] == 'float' else  
				int(row['value']) if row['data_type'] == 'integer' else
				(row['value'] == 'true') if row['data_type'] == 'boolean' else
				row['value']
			)
			app.config[row['property']] = value
			db_config[row['property']] = value

	return db_config


def get_unique_id() -> str:
	"""equivalent to php uniqid()"""
	return hex(int(datetime.now().timestamp() * 10000000))[2:]


def get_environment() -> str:
	""" return a string indicating whether this is the production or development env."""
	return 'prod' if '\\prod\\' in os.path.abspath(__file__) else 'dev'


def get_db_schema() -> str:
	""" return the database schema based on the current environment"""
	return 'public' if get_environment() == 'prod' else 'dev'


def get_engine(access='read', schema='public'):
	url = URL.create('postgresql', **app.config[f'DB_{access.upper()}_PARAMS'])
	return create_engine(url).execution_options(schema_translate_map={'public': schema, None: schema})


def get_config_from_db(schema='public'):
	engine = get_engine()
	db_config = {}		
	with engine.connect() as conn:
		cursor = conn.execute(f'TABLE {schema}.config')
		for row in cursor:
			property_name = row['property']
			value = (
				float(row['value']) if row['data_type'] == 'float' else  
				int(row['value']) if row['data_type'] == 'integer' else
				(row['value'] == 'true') if row['data_type'] == 'boolean' else
				row['value']
			)
			app.config[property_name] = value
			db_config[property_name] = value

	return db_config

db_schema = get_db_schema()
get_config_from_db(db_schema)

# Establish global scope sessionmakers to reuse at the function scope
read_engine = get_engine(access='read', schema=db_schema)
write_engine = get_engine(access='write', schema=db_schema)
ReadSession = sessionmaker(read_engine)
WriteSession = sessionmaker(write_engine)


@app.route('/flask/test', methods=['GET', 'POST'])
def hello():
	return 'hello'


# -------------- User Management ---------------- #
def query_user_info(username: str='', offline_id:str=''):
	"""
	Helper function to get DB user info using AD username 
	"""

	statement = select(
		User.id,
		User.ad_username,
		User.role,
		User.offline_id
	).where(
		(User.ad_username == username) 
		if username 
		else
		(User.offline_id == offline_id) 
	)

	with WriteSession() as session:
		result = session.execute(statement).first()
		if result:
			return result._asdict()
		else:
			# Add the user with the data entry role
			insert_data = dict(
				ad_username=username,
				role=1,
				offline_id=str(uuid4())
			)
			session.add(User(**insert_data))
			session.commit()
			
			return insert_data
			


# Get username and role
@app.route('/flask/user_info', methods=['GET'])
def get_user_info():
	
	username = ''
	try:
		# strip domain ('nps') from username, and make sure it's all lowercase
		username = re.sub(r'^.+\\', '', request.remote_user).lower()
	except Exception as e:
		raise RuntimeError('Could not retrieve username with error message ' + e)
	if not username:
		raise RuntimeError('request.remote_user not accessible')

	data = request.form
	if 'client_secret' in data:
		if data['client_secret'] == app.config['TEST_CLIENT_SECRET']:
			username = 'test'
		else:
			return json.dumps({'ad_username': username, 'user_role_code': None, 'user_status_code': None})

	return query_user_info(username=username)


@app.route('/flask/user_info/<offline_id>', methods=['GET', 'POST'])
def get_user_info_offline(offline_id):
	if not offline_id:
		raise ValueError('offline_id cannot be null')

	return query_user_info(offline_id=offline_id)
# -------------- User Management ---------------- #


# -------------- Entry Form Config ---------------- #
@app.route('/flask/db_config', methods=['GET'])
def db_config():
	return get_config_from_db()


@app.route('/flask/entry_form_config', methods=['GET'])
def entry_form_config():

	engine = get_engine()
	with engine.connect() as conn:
		pages = {
			row.id: row._asdict() for row in 
			conn.execute(f'SELECT * FROM {db_schema}.data_entry_pages ORDER BY page_index')
		}
		sections = {
			row.id: row._asdict() for row in 
			conn.execute(f'SELECT * FROM {db_schema}.data_entry_sections WHERE is_enabled ORDER BY display_order')
		}
		accordions = {
			row.id: row._asdict() for row in 
			conn.execute(f'SELECT * FROM {db_schema}.data_entry_accordions WHERE is_enabled AND section_id IS NOT NULL ORDER BY display_order')
		}
		containers = {
			row.id: row._asdict() for row in 
			conn.execute(f'SELECT * FROM {db_schema}.data_entry_field_containers WHERE is_enabled AND (section_id IS NOT NULL OR accordion_id IS NOT NULL) ORDER BY display_order')
		}
		fields_sql = f'''
			SELECT 
				fields.* 
			FROM {schema}.data_entry_fields fields 
				JOIN data_entry_field_containers containers 
				ON fields.field_container_id=containers.id 
			WHERE 
				fields.is_enabled 
			ORDER BY 
				containers.display_order,
				fields.display_order
		'''
		fields = {
			row.id: row._asdict() for row in 
			conn.execute(fields_sql)
		}
		accepted_attachment_extensions = {
			row.code: row.accepted_file_ext for row in
			conn.execute(f'SELECT code, accepted_file_ext FROM {db_schema}.file_type_codes WHERE sort_order IS NOT NULL')
		}

		return {
			'form_config': {
				'pages': pages,
				'sections': sections,
				'accordions': accordions,
				'fieldContainers': containers,
				'fields': fields
			},
			'accepted_attachment_extensions': accepted_attachment_extensions
		}


@app.route('/flask/lookup_options', methods=['GET'])
def lookup_options():
	engine = get_engine()
	sql = f''' SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='{db_schema}' AND table_name LIKE '%_codes' AND column_name='sort_order' '''
	with engine.connect() as conn:
		lookup_tables = {}
		for table_row in conn.execute(sqlatext(sql)):
			table_name = table_row.table_name
			lookup_sql = f'SELECT * FROM {schema}.{table_name} WHERE sort_order IS NOT NULL ORDER BY sort_order'
			lookup_tables[table_name] = [lookup_row._asdict() for lookup_row in conn.execute(lookup_sql)]

	return lookup_tables
			
		

# -------------- Entry Form Config ---------------- #


@app.route('/flask/park_form_id/<encounter_id>', methods=['GET', 'POST'])
def create_park_form_id(encounter_id):
	id_format = app.config['park_form_id_format']
	engine = get_engine()
	sql = f'''
		WITH search_date AS (
			SELECT datetime_entered AS search_date
			FROM {db_schema}.encounters
			WHERE id={encounter_id}
		)
		SELECT
			row_number + 1 AS form_count,
			*
		FROM (
			SELECT 
				start_date, start_time, id, row_number() OVER (ORDER BY datetime_entered)
			FROM {db_schema}.encounters 
			JOIN search_date ON 
				extract(year FROM encounters.datetime_entered) = extract(year FROM search_date.search_date) AND 
				encounters.datetime_entered <= search_date.search_date
		) _ 
		WHERE id = {encounter_id}
	'''
	with engine.connect() as conn:
		cursor = conn.execute(sql)
		row = cursor.first()
		if row:
			start_date = row.start_date
			start_time = row.start_time
			start_datetime = datetime.combine(start_date, start_time)
			#format dateime, then substitue encounter data and configuration values
			return start_datetime.strftime(id_format.format(**{**row, **app.config}))
		else:
			raise ValueError(f'Encounter ID {encounter_id} does not exist in the database')


@app.route('/flask/next_form_id/<year>', methods=['GET', 'POST'])
def get_next_park_form_id(year):
	id_format = app.config['park_form_id_format']
	# set any Python date formatting substrings to be surrounded by braces so .format() will replace them 
	pattern = re.compile(r'(%[a-zA-Z])')
	for result in pattern.finditer(id_format): 
		id_format = '{' + id_format[result.start() : result.start() + 2] + '}' + id_format[result.start() + 2:]
	engine = get_engine()
	sql = f'''
		SELECT 
			count(*) + 1 AS form_count, 
			max(extract(year FROM start_date)) AS "%%Y" 
		FROM {db_schema}.encounters 
		WHERE extract(year FROM start_date)={year}
	'''
	with engine.connect() as conn:
		cursor = conn.execute(sql)
		row = cursor.first()
		if row:
			# format dateime, then substitue encounter data and configuration values
			return id_format.format(**{**row, **app.config})
		else:
			raise ValueError(f'Encounter ID {encounter_id} does not exist in the database')
	


@app.route('/flask/export_data', methods=['POST'])
def run_export_data():

	params = dict(request.form)
	params['environment'] = get_environment()
	params['request_id'] = get_unique_id()
	params['input'] = json.loads(params['exportParams'])
	params['verbose'] = False
	
	# Convert to dict with dot notation to match type from parser.parse_args()
	params = Namespace(**params)

	# do export
	output_path = export_data(params)

	# return just exportdir\file.xlsx
	return '/'.join(output_path.split('/')[-2:])


#--------------- Email notifications ---------------------#
def get_email_logo_base64(): 
	""" Helper method to get logo image data for email messages """
	with open('imgs/bhims_icon_50px.jpg', 'rb') as f:
		return base64.b64encode(f.read()).decode('utf-8')

@app.route('/flask/notifications/submission', methods=['POST'])
def send_submission_notification():
	"""
	Send a notification to the admin that there's a new submission
	"""
	data = dict(request.form)

	data['logo_base64_string'] = 'data:image/jpg;base64,' + get_email_logo_base64()	
	data['button_url'] = f'''{request.url_root.strip('/')}/{data['query_url']}'''
	data['button_text'] = 'View Submission'
	data['heading_title'] = 'New BHIMS submission'
	data['db_admin_email'] = app.config['DB_ADMIN_EMAIL'][1] # Message() requires name, addres pair for some stupid reason

	now = datetime.now()
	data['formatted_date'] = f'''{now.strftime('%B')} {now.strftime('%d').lstrip('0')}'''
	data['formatted_time'] = now.strftime('%I:%M %p').lstrip('0')

	html = render_template('email_notification_submission.html', **data)

	mailer = Mail(app)
	msg = Message(
		subject=data['heading_title'],
		recipients=app.config['SUBMISSION_NOTIFICATION_RECIPIENTS'],
		html=html,
		reply_to=app.config['DB_ADMIN_EMAIL']
	)
	mailer.send(msg)

	return 'true'


#---------------------- DB i/o ----------------------#
# get meta tables


# Delete an encounter
@app.route('/flask/deleteEncounter', methods=['POST'])
def delete_encounter():
	""" 
	Delete an encounter 
	"""
	data = request.form

	if not 'encounter_id' in data:
		raise ValueError('No encounter ID in request data')

	encounter_id = data['encounter_id']

	#engine = get_engine('write')
	with WriteSession() as session:
		with session.begin():
			# Delete any attachments for this encounter, which are stored on the server
			for attachment in session.scalars(select(Attachment).filter_by(encounter_id=encounter_id)):
				file_path = attachment.file_path
				if os.path.isfile(file_path):
					os.remove(file_path)
				thumbnail_path = os.path.join(os.path.dirname(file_path), attachment.thumbnail_filename)
				if os.path.isfile(thumbnail_path):
					os.remove(thumbnail_path)
			
			# Delete the encounter, which will cascade to all related tables
			encounter = session.get(Encounter, encounter_id)
			session.delete(encounter)

	return 'true'


@app.route('/flask/save_submission_time', methods=['POST'])
def save_submission_time():
	"""
	When a user clicks the submit button, update the last_submission_attempt 
	field in the users table to be able to keep track of potentially failed 
	submissions
	"""
	data = request.form
	if not 'username' in data:
		raise ValueError('No username in request data')

	username = data['username']

	#engine = get_engine(acess='write', schema=get_db_schema())
	with WriteSession() as session:
		statement = (
			update(User)
				.where(User.ad_username == username)
				.values(last_submission_attempt=datetime.now().strftime('%Y-%m-%d %H:%M'))
		)
		session.execute(statement)
		session.commit()

	return 'true'


if __name__ == '__main__':

	app.run()#debug=True)
