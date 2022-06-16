import sys
import pyodbc
import pandas as pd

from py.resource import db_utils


def main(akro_db_path, dena_db_path, connection_txt):

    akro_conn = pyodbc.connect(r'DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};'
                                 r'DBQ=%s' % akro_db_path)
    dena_conn = pyodbc.connect(r'DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};'
                             r'DBQ=%s' % dena_db_path)
    engine = db_utils.connect_pg_db(connection_txt)

    with engine.connect() as conn, conn.begin():
        pd.read_sql('SELECT * FROM refHumanInjury', akro_conn) \
            .drop([8, 9])\
            .rename(columns={'HumanInjuryCode': 'code', 'HumanInjury': 'value'})\
            .to_sql('human_injury_codes', index=False, if_exists='append')

        name = 'LocationQuality'
        df = pd.read_sql(f'SELECT * FROM ref{name}', akro_conn)
        df.rename(columns={f'{name}Code': 'code', name: 'value'})\
            .to_sql('location_accuracy_codes', conn, if_exists='append', index=False)

        name = 'NoiseMaking'
        df = pd.read_sql(f'SELECT * FROM ref{name}', akro_conn)
        df.loc[df[f'{name}Code'] > 1000]\
            .rename( columns={f'{name}Code': 'code', name: 'value'})\
            .to_sql('making_noise_codes', conn, if_exists='append', index=False)

        name = 'Park'
        df = pd.read_sql(f'SELECT * FROM ref{name}', akro_conn)
        df.rename(columns={f'{name}Code': 'code', f'{name}Name': 'name'})\
            .loc[[len(n) == 4 for n in df.code], ['code', 'name']]\
            .to_sql('making_noise_codes', conn, if_exists='append', index=False)

        name = 'InfoSource'
        pd.read_sql(f'SELECT * FROM ref{name}', akro_conn)\
            .rename(columns={f'{name}Code': 'code', f'{name}': 'name'})\
            .to_sql('report_source_codes', conn, if_exists='append', index=False)

        # Too many typos and things to fix for place names lookup so just make it manually
        df = pd.DataFrame({'name': [
            'Entrance area trails',
            'Savage area trails',
            'Eieson area trails',
            'Riley Creek Campground',
            'Savage Campground',
            'Sanctuary Campground',
            'Teklanika Campground',
            'Igloo Campground',
            'Wonder Lake Campground',
            'Teklanika Rest Area',
            'Park Road/roadside mile #',
            'Specific location',
            'Polychrome Overlook',
            'Toklat Rest Area',
            'Stony Hill Overlook',
            'Kantishna developed area',
            'Headquaters area',
            'C-Camp',
            'Toklat Road Camp',
            'Concessionaire housing',
            'Backside (Moraine) Lake',
            'Other location']
        })
        df['code'] = df.index + 1
        df.to_sql('place_name_codes', conn, index=False, if_exists='append')

    akro_conn.close()


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:]))