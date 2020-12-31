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

DATA_TABLE_NAME = 'BIMS All'

DATA_COLUMNS = pd.DataFrame({
    'Group Type':           {'table_name': 'encounters',            'column_name': 'human_group_type_code'},
    'Activity':             {'table_name': 'encounters',            'column_name': 'general_human_activity_code'},
    'Group Size':           {'table_name': 'encounters',            'column_name': 'group_size_encounter'},
    'Backcountry Unit #':   {'table_name': 'encounter_locations',   'column_name': 'backcountry_unit_code'},
    'Developed Area':       {'table_name': 'encounter_locations',   'column_name': 'place_name_code'},
    'Developed Area Detail':{'table_name': 'encounter_locations',   'column_name': 'location_description'},
    'Bear Charge Dist':     {'table_name': 'encounters',            'column_name': 'greatest_charge_distance_m'},
    'Bear Charge':          {'table_name': 'encounters',            'column_name': 'bear_charged'},
    'Bear Group':           {'table_name': 'encounters',            'column_name': 'bear_cohort_code'},
    'Prob Cause':           {'table_name': 'encounters',            'column_name': 'reported_probable_cause_code'},
    'Veg Type':             {'table_name': 'encounter_locations',   'column_name': 'habitat_type_code'},
    'Visibility':           {'table_name': 'encounter_locations',   'column_name': 'visibility_code'},
    'Bear Activity':        {'table_name': 'encounters',            'column_name': 'initial_bear_action_code'},
    'Making noise':         {'table_name': 'encounters',            'column_name': 'was_making_noise'},
    'Person Activity':      {'table_name': 'encounters',            'column_name': 'initial_human_action_code'},
    'Int Bear Dist':        {'table_name': 'encounters',            'column_name': 'initial_distance_m'},
    'How close':            {'table_name': 'encounters',            'column_name': 'closest_distance_m'},
    'Food Present':         {'table_name': 'encounters',            'column_name': 'food_present_code'},
    'Food Eaten':           {'table_name': 'encounters',            'column_name': 'bear_obtained_food'},
    'Food Description':     {'table_name': 'encounters',            'column_name': 'consumed_food_description'},
    'Property Description': {'table_name': 'property_damage',       'column_name': 'property_description'},
    'Property Value':       {'table_name': 'property_damage',       'column_name': 'property_value'},
    'Narative':             {'table_name': 'encounters',            'column_name': 'narrative'},
    'Collected By':         {'table_name': 'encounters',            'column_name': 'received_by'},
    'Collected Date':       {'table_name': 'encounters',            'column_name': 'datetime_received'},
    'Rated By':             {'table_name': 'assessment',            'column_name': 'assessed_by'},
    'Bear behav rate':      {'table_name': 'assessment',            'column_name': 'probable_cause_code'},
    'Manage rate':          {'table_name': 'assessment',            'column_name': 'management_classification_code'},
    'Entered By':           {'table_name': 'encounters',            'column_name': 'entered_by'},
    'incident_id':          {'table_name': 'encounters',            'column_name': 'incident_id'},
    'Record #':             {'table_name': 'encounters',            'column_name': 'park_form_number'},
    'Date':                 {'table_name': 'encounters',            'column_name': 'start_date'},
    'Time':                 {'table_name': 'encounters',            'column_name': 'start_time'}
}).T
''' 
    'Road Mile':            {'table_name': 'encounter_locations',   'column_name': 'road_mile'},    
    'Deterents Used': {'table_name': 'deterrents_used', 'column_name': 'deterrent_type_code'},
    'Deterents Disc': {'table_name': 'deterrents_used', 'column_name': 'other_deterrent_type'},
    'Structure Description': {'table_name': 'structure_interactions', 'column_name': 'structure_description'}
    'Name':                 {'table_name': 'people',                'column_name': 'first_name'},
    'Zip Code':             {'table_name': 'people',                'column_name': 'zip_code'},
    'State/Prov':           {'table_name': 'people',                'column_name': 'state_code'},
    'Country':              {'table_name': 'people',                'column_name': 'country_code'},
    'Phone Number':         {'table_name': 'people',                'column_name': 'phone_number'},
    'Email':                {'table_name': 'people',                'column_name': 'email_address'}'''

BEAR_COLUMNS = {
    'BearNum':      'bear_number',
    'Bear Species': 'bear_species_code',
    'Bear Color':   'bear_color_code',
    'Bear Age':     'bear_age_code',
    'Bear Sex':     'bear_sex_code',
    'Descriptive Markings': 'bear_description'
}

PEOPLE_COLUMNS = {
    'first_name': 'first_name',
    'last_name': 'last_name',
    'encounter_id': 'encounter_id',
    'Zip Code': 'zip_code',
    'State/Prov': 'state_code',
    'Country': 'country_code',
    'Phone Number': 'phone_number',
    'Email': 'email_address',
}

