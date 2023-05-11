import os, sys
import traceback

import sqlalchemy
import bcrypt
import pandas as pd
import smtplib

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


def get_unique_id() -> str:
	"""equivalent to php uniqid()"""
	return hex(int(datetime.now().timestamp() * 10000000))[2:]


def get_environment() -> str:
	""" return a string indicating whether this is the production or development env."""
	return 'prod' if '\\prod\\' in os.path.abspath(__file__) else 'dev'

@app.route('/flask/test', methods=['GET', 'POST'])
def hello():
	return 'hello'

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


if __name__ == '__main__':

	app.run()#debug=True)