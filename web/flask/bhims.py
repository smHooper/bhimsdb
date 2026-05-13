import os, sys
import traceback
import re
from pandas import DataFrame
from pandas import ExcelWriter
from sqlalchemy import select
from sqlalchemy import update
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker
import shutil
import base64

from datetime import datetime
from argparse import Namespace

import logging
from logging.config import dictConfig

from flask import Flask, has_request_context, render_template, request, json, jsonify, url_for
from flask_mail import Mail, Message

from subprocess import CREATE_NEW_PROCESS_GROUP
from subprocess import DETACHED_PROCESS
from subprocess import DEVNULL
from subprocess import run as subprocess_run
from subprocess import Popen

from typing import Any, Mapping

from uuid import uuid4
from werkzeug.datastructures import FileStorage

sys.path.append(
	os.path.join(os.path.abspath(
		os.path.dirname(__file__)), 
		'../../py/resource'
	)
)
sys.path.append(
	os.path.join(os.path.abspath(
		os.path.dirname(__file__)), 
		'../../py/scripts'
	)
)
from export_data import export_data
from tables import model_dict
import bhims_utils as utils


app_name = __name__
tables = model_dict()

###### Enable logging #####
log_dir = os.path.join(os.path.dirname(__file__), 'logs')
if not os.path.isdir(log_dir):
	os.mkdir(log_dir)

class RequestLoggingFormatter(logging.Formatter):
	"""
	Configure a custom formatter to include request information
	"""
	def format(self, record):
		if has_request_context():
			record.url = request.url
			record.remote_addr = request.remote_addr
			record.user = request.remote_user
			record.request_data = (
				'**ommitted**' if request.url.endswith('checkPassword') else 
				json.dumps(request.form)
			)
		else:
			record.url = None
			record.remote_addr = None
			record.user = None
			record.request_data = None
		return super().format(record)


def configure_logging(app_name, log_dir):


	with open(utils.CONFIG_FILE) as f:
		app_config = json.load(f)

	environment = utils.get_environment()
	
	# If the config file doesn't have a specific property set for error notification 
	#	recipients, just send them to the DB admin
	error_recipients = (
		app_config.get('ERROR_NOTIFICATION_RECIPIENTS') or 
		app_config.get('DB_ADMIN_EMAIL')
	)
	# And since the recipients could be a string or list, make sure it's a list
	if not isinstance(error_recipients, list):
		error_recipients = str(error_recipients).split(',')
	
	logging_config = {
		'version': 1,
		'formatters': {
			'default': {
				'datefmt': '%B %d, %Y %H:%M:%S %Z',
			},
		},
		'handlers': {
			# Configure a logger that will create a new file each day
			#	Only 100 logs will be saved before they oldest one is deleted
			'file': {
				'class': 'logging.handlers.TimedRotatingFileHandler',
				'filename': os.path.join(log_dir, 'flask.log'),
				'when': 'D',
				'interval': 1,
				'backupCount': 100,
				'formatter': 'default',
				'level': 'INFO'
			},
			# Logger for email notifications of Python errors
			'email': {
				'class': 	'logging.handlers.SMTPHandler',
				'level': 	'ERROR',
				'mailhost': app_config['MAIL_SERVER'],
				'fromaddr': f'BHIMS Error Notifications <{app_name}.{environment}-notifications@nps.gov>',
				'toaddrs':	error_recipients,
				'subject':	f'An error occurred with the {app_name} app'
			}
		},
		'root': {
			'level': 'INFO',
			'handlers': ['file', 'email'],
		}
	}

	dictConfig(logging_config)

	line_separator = '-' * 150 
	file_formatter = RequestLoggingFormatter(line_separator + 
	    '\n[%(asctime)s] %(user)s requested %(url)s from %(remote_addr)s\n' 
	    'with POST data %(request_data)s\n'
	    '%(levelname)s in %(module)s message:\n %(message)s\n' +
	    line_separator
	)

	email_formatter = RequestLoggingFormatter(
		'Time: %(asctime)s\n'
		'User: %(user)s\n'
		'URL: %(url)s\n'
		'Remote Address: %(remote_addr)s\n'
		'Logger name: %(name)s\n'
		'\n'
	)

	root_logger = logging.root
	root_logger.handlers[0].setFormatter(file_formatter) # file
	root_logger.handlers[1].setFormatter(email_formatter) # email


# Configure logging before initializing the Flask instance because Flask will 
#	otherwise create its own default_logger if a logger doesn't already exist
#	according to the docs: https://flask.palletsprojects.com/en/stable/logging/
configure_logging(app_name, log_dir)