HUMAN_GROUP_CODES = {
    'A. Park Vistor':                   1,
    'B. Concession Employee':           2,
    'C. NPS Employee':                  3,
    'D. Professional Photographer':     4,
    'E.  Contractor/Researcher':        5,
    'F.  Kantishna Resident/Employee':  6,
    'G.  Mountaineer/Climber':          1,
    'not designated':                   8
}

BEAR_COHORT_CODES = {
    '1. Single Bear':           1,
    '2. Bear with 1 Cub':       2,
    '3. Bear with 2 Cubs':      3,
    '4. Bear with 3 Cubs':      4,
    '5. Pair of Adult Bears':   5
}

INITIAL_BEAR_ACTION_CODES = {
    'A.  Feeding on Vegetation':    1,
    'B.  Feeding on carcass':       2,
    'C.  Hunting':                  3,
    'D.  Digging':                  4,
    'E.  Standing':                 5,
    'F.  Resting':                  6,
    'G.  Breeding':                 7,
    'H.  Walking toward people':    8,
    'I.  Running toward people':    9,
    'J.  Running away from people': 10,
    'K.  Traveling':                11,
    'L.  Playing':                  12,
    'M.  Investigating':            13
}

BEAR_AGE_CODES = {
    '1.  Spring Cub':    1,
    '2.  Yearling':      2,
    '3.  Sub-Adult':     3,
    '4.  Adult':         4,
    '5.  Unknown':       5
}

PROBABLE_CAUSE_CODES = {
    'A.  Intolerant':       1,
    'B.  Curious':          2,
    'C.  Mistaken Prey':    3,
    'D.  Dominance':        4,
    'E.  Surprise':         5,
    'F.  Provoked':         6,
    'G.  Tolerant':         7,
    'H.  Conditioned':      8,
    'I.  Rewarded':         9,
    'J.  Threat':           10,
    'K.  Predation':        11,
    'L.  Indeterminate':    12
}

BEAR_COLOR_CODES = {
    '1.  Blond':        1,
    '2.  Light Brown':  2,
    '3.  Med Brown':    5,
    '4.  Dark Brown':   3,
    '5.  Black':        4
}

SEX_CODES = {
    '1.  Male':      2,
    '2.  Female':    1,
    '3.  Unknown':   3
}

BEAR_SPECIES_CODES = {
    '1.  Grizzly':   1,
    '2.  Black':     2,
    '3.  Unknown':   3
}

DETERRENT_TYPE_CODES = {
    'Airhorn':      2,
    'Pepper spray': 1,
    'Other':        3,
    'Yes':          3
}

PLACE_NAME_CODES = {
    'A.  Entrance Area Trails': 1,
    'B.  Savage Area Trails': 2,
    'C.  Eieson Area Trails': 3,
    'D.  Riley Creek CG': 4,
    'E.  Savage CG': 5,
    'F.  Sanctuary CG': 6,
    'G. Teklanika Campground': 7,
    'H.  Igloo CG': 8,
    'I.   Wonder Lake CG': 9,
    'J.  Teklanika Rest Area': 10,
    'K.  Kantishna Developed Area': 16,
    'L.  Specific Location': 12,
    'M.  Polychrome Overlook': 13,
    'N.  Toklat Rest Area': 14,
    'O.  Stony Hill Overlook': 15,
    'P.  Kantishna Developed Area': 16,
    'Q.  Headquaters Area': 17,
    'R.  C -Camp': 18,
    'S.  Toklat Road Camp': 19,
    'T.  Concessionaire Housing': 20,
    'U.  Backside (Moraine) Lake': 21,
    'V.  Other Location': 22,
    'A. Riley Creek CG': 4,
    'C.  Concessionaire Housing': 20,
    'C. Eielson Area Trails': 3,
    'D.  C -Camp': 18,
    'E.  Headquaters Area': 17,
    'F.  Savage CG': 5,
    'F.  Savage Campground': 5,
    'G.  Sanctuary CG': 6,
    'H.  Teklanika Campground': 7,
    'I.   Park Road/Roadside Mile #': 11,
    'J.  Kantishna Developed Area': 16,
    'N. Entrance Area Trail': 1,
    'O.  Polychrome Rest Area': 13,
    'P. Teklanika Rest Area': 10,
    'Q.  Stony Hill Overlook': 15,
    'Q. Stony Hill Overlook': 15,
    'S.  Wonder Lake CG': 9,
    'Savage Area Trails': 2,
    'T.  Toklat Rd Camp': 19,
    'T. Toklat Roadcamp': 19,
    'U.  Igloo CG': 8,
    'V. Savage Area Trails': 2,
    'W. Backside Lake': 21,
    'l.  Other Location (Backside Lake)': 21
}

FOOD_PRESENT_CODES = {
    'E.  Food outside BRFC':    2,
    'A.  No food present':      3,
    'F.  Unknown':              6,
    'C.  Food odor only':       4,
    'D.  Food hung in tree':    5,
    'A. Yes, inside BRFC':      1,
    'B.  Food in BRFC':         1,
    'B. Yes, outside BRFC':     2,
    'C. No food present':       3,
    'D. Unknown':               6
}

