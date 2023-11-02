import os, sys
import traceback
import re

from sqlalchemy import create_engine
from sqlalchemy.engine import URL
import bcrypt
import pandas as pd
import smtplib
import base64

from datetime import datetime
from argparse import Namespace

from flask import Flask, render_template, request, json, url_for
from flask_mail import Mail, Message

sys.path.append(os.path.join(os.path.abspath(os.path.dirname(__file__)), '../../py/scripts'))
from export_data import export_data


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


def connect_db(access='read'):
	url = URL.create('postgresql', **app.config['DB_ADMIN_PARAMS' if access == 'write' else 'DB_READ_PARAMS'])
	return create_engine(url)


def get_config_from_db():
	engine = connect_db()
	db_config = {}		
	with engine.connect() as conn:
		cursor = conn.execute('TABLE config');
		for row in cursor:
			app.config[row['property']] = (
				float(row['value']) if row['data_type'] == 'float' else  
				int(row['value']) if row['data_type'] == 'integer' else
				(row['value'] == 'true') if row['data_type'] == 'boolean' else
				row['value']
			)
get_config_from_db()


def get_unique_id() -> str:
	"""equivalent to php uniqid()"""
	return hex(int(datetime.now().timestamp() * 10000000))[2:]


def get_environment() -> str:
	""" return a string indicating whether this is the production or development env."""
	return 'prod' if '\\prod\\' in os.path.abspath(__file__) else 'dev'

@app.route('/flask/test', methods=['GET', 'POST'])
def hello():
	return 'hello'


@app.route('/flask/park_form_id/<encounter_id>', methods=['GET', 'POST'])
def create_park_form_id(encounter_id):
	id_format = app.config['park_form_id_format']
	engine = connect_db();
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
	engine = connect_db();
	sql = f'''
		SELECT 
			count(*) + 1 AS form_count, 
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

# new account creation
# This endpoint sends an activation notification to a user whose account was just created by an admin
@app.route('/flask/notifications/submission', methods=['POST'])
def send_submission_notification():
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

	return 'true';

if __name__ == '__main__':

	app.run()#debug=True)