app = Flask(app_name)

# Error handling
@app.errorhandler(500)
def internal_server_error(error):
	return 'ERROR: Internal Server Error.\n' + traceback.format_exc()

# Load config
CONFIG_FILE = utils.CONFIG_FILE
if not os.path.isfile(CONFIG_FILE):
	raise IOError(f'CONFIG_FILE does not exists: {CONFIG_FILE}')
if not app.config.from_file(CONFIG_FILE, load=json.load):
	raise IOError(f'Could not read CONFIG_FILE: {CONFIG_FILE}')

def get_config_from_db(schema='public') -> Mapping[str, Any]:
	engine = utils.get_engine()
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
			db_config[row['property']] = value
			app.config[row['property']] = value

	return db_config


db_schema = utils.get_schema()
get_config_from_db(db_schema)

# Establish global scope sessionmakers to reuse at the function scope
read_engine = utils.get_engine(access='read', schema=db_schema)
write_engine = utils.get_engine(access='write', schema=db_schema)
ReadSession = sessionmaker(read_engine)
WriteSession = sessionmaker(write_engine)


def get_auth_user() -> str:
    raw = (
		request.environ.get("AUTH_USER") or 
		request.headers.get("AUTH_USER", "")
    )
    if not raw:
        return ''
    # Strip domain prefix (DOMAIN\username → username)
    return raw.split("\\")[-1].lower()


@app.route('/flask/test', methods=['GET', 'POST'])
def hello():
	return 'hello'


@app.route('/flask/environment', methods=['GET'])
def get_environment():
	return utils.get_environment()


@app.route('/flask/config', methods=['GET'])
def get_db_config():

	return jsonify(get_config_from_db(db_schema))


@app.route('/flask/user_info', methods=['GET'])
def get_user_info():
	username = get_auth_user()
	User = tables['users']
	with ReadSession() as read_session, WriteSession() as write_session:
		user = (
			read_session.scalars(
				select(User).filter_by(
					ad_username=username
				)
			).first()
		)
		# If ther user doesn't exist
		if not user:
			# Insert with default role 1 (data entry)
			user = User(ad_username=username, role=1)
			write_session.add(user)
			write_session.commit()
			write_session.refresh(user)
	
	return jsonify({
		'username': user.ad_username,
		'role': user.role
	})
		

