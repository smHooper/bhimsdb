import os
from configparser import ConfigParser


__all__ = ['initialize',
           'read']


_config = None


def initialize(environment):
    """Initialize a connection to a configuration file.

    Args:
        environment:
    """

    global _config

    config_file = f"\\\\INPDENATERM01\\bhims\config\{environment}.config"  # TODO
    _config = ConfigParser()
    _config.read(config_file)


def read(section, option=None):
    """Read in a specific section or option from a specific section from the load configuration file.

    The global configuration file variable must be initialized prior to reading from it.

    Args
        section: Section of the configuration file to read from.
        option: Option in the requested section of the configuration file to return.
    """

    assert _config, "Config file initialization require before reading."

    if option:
        return _config.get(section, option)
    else:
        return dict(_config.items(section))
