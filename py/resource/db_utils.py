import sqlalchemy


def connect_pg_db(connection_txt):

    connection_info = {}
    with open(connection_txt) as txt:
        for line in txt.readlines():
            if ';' not in line:
                continue
            param_name, param_value = line.split(';')
            connection_info[param_name.strip()] = param_value.strip()

    try:
        engine = sqlalchemy.create_engine(
            'postgresql://{username}:{password}@{ip_address}:{port}/{db_name}'.format(**connection_info))
    except:
        message = '\n\t' + '\n\t'.join(['%s: %s' % (k, v) for k, v in connection_info.items()])
        raise ValueError('could not establish connection with parameters:%s' % message)

    return engine