@app.route('/flask/park_form_id/<encounter_id>', methods=['GET', 'POST'])
def create_park_form_id(encounter_id):
	id_format = app.config['park_form_id_format']
	engine = utils.get_engine()
	sql = f'''
		WITH search_date AS (
			SELECT datetime_entered AS search_date
			FROM encounters
			WHERE id={encounter_id}
		)
		SELECT
			row_number + 1 AS form_count,
			*
		FROM (
			SELECT 
				start_date, start_time, id, row_number() OVER (ORDER BY datetime_entered)
			FROM encounters 
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
	engine = utils.get_engine()
	sql = f'''
		SELECT 
			coalesce(max(substring(park_form_id, '\\d+$')::INTEGER), 0) + 1 AS form_count, 
			max(extract(year FROM start_date)) AS "%%Y" 
		FROM encounters 
		WHERE extract(year FROM start_date)={year}
	'''
	with engine.connect() as conn:
		cursor = conn.execute(sql)
		row = cursor.first()
		if row:
			# format dateime, then substitue encounter data and configuration values
			return id_format.format(**{**row, **app.config})
		else:
			raise ValueError(f'No encounters with start_date in year {year} exist in the database')
	


@app.route('/flask/export_data', methods=['POST'])
def run_export_data():

	params = dict(request.form)
	params['environment'] = utils.get_environment()
	params['request_id'] = utils.get_unique_id()
	params['input'] = json.loads(params['exportParams'])
	params['verbose'] = False
	
	# Convert to dict with dot notation to match type from parser.parse_args()
	params = Namespace(**params)

	# do export
	output_path = export_data(params)

	# return just exportdir\file.xlsx
	return '/'.join(output_path.split('/')[-2:])


def write_query_to_excel(
		query_data, 
		query_name, 
		excel_path, 
		excel_start_row=0, 
		write_columns=True, 
		write_mode='a', 
		query_url=''
	):

	# Write to the excel file
	if_sheet_exists = 'overlay' if write_mode == 'a' else None
	with ExcelWriter(
			excel_path, 
			engine='openpyxl', 
			mode=write_mode, 
			if_sheet_exists=if_sheet_exists
		) as writer:
		
		query_data.to_excel(
			writer, 
			sheet_name='data', 
			startrow=excel_start_row, 
			header=write_columns, 
			index=False
		)

# Export results of predefined queries
@app.route('/flask/analysis/export', methods=['POST'])
def export_query():

	data = dict(request.form)

	# Make sure any filename is unique
	random_string = utils.get_random_string()

	query_name = data['query_name']

	# Convert JSON string arrays to lists because arrays can't be sent directly
	data['columns'] = json.loads(data['columns'])
	if query_name == 'guide_company_client_status' or query_name == 'guide_company_briefings':
		data['client_status_columns'] = json.loads(data['client_status_columns'])
		data['briefing_columns'] = json.loads(data['briefing_columns'])

	data['query_data'] = json.loads(data['query_data'])
	
	if data['export_type'] == 'excel':
		
		# If a template Excel file exists, make a copy in the exports directory to make a new file to write to
		excel_filename =  data['base_filename'] + '.xlsx' if 'base_filename' in data else f'{query_name}_{random_string}.xlsx'
		export_dir = utils.get_content_dir('export_cache')
		if not os.path.isdir(export_dir):
			os.mkdir(export_dir)
		excel_path = os.path.join(export_dir, excel_filename)
		excel_template_path = os.path.join(os.path.dirname(__file__), 'templates', f'{query_name}.xlsx')
		excel_write_mode = 'w' # default to write a new file
		if os.path.isfile(excel_template_path):
			shutil.copy(excel_template_path, excel_path)
			excel_write_mode = 'a' # to keep style in template, write in append mode

		query_data = DataFrame(data['query_data']).reindex(columns=data['columns'])
		write_query_to_excel(
			query_data, 
			query_name, 
			excel_path, 
			excel_start_row=int(data.get('excel_start_row') or 0),
			write_columns=data['excel_write_columns'],
			query_url=data.get('query_url') or '',
			write_mode=excel_write_mode
		)

		return 'export_cache/' + excel_filename

	else:
		raise ValueError(f'''invalid export_type: "{data['export_type']}" ''')
	

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
# All-purpose SELECT query endpoint
@app.route('/flask/db/select', methods=['POST'])
def run_select_query():

	request_data = request.get_json()	
	response_data = utils.query_db(request_data)
	response = {'data': response_data}

	if 'queryTime' in request_data:
		response['queryTime'] = request_data['queryTime']

	return jsonify(response)


@app.route('/flask/deleteEncounter', methods=['POST'])
def delete_encounter():
	""" 
	Delete an encounter 
	"""
	data = request.form

	if not 'encounter_id' in data:
		raise ValueError('No encounter ID in request data')

	encounter_id = data['encounter_id']

	with WriteSession() as session:
		with session.begin():
			# Delete any attachments for this encounter, which are stored on the server
			for attachment in session.scalars(select(tables['attachments']).filter_by(encounter_id=encounter_id)):
				file_path = attachment.file_path
				if os.path.isfile(file_path):
					os.remove(file_path)
				thumbnail_path = os.path.join(os.path.dirname(file_path), attachment.thumbnail_filename)
				if os.path.isfile(thumbnail_path):
					os.remove(thumbnail_path)
			
			# Delete the encounter, which will cascade to all related tables
			encounter = session.get(tables['encounters'], encounter_id)
			session.delete(encounter)

	return 'true'


def delete_from_table_by_id(table, record_id):
	with WriteSession() as session, session.begin():
		record = session.get(table, record_id)
		return session.delete(record)
	

@app.route('/flask/deleteByID', methods=['POST'])
def delete_by_id():
	request_data = request.get_json()
	if not 'tableName' in request_data:
		raise ValueError('No tableName in request data')
	if not 'id' in request_data:
		raise ValueError('No id in request data')

	table = tables.get(request_data['tableName'])
	if not table:
		raise ValueError(f"Table '{request_data['tableName']}' not found")

	delete_from_table_by_id(table, request_data['id'])

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

	User = tables['users']
	with WriteSession() as session:
		statement = (
			update(User)
				.where(User.ad_username == username)
				.values(last_submission_attempt=datetime.now().strftime('%Y-%m-%d %H:%M'))
		)
		session.execute(statement)
		session.commit()

	return 'true'


@app.route('/flask/db/lookupValues', methods=['GET'])
def get_lookup_tables():
	"""
	Get all lookup tables that are used to populate dropdowns in the form
	"""
	sql = f'''
		SELECT table_name 
		FROM information_schema.tables 
		WHERE 
			table_schema='{db_schema}' AND 
			table_name LIKE '%_codes' AND
			table_name <> 'park_unit_codes'
		;
	'''
	result = {}
	with WriteSession() as session:
		lookup_tables = [r['table_name'] for r in utils.select_result_to_dict(session.execute(sql))]
		for table_name in lookup_tables:
			rows = utils.select_result_to_dict(session.execute(f'TABLE {table_name}'))
			result[table_name] = {r['code']: r for r in rows}

	return jsonify(result)


@app.route('/flask/db/primaryKeys', methods=['GET'])
def get_table_sort_columns():
	"""
	Get primary keys for all tables
	"""
	sql = '''
		SELECT 
			tc.table_schema, tc.table_name, kc.column_name
		FROM information_schema.table_constraints tc
			INNER JOIN information_schema.key_column_usage kc 
			ON kc.table_name = tc.table_name AND kc.table_schema = tc.table_schema AND kc.constraint_name = tc.constraint_name
		WHERE 
			tc.constraint_type = 'PRIMARY KEY' AND
			kc.column_name <> 'encounter_id' AND 
			kc.table_name NOT LIKE '%_codes' AND
			kc.ordinal_position is not null
		ORDER BY 
			tc.table_schema,
			tc.table_name,
			kc.position_in_unique_constraint
	'''
	result = {}
	with WriteSession() as session:
		for row in utils.select_result_to_dict(session.execute(sql)):
			result[row['table_name']] = row['column_name']

	return jsonify(result)


@app.route('/flask/save/attachments', methods=['POST'])
def save_attachment():

	response = []
	for inputName, uploaded_file in request.files.items():

		client_basename, extension = os.path.splitext(uploaded_file.filename)
		server_filename = str(uuid4()) + extension
		attachment_dir = utils.get_content_dir('attachments')	
		file_path = os.path.abspath(os.path.join(attachment_dir, server_filename))
		request.files[inputName].save(file_path)

		mimetype = uploaded_file.mimetype.lower()
		
		# Get general file type (i.e.,image, video, or audio) and specific (e.g., png, mp4, etc)
		general_file_type, specific_file_type = mimetype.split('/')
		
		# Make a thumbnail
		# 	If it's a GIF, the image-magick command will need an index of a frame to extract
		gif_frame_index = '[0]' if specific_file_type == 'gif' else ''
		thumbnail_filename = re.sub(f'\\{extension}$', f'_thumbnail.jpg', server_filename)
		thumbnail_path = os.path.join(attachment_dir, thumbnail_filename)
		
		# for images, use image-magick to create a resize jpg
		thumbnail_exe_dir = app.config['IMAGE_MAGICK_DIR']
		
		thumbnail_command = []
		if general_file_type == 'image':
			thumbnail_command = [
				os.path.join(thumbnail_exe_dir, 'magick'), 
				file_path + gif_frame_index, 
				'-resize', '200x200',
				thumbnail_path
			]
		# for videos, extract the frame at the 1 second timestamp
		if general_file_type == 'video' or mimetype == 'application/octet-stream':
			thumbnail_command = [
				os.path.join(thumbnail_exe_dir, 'ffmpeg'), 
				'-ss',  '00:00:01.00', 
				'-i', file_path, 
				'-vf', 'scale=200:200:force_original_aspect_ratio=decrease',
				 '-vframes', '1',
				 thumbnail_path
			]
			

			# Make a webm version of the file as an efficient backup in case the original 
			#	isn't supported by the browser when the attachment is served back up
			if not mimetype == 'video/webm':
				command = [
					os.path.join(thumbnail_exe_dir, 'ffmpeg'), 
					'-i', file_path, 
					'-c:v', 'libvpx-vp9', 
					'-b:v', '0', 
					'-crf', '45', 
					'-preset', 'good',
					'-b:a', '96k',#
					re.sub(f'\\{extension}$', '.webm', file_path)
				]
				try:
					Popen(
						command,
						stdout=DEVNULL,
						stderr=DEVNULL,
						creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
					)
				except:
					pass

		thumbnail_success = True
		if thumbnail_command:
			try:
				subprocess_run(thumbnail_command, check=True, stdout=DEVNULL, stderr=DEVNULL)
			except Exception as e:
				thumbnail_success = str(e)

		response.append({
			'file_path': file_path,
			'thumbnail_filename': thumbnail_filename,
			'thumbnail_success': thumbnail_success,
		})

	return jsonify(response)


if __name__ == '__main__':

	app.run()#debug=True)