INITIAL_HUMAN_ACTIVITY_CODES = {
    'A.  Sleeping':                     1,
    'B.  Eating/Cooking':               2,
    'C.  Hiking':                       3,
    'D.  Running':                      4,
    'E.  Sitting':                      5,
    'F.  Traveling on the Park Road':   6,
    'G.  Setting up/Breaking Camp':     7,
    'not designated':                   9
}

MANAGEMENT_CLASSIFICATION_CODES = {
    'A.  Observation':              1,
    'B.  Encounter':                2,
    'C.  Incident; General':        3,
    'D.  Incident; Gets food':      4,
    'E.  Incident; Property damage': 5,
    'F.  Incident; Injury':         6
}

REPORTED_PROBABLE_CAUSE_CODES = {
    'A. Surprised bear': 1,
    'B. Curious bear': 2,
    'C. Bear tolerant of people': 3,
    "D. In bear's path of travel": 4,
    'Unknown': 6,
    'not designated': 6,
    'They wanted to use the trail up to the road': 4,
    'Surprise. We did not see eachother before we suddenly met': 1,
    "I was walking toward my tent and it was on their way. I couldn't see them.": 4
}

HABITAT_TYPE_CODES = {
    'A.  Open Tundra': 1,
    'B.  Forest': 2,
    'C.  Gravel River Bar': 3,
    'F.  Road': 6,
    "D.  High Brush (Taller than 3' or 1m)": 4,
    "E.   Low Brush (Shorter than 3' or 1m)": 5,
    'not designated': 8
}

VISIBILITY_CODES = {
    'A. 0 - 20 yards':      20,
    'B. 21 - 100 yards':    100,
    'C. 101 - 300 yards':   300,
    'D. > 300 yards':       1000,
}

GENERAL_HUMAN_ACTIVITY_CODES = {
    'A.  Backcountry camping (Overnight)': 1,
    'B.  Day-hiking in backcountry': 2,
    'C.  Walking on road': 3,
    'D.  Hiking on maintained trail': 4,
    'E.  Driving on road': 5,
    'F.  Camping (Developed campground)': 6,
    'G. Biking': 7,
    'H. Other': 8,
    'not designated': 9
}

BEAR_COHORT_CODES_TO_ROWS = {
    2:     [{'bear_number': 1, 'bear_age_code': 4, 'bear_sex_code': 1},
            {'bear_number': 2, 'bear_age_code': 5, 'bear_sex_code': 3}
            ],
    3:     [{'bear_number': 1, 'bear_age_code': 4, 'bear_sex_code': 1},
            {'bear_number': 2, 'bear_age_code': 5, 'bear_sex_code': 3},
            {'bear_number': 3, 'bear_age_code': 5, 'bear_sex_code': 3}
            ],
    4:     [{'bear_number': 1, 'bear_age_code': 4, 'bear_sex_code': 1},
            {'bear_number': 2, 'bear_age_code': 5, 'bear_sex_code': 3},
            {'bear_number': 3, 'bear_age_code': 5, 'bear_sex_code': 3},
            {'bear_number': 3, 'bear_age_code': 5, 'bear_sex_code': 3}
            ],
    5:     [{'bear_number': 1, 'bear_age_code': 4, 'bear_sex_code': 3},
            {'bear_number': 2, 'bear_age_code': 4, 'bear_sex_code': 3}
            ],
    1:     [{'bear_number': 1, 'bear_age_code': 5, 'bear_sex_code': 3}]
}

BEAR_AGES_TO_COHORT = {
    "[4]":          1,
    "[4, 4]":       5,
    "[1, 1, 1, 4]": 4,
    "[1, 1, 4]":    3,
    "[1, 4]":       2,
    "[3, 3, 4]":    3,
    "[3, 4]":       3,
    "[2, 2, 4]":    3,
    "[2, 4]":       2,
    "[3]":          1,
    "[5]":          7
}

BEAR_REACTION_CODES = {
    'A.  Not aware of people':          100,
    'B.  Stood on hind legs':           101,
    'F.  Stood on hind legs':           101,
    'C.  Growled/Woofed/Made noise':    102,
    'D.  Walked away':                  103,
    'A.  Walked away':                  103,
    'E.  Ran away':                     104,
    'B.  Ran away':                     104,
    'B.  Ran away (stayed within 1 mi though)': 104,
    'I.  Walked toward people':         105,
    'C.  Walked closer':                105,
    'E.  Remained in area, ignored people': 107,
    'G.  Remained in area ignoring people': 107,
    'F.  Ran toward people':            106,
    'F.  Rand toward people':           106,
    'D.  Ran closer':                   106,
    'H.  Watched people':               108,
    'G.  Watched people':               108,
    'J.  Circled people':               109,
    'H.  Circled around people':        108,
    'K.  Bluff charged':                110,
    'I.  Bluff charged':                110,
    'K.  Charged (the car)':            110,
    'K. Charged':                       110,
    'L.  Made contact with person':     111,
    'J.  Made contact with person':     111,
    'M.  Investigated equipment/property': 112,
    'K.  Ivestigated property':         112,
    'N.  Other':                        113,
    'L.  Other':                        113,
    'not designated':                   -100
}

