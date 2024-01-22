from _access_to_pg import *

def main(connection_txt):

    engine = db_utils.connect_pg_db(connection_txt)
    inspector = sqlalchemy.inspect(engine)
    table_names = inspector.get_table_names()

    codes = {k.lower(): v for k, v in globals().items() if k.endswith('_CODES') and k.lower() in table_names}
    codes_with_letters = {
        name: pd.Series(
            {v: re.findall('^[A-Z0-9]\. ', k)[0] for k, v in code_dict.items() if re.match('^[A-Z0-9]\. ', k)},
            dtype=object, name='letter')
        for name, code_dict in codes.items()
    }

    db_codes = {table_name: pd.read_sql('SELECT code, name FROM ' + table_name, engine) for table_name, code_dict in
                codes_with_letters.items() if len(code_dict.keys())}

    for table_name, db_codes_ in db_codes.items():
        letters = codes_with_letters[table_name]
        merged = pd.merge(db_codes_, letters, how='left', left_on='code', right_index=True)
        merged['name'] = merged.letter + merged['name']
        merged.dropna(subset='name', inplace=True)
        print(merged)