HUMAN_REACTION_CODES = {
    'A.  Walked/Backed away':                   1,
    'B.  Ran away':                             2,
    'C.  Remained still/silent':                3,
    'D.  Continued hiking in same direction':   4,
    'E.  Used bear spray':                      5,
    'E.  Used pepper spray':                    5,
    'F.   Stood Ground and Made noise':         6,
    'J.  Other: stood ground':                  6,
    'G.  Threw something at bear':              7,
    'H.  Photographed bear':                    8,
    'J.  Other':                                10
}

STRUCTURE_TYPE_CODES = {
    'BUS, TWT 2': 3,
    'Bear checked out repeater': 7,
    'Bear w/ cubs slept close to tent': 1,
    'Bear walked through campsite 1m from tent.  Coincidentally the camp was in their way.': 1,
    'Boat - packrafters': 4,
    'Bus': 3,
    'Bus 120564 no damage on bus only smudges': 3,
    'Bus Transit': 3,
    'Buses': 3,
    'Cabin': 2,
    'Cabin (we were inside, bear outside)': 2,
    'Check Station (used for my safety/shelter), bench used as bear scratching post.': 2,
    'Doors of bathroom all have new scratches and 1 pole': 2,
    'EVC': 2,
    'EVC + 3 busses': 7,
    'Eilson visitor center and JV Buses': 7,
    'Geology group saught refuge in UAF Van': 3,
    'Hard sided tent cabin @ admin camp': 7,
    'I got on the tractor that happened to be sitting there!!': 3,
    'Just got to 1 meter of tent and sniffed': 1,
    'LE Vehicle': 3,
    'Made contact w/ tent': 1,
    'Many cars that visitors viewed from or near': 3,
    "Nina's maintenance vehicle": 3,
    'Not directly, but we were "in camp" w/ our tents set up - so we couldn\'t just back away': 1,
    'Old wall tent with screened walls': 1,
    'Pickup Truck': 3,
    'Pyramid tarp/shelter': 1,
    'Recycling bin': 7,
    'Tent': 1,
    'Tent at location of people (sleeping).': 1,
    'Tent, bear walked around': 1,
    'Tents': 1,
    'Tents were in front of us. Untouched by bear.': 1,
    'Tents- ccok tent in second encounter': 1,
    'Thorofare Cabin': 2,
    'Thorofare cabin has scratches on the eastern side of the cabin': 2,
    'Thorofare cabin, Thorofare cabin outhouse': 2,
    'Toilet, tent': 7,
    'Toklat Cabin': 2,
    'Toklat tent and buses.': 7,
    'Truck': 3,
    'Unkown as of yet, see above': 7,
    'WL ranger station': 2,
    'We were in a tent': 1,
    'We were just getting off from a tent when we saw the bears. We left tent.': 1,
    'bear within 50 ft of tent': 1,
    'got on bus': 3,
    'parking lot area': 7,
    'tent': 1,
    'tore up side of lower laundry room': 2,
    'van': 3,
    'n/a': None,
    'not really': None
}

CLOSEST_DISTANCE_VALUES = {
    '91-137': 91.4,
    '<91.4': 91.4,
    'Less than 1 m from a bus': 1,
    'Made Contact': 0,
    'Made contact with bus': 0,
    'close': None
}

COUNTRY_CODES = {
    '99503': 236,
    'AK': 236,
    'America (North) USA': 236,
    'Australia': 14,
    'Austria': 15,
    'Belgium': 22,
    'Brazil': 32,
    'Bulgaria': 35,
    'CN': 40,
    'Canada': 40,
    'China': 46,
    'Czech Republic': 60,
    'Denmark': 61,
    'England': 235,
    'Finland': 75,
    'France': 76,
    'Germany': 83,
    'Holland': 157,
    'Hungary': 101,
    'Isreal': 109,
    'Italy': 110,
    'Japan': 112,
    'Netherlands': 157,
    'New Zealand': 159,
    'Norway': 166,
    'Poland': 177,
    'Spain': 209,
    'Switzerland': 216,
    'The Netherlands': 157,
    'U.S': 236,
    'U.S.': 236,
    'UK': 235,
    'US': 236,
    'USA': 236,
    'USA/AUS': 236,
    'United States': 236
}

def handle_other(data, column_name, pg_column_info, value_map, pg_engine, other_code_value=None, inplace=True):

    pg_column_name = pg_column_info.column_name
    other_column_name = f'''other_{pg_column_name.replace('_code', '')}'''

    # Check to make sure the lookup table has an "Other" option and that an "other_" column exists in the database
    with pg_engine.connect() as conn:
        pg_other_columns = pd.read_sql(
            f'''SELECT column_name FROM information_schema.columns WHERE column_name='{other_column_name}' AND table_name='{pg_column_info.table_name}';''',
            conn)
        try:
            lookup_values = pd.read_sql_table(f'{pg_column_name}s', conn)
        except Exception as e:
            raise RuntimeError(f'''Could not get lookup values for table {pg_column_name}s because {e}''')
        if len(lookup_values.loc[lookup_values['name'].str.contains('Other')]) == 0:
            warnings.warn(f'''The lookup table {pg_column_name}s does not contain an "Other" option''')
            return

        if not (pg_other_columns.column_name == other_column_name).any():
            raise RuntimeError(f'''Could not process column "{column_name}" because "{other_column_name}" does not exist in the postgres DB''')

    # Find and clean the other values. Find any values that begin with some capital letter and "Other" or that aren't
    #   in the values of the dictionary for mapping old -> values.
    #   Values mostly start with multiple choice letter (e.g., "G. Other (some other group)")
    #   Replace the "G. Other" with a regex, then strip the parentheses from the description
    #   Use .apply() (as opposed to list comprehension) for this so the index is maintained
    regex_pattern = '^[A-Z]\.\s+Other[:,]*\s*'
    other_values_mask = data[column_name].astype(str).str.contains(regex_pattern) | \
                        (~data[column_name].isin(list(value_map.values())) & ~data[column_name].isna())
    other_values = data.loc[other_values_mask, column_name]\
        .apply(lambda s: re.sub(regex_pattern, '', str(s)).strip(' ()'))

    if inplace:
        data[other_column_name] = other_values  # no need to return because this should modify data in place

        # Set the "other" data values to the code for "Other"
        if other_code_value == None:
            other_code_value = lookup_values.loc[lookup_values['name'].str.contains('Other'), 'code']
        data.loc[other_values_mask, column_name] = other_code_value
    else:
        return other_values, other_code_value, other_column_name


def main(db_path, pg_connection_txt):

    access_conn =  pyodbc.connect(r'DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=%s' % db_path)
    data = pd.read_sql('SELECT * FROM [%s]' % DATA_TABLE_NAME, access_conn)
    bears = pd.read_sql('SELECT * FROM bear', access_conn)
    access_conn.close()

    pg_engine = db_utils.connect_pg_db(pg_connection_txt)

    '''######## Combine date and time into datetime_start
    data['pd_time'] = data['Time'].dt.time
    data['datetime_start'] = data.dropna(subset=['Date', 'pd_time']).apply(
        lambda row: datetime.combine(row['Date'], row['pd_time']), axis=1)'''

    ######## Convert "record #" to sequential ID
    #   First fill in records without a 'Record #' and replace duplicates
    duplicate_mask = data['Record #'].duplicated(keep=False) # retain mask of all duplicates
    data['record_number_int'] = data['Record #'].fillna(0).astype(int)
    data['year'] = data['Date'].dt.year
    max_id_per_year = data.groupby('year').record_number_int.max()
    #   Loop through each year containing either nulls or duplicates. Don't use the duplicate_mask because
    #       .duplicated() without keep=False only returns 1 of the duplicates, not both
    for i, df  in data.loc[data['Record #'].isna() | data['Record #'].duplicated()].groupby('year'):
        df['id'] = range(1, len(df) + 1)
        year = df['year'].iloc[0]
        data.loc[df.index, 'Record #'] = (df.id + max_id_per_year[year]).astype(str)
    data['id'] = data.index + 1

    ######### Write text file of all records with a record # that was duplicated
    duplicate_txt_path = os.path.join(os.path.dirname(db_path), 'duplicate_record_numbers.csv')
    data.loc[duplicate_mask].sort_values('record_number_int').to_csv(duplicate_txt_path, index=False)

    ######## Get bear info into bears table and clean up existing bears table records
    #   Drop any records without a matching ID in the data table
    bears = bears.loc[bears['Record Number'].isin(data['Record #'])]\
        .rename(columns=BEAR_COLUMNS)#\
        #.fillna({'bear_number': 1})
    # There are 2 records in the bears table where bear_number is null but there's more than 1 bear. The primary key
    #   for the table is (encounter_id, bear_number) so they each bear_number needs to be unique per encounter
    null_bear_numbers = bears.loc[bears['Record Number'].isin(bears.loc[bears['bear_number'].isna(), 'Record Number'])]
    null_bear_numbers.bear_number = null_bear_numbers.bear_number.astype(float).fillna(1)
    bears.loc[null_bear_numbers.index, 'bear_number'] = null_bear_numbers.groupby('Record Number').bear_number.cumsum()

    #   Replace bear cohort codes here because it'll be easier to deal with codes than long strings
    data['Bear Group'] = data['Bear Group'].str.replace('[\s]+', ' ', regex=True)\
        .str.replace('w/', 'with').replace(BEAR_COHORT_CODES)\
        .fillna(0).astype(int)
    data.loc[data['Bear Group'] == 0, 'Bear Group'] = None

    #   Fill bears table for any encounters without a matching record
    df = data.merge(bears.loc[:, ['Record Number']], left_on='Record #', right_on='Record Number', how='left')
    missing_bears = df.loc[df['Record Number'].isna() & ~df['Bear Group'].isna()]
    bear_rows = []
    #   Use 1-to-many relationship to create a new missing_bear row for each bear in the cohort
    #       (as defined in BEAR_COHORT_CODES_TO_ROWS)
    missing_bears['a'] = 'a'  # constant to merge on
    for code, missing_bear_rows in missing_bears.groupby('Bear Group'):
        bear_info = pd.DataFrame(BEAR_COHORT_CODES_TO_ROWS[int(code)])
        bear_info['a'] = 'a'
        bear_rows.append(missing_bear_rows.merge(bear_info, on='a'))
    missing_bear_rows = pd.concat(bear_rows).loc[:,
                        ['Record #', 'Bear Species', 'bear_sex_code', 'bear_age_code', 'bear_number']] \
        .rename(columns=BEAR_COLUMNS)

    #   Map bears to bear groups in data table to fill in cohort codes
    data['temp_id'] = data.index.copy() # copy the index so after the merge, the index can be used to assign back to data
    missing_cohort_ids = data.loc[data['Bear Group'].isna() & data['Record #'].isin(bears['Record Number']), 'Record #']
    bears_missing_cohort = bears[bears['Record Number'].isin(missing_cohort_ids)]
    bears_missing_cohort.bear_age_code = bears_missing_cohort.bear_age_code \
        .fillna(5).astype(str)\
        .str.replace('\s+', ' ', regex=True)\
        .replace(BEAR_AGE_CODES)
    bear_cohorts = pd.DataFrame({'bear_cohort_code':
        bears_missing_cohort
            .groupby('Record Number')
            .bear_age_code.apply(lambda x: sorted(x)).astype(str)})\
        .reset_index()\
        .replace({'bear_cohort_code': BEAR_AGES_TO_COHORT})
    bear_cohorts.loc[~bear_cohorts.bear_cohort_code.isin(BEAR_COHORT_CODES.values()), 'bear_cohort_code'] = 6
    merged = data.loc[missing_cohort_ids.index].merge(bear_cohorts, left_on='Record #', right_on='Record Number').set_index('temp_id')
    data.loc[missing_cohort_ids.index, 'Bear Group'] = merged.bear_cohort_code

    #   Add missing bears after mapping bears to encounters
    #   Replace values with codes
    bears = bears.append(missing_bear_rows.rename(columns={'Record #': 'Record Number'}), ignore_index=True)\
        .rename(columns=BEAR_COLUMNS) \
        .replace({'bear_species_code': BEAR_SPECIES_CODES,
                  'bear_color_code': BEAR_COLOR_CODES,
                  'bear_sex_code': SEX_CODES,
                  'bear_age_code': BEAR_AGE_CODES})

    ######## Add id field to bears table
    #   Should be 1 -> many relationship so merge should chance the index, but just in case, record index in temp field
    bears['temp_id'] = bears.index
    bears['encounter_id'] = bears.merge(data.drop(columns='temp_id'), left_on='Record Number', right_on='Record #', how='left').set_index('temp_id').id

    bears = bears.reindex(columns=list(BEAR_COLUMNS.values()) + ['encounter_id'])

    # There are some bears that have duplicate
    bears.bear_number = bears.bear_number.astype(int)
    duplicate_encounter_ids = bears.loc[bears.duplicated(subset=['encounter_id', 'bear_number'], keep=False), 'encounter_id'].unique()
    duplicate_keys = bears.loc[bears.encounter_id.isin(duplicate_encounter_ids)]
    #duplicate_keys.bear_number = duplicate_keys.bear_number.astype(int)
    gb = duplicate_keys.groupby('encounter_id')
    bears.loc[duplicate_keys.index, 'bear_number'] = gb.bear_number.transform('min') + gb.bear_number.cumcount()

    ######## Set DENA record number to YYxxDENAxxx (i.e., first two digits are year and last 3 are the ID for that year)
    #   The record number in the Access DB uses a mask so the only actual data recorded are the yy and ID for the year
    data['incident_id'] = [f'20{i[:2]}DENA{i[2:]}' if i else '' for i in data['Record #']]

    ######## Handle reactions columns
    data = data.replace({'1st Bear React': BEAR_REACTION_CODES,
                         '2nd Bear React': BEAR_REACTION_CODES,
                         'Person React': HUMAN_REACTION_CODES
                         })

    pg_column_info = pd.Series({'table_name': 'reactions', 'column_name': 'reaction_code'})
    other_1st_bear_react, _, _ = handle_other(data, '1st Bear React', pg_column_info, BEAR_REACTION_CODES, pg_engine, inplace=False)
    other_2nd_bear_react, _, _ = handle_other(data, '2nd Bear React', pg_column_info, BEAR_REACTION_CODES, pg_engine, inplace=False)
    other_person_react, _, _ = handle_other(data, 'Person React', pg_column_info, HUMAN_REACTION_CODES, pg_engine, inplace=False)
    data.loc[other_1st_bear_react.index, 'other_1st_bear_react'] = other_1st_bear_react
    data.loc[other_2nd_bear_react.index, 'other_2nd_bear_react'] = other_2nd_bear_react
    data.loc[other_person_react.index, 'other_person_react'] = other_person_react
    data.loc[set(other_1st_bear_react.index.tolist() + other_2nd_bear_react.index.tolist()), ['1st Bear React', '2nd Bear React']] = 113
    data.loc[other_person_react.index, 'Person React'] = 10

    # Remove "rated by" entry that accidentally has a URL instead of a name
    data.loc[data['Rated By'].str.len() > 50, 'Rated By'] = None

    # Create reactions table
    data.fillna({'1st Bear React': -100, 'Person React': -1, '2nd Bear React': -9999}, inplace=True)
    reactions = pd.concat([
            pd.DataFrame({
                'encounter_id': data['id'],
                'reaction_code': data['1st Bear React'],
                'reaction_order': 1,
                'other_reaction': data['other_1st_bear_react']
            }),
            pd.DataFrame({
                'encounter_id': data['id'],
                'reaction_code': data['Person React'],
                'reaction_order': 2,
                'other_reaction': data['other_person_react']
            }),
            pd.DataFrame({
                'encounter_id': data['id'],
                'reaction_code': data['2nd Bear React'],
                'reaction_order': 3,
                'other_reaction': data['other_2nd_bear_react']
            })
        ])\
        .sort_values(['encounter_id', 'reaction_order'])\
        .reset_index(drop=True)
    reactions = reactions.loc[reactions.reaction_code != -9999]

    #reactions['id'] = reactions.index + 1

    ######## Clean up deterrents used
    data['Deterents Used'] = data['Deterents Used'].replace(DETERRENT_TYPE_CODES)
    deterrents_used = data.loc[(data['Deterents Used'] != 'No') & ~data['Deterents Used'].isna(),
                               ['id', 'Deterents Used', 'Deterent Disc']]\
        .rename(columns={'id': 'encounter_id',
                         'Deterents Used': 'deterrent_type_code',
                         'Deterent Disc': 'other_deterrent_type'
                         })

    ######## Parse structure description into structure type
    data['structure_type_code'] = data['Structure Description'].replace(STRUCTURE_TYPE_CODES)
    structure_interactions = data.loc[~data.structure_type_code.isna(),
                                      ['id', 'structure_type_code', 'Structure Description']]\
        .rename(columns={'id': 'encounter_id',
                         'Structure Description': 'structure_description'
                         })

    ######## Parse road mile
    #   'Road Mile' column is empty so just create the correctly named column
    data['road_mile'] = data.loc[data['Developed Area'].fillna('').str.contains('Park Road', flags=re.IGNORECASE),
                                    'Developed Area Detail']\
        .fillna('').str.extract(r'mile\s*(\d+\.*\d*)', flags=re.IGNORECASE).dropna().astype(float)
    area_with_road_mile = data.loc[data['Developed Area'].fillna('').str.contains('I.  Park Road/Roadside Mile #*\s*\d'), 'Developed Area']
    data.loc[area_with_road_mile.index, 'Developed Area'] = 11 # set to code for Park Road place name
    data.loc[area_with_road_mile.index, 'road_mile'] = area_with_road_mile\
        .str.replace('\s*I\.\s*Park Road/Roadside Mile #*\s*', '')\
        .astype(float)

    ######## Clean up other columns
    data = data.replace({
        'Food Description': {'n/a': None},
        'Property Description': {'n/a': None}
        })
    data['How close'] = data['How close'].replace(CLOSEST_DISTANCE_VALUES).astype(float)


    ######## Replace lookup values
    with pg_engine.connect() as conn:
        boolean_response_codes = pd.read_sql_table('boolean_response_codes', conn).set_index('name').code

    replace_dict = {
        'Group Type': HUMAN_GROUP_CODES,
        'Activity': GENERAL_HUMAN_ACTIVITY_CODES,
        'Prob Cause': REPORTED_PROBABLE_CAUSE_CODES,
        'Veg Type': HABITAT_TYPE_CODES,
        'Visibility': VISIBILITY_CODES,
        'Bear Activity': INITIAL_BEAR_ACTION_CODES,
        'Making noise': boolean_response_codes,
        'Person Activity': INITIAL_HUMAN_ACTIVITY_CODES,
        'Food Present': FOOD_PRESENT_CODES,
        'Food Eaten': boolean_response_codes,
        'Bear behav rate': PROBABLE_CAUSE_CODES,
        'Manage rate':  MANAGEMENT_CLASSIFICATION_CODES,
        'Developed Area': PLACE_NAME_CODES,
        'Bear Charge': boolean_response_codes,
        'Country': COUNTRY_CODES
    }

    def get_number(x):
        try:
            int(float(x))
            return x
        except:
            return None

    with pg_engine.connect() as conn:
        states = pd.read_sql_table('state_codes', conn)

    short_states = states.set_index('short_name').code.to_dict()
    long_states = states.set_index('name').code.to_dict()
    data['State/Prov'] = data['State/Prov']\
        .replace(long_states)\
        .str.upper().replace(short_states)\
        .apply(get_number)

    data = data.replace(replace_dict)
    for column_name, value_map in replace_dict.items():
        if value_map is not boolean_response_codes and column_name in DATA_COLUMNS.column_name:
            handle_other(data, column_name, DATA_COLUMNS.loc[column_name], value_map, pg_engine)

    ####### People
    # Make people table. In the old DB, there's just a single "Name" column that contains both first and last name, but
    #   also multiple names in the same row. Split each one into first/last name pairs by any of a host of separators
    split_names = data['Name'].str.split('\s*,\s*|\s*/\s*|\s+and\s+|\s*&\s*|\s*\+\s*|\s*\n\s*|\s*\r\s*') \
        .explode() \
        .str.split(n=1, expand=True) \
        .rename(columns={0: 'first_name', 1: 'last_name'}) \
        .dropna(how='all')

    # There are several people with the same last name entered as John and Jane Doe or Jane + John Doe. Try to fill
    #   the last names for the first people in these combo entries
    split_names.reset_index(inplace=True) #need to make sure the index is unique (for each person)
    split_names['reset_index'] = split_names.index # record new index in a column to keep track of rows' relative position

    # Get people missing the last name
    missing_last = split_names.loc[split_names.last_name.isna()]

    # Get the people that have a last name and came from an original row with a peerson missing a last name
    has_last = split_names.loc[split_names['index'].isin(missing_last['index']) & ~split_names.last_name.isna()]

    # For any people missing a last name, assign the last name of the next person (from the same original record) who
    #   has a last name given. Do so by finding the minimum difference in reset_index as long as that difference is positive
    merged = missing_last.merge(has_last, how='left', on='index')
    merged['reset_diff'] = merged.reset_index_y - merged.reset_index_x
    last_name_index = merged.loc[merged.reset_diff > 0].groupby('reset_index_x').reset_diff.idxmin().dropna()
    merged.loc[last_name_index, 'last_name_x'] = merged.loc[last_name_index, 'last_name_y']
    filled_last_names = merged.dropna(subset=['last_name_x']).set_index('reset_index_x')
    split_names.loc[filled_last_names.index, 'last_name'] = filled_last_names.last_name_x

    people = split_names.merge(data, left_on='index', right_index=True)\
        .rename(columns=PEOPLE_COLUMNS)\
        .reindex(columns=PEOPLE_COLUMNS.values())

    data = data.rename(columns=DATA_COLUMNS.column_name)

    ######## Import into DB
    out_dir = os.path.join(os.path.dirname(db_path), 'delete')
    with pg_engine.connect() as conn, conn.begin():
        # All other data tables refer to encounters (id) so make sure it gets imported first
        column_names = DATA_COLUMNS.loc[DATA_COLUMNS.table_name == 'encounters', 'column_name'].tolist() + ['id']
        data.loc[:, column_names].to_sql('encounters', conn, if_exists='append', index=False)#.to_csv(os.path.join(out_dir, 'encounters.csv'), index=False)#

        for table_name, info in DATA_COLUMNS.loc[DATA_COLUMNS.table_name != 'encounters'].groupby('table_name'):
            column_names = info.column_name.tolist() + ['encounter_id']
            data.rename(columns={'id': 'encounter_id'})\
                .loc[:, column_names]\
                .to_sql(table_name, conn, if_exists='append', index=False)#.to_csv(os.path.join(out_dir, table_name + '.csv'), index=False)#

        try:
            bears.to_sql('bears', conn, if_exists='append', index=False)#.to_csv(os.path.join(out_dir, 'bears.csv'), index=False)#
        except:
            import pdb; pdb.set_trace()
        reactions.to_sql('reactions', conn, if_exists='append', index=False)#.to_csv(os.path.join(out_dir, 'reactions.csv'), index=False)#
        deterrents_used.to_sql('deterrents_used', conn, if_exists='append', index=False)#.to_csv(os.path.join(out_dir, 'deterrents_used.csv'), index=False)#
        structure_interactions.to_sql('structure_interactions', conn, if_exists='append', index=False)#.to_csv(os.path.join(out_dir, 'structure_interactions.csv'), index=False)#'''
        people.to_sql('people', conn, if_exists='append', index=False)


